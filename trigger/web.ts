import { google } from "@ai-sdk/google"
import { generateText } from "ai"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

import { chatModel } from "@/trigger/model"

// The web, from the agent's backend rather than the bot's sandbox: Daytona
// limits sandboxes on lower tiers to package registries and code hosts, but
// this worker can reach the open internet.

const SEARCH_TIMEOUT_MS = 30_000
const FETCH_TIMEOUT_MS = 15_000
const MAX_PAGE_BYTES = 3_000_000
const MAX_PAGE_CHARS = 30_000
const MAX_REDIRECTS = 5

export type SearchResult = {
  query: string
  /** A short answer written from the results. */
  summary: string
  sources: Array<{ title: string; url: string; snippet?: string }>
  engine: "tavily" | "google" | "wikipedia"
}

async function searchWithTavily(query: string, apiKey: string) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, max_results: 6, include_answer: true }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`Search failed (Tavily ${response.status})`)
  }
  const data = (await response.json()) as {
    answer?: string
    results?: Array<{ title: string; url: string; content?: string }>
  }
  return {
    query,
    summary: data.answer ?? "",
    sources: (data.results ?? []).map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.content?.slice(0, 300),
    })),
    engine: "tavily" as const,
  }
}

// Gemini with Google Search grounding: no extra key, the same Gemini key the
// bots already use. A separate call, so search never mixes with the bot's own
// tools in one request.
async function searchWithGoogle(query: string) {
  const result = await generateText({
    model: chatModel(),
    tools: { google_search: google.tools.googleSearch({}) },
    prompt: `Search the web for: ${query}\n\nReply with the key facts you found, in a few short sentences, with dates where they matter. No preamble.`,
    abortSignal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    maxRetries: 1,
  })

  const sources = result.sources
    .filter((source) => source.sourceType === "url")
    .map((source) => ({
      title: source.title ?? new URL(source.url).hostname,
      url: source.url,
    }))

  return {
    query,
    summary: result.text.trim(),
    sources,
    engine: "google" as const,
  }
}

// Keyless, and always answers, but only covers Wikipedia: the last resort
// when neither Tavily nor Gemini can search (no key, or quota used up).
async function searchWithWikipedia(query: string) {
  const url = new URL("https://en.wikipedia.org/w/api.php")
  url.search = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "6",
    format: "json",
    origin: "*",
  }).toString()
  const response = await fetch(url, {
    headers: { "user-agent": "ai-bots/1.0 (web search fallback)" },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`Search failed (Wikipedia ${response.status})`)
  }
  const data = (await response.json()) as {
    query?: { search?: Array<{ title: string; snippet: string }> }
  }
  const hits = data.query?.search ?? []
  return {
    query,
    summary:
      hits.length > 0
        ? "Only Wikipedia could be searched right now. Read a source with fetchPage for details."
        : "Nothing found on Wikipedia, the only search available right now.",
    sources: hits.map((hit) => ({
      title: hit.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`,
      snippet: decodeEntities(hit.snippet.replace(/<[^>]+>/g, "")),
    })),
    engine: "wikipedia" as const,
  }
}

/**
 * Searches the web and returns a short answer with its sources: Tavily when
 * TAVILY_API_KEY is set, otherwise Gemini with Google Search, and Wikipedia
 * when those can't answer, so a search never comes back empty-handed.
 */
export async function searchWeb(query: string): Promise<SearchResult> {
  const tavilyKey = process.env.TAVILY_API_KEY?.trim()
  const engines = [
    ...(tavilyKey ? [() => searchWithTavily(query, tavilyKey)] : []),
    () => searchWithGoogle(query),
    () => searchWithWikipedia(query),
  ]

  let lastError: unknown
  for (const engine of engines) {
    try {
      const result = await engine()
      if (result.summary || result.sources.length > 0) {
        return result
      }
    } catch (error) {
      lastError = error
      console.warn("Web search engine failed, trying the next", error)
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Search failed")
}

// Addresses a page fetch must never reach: this machine, private networks,
// link-local (cloud metadata) and the like.
function isPrivateAddress(address: string) {
  if (isIP(address) === 6) {
    const lower = address.toLowerCase()
    if (lower.startsWith("::ffff:")) {
      return isPrivateAddress(lower.slice(7))
    }
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80")
    )
  }
  const [a, b] = address.split(".").map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

async function assertPublicUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error("That isn't a valid URL")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https pages can be read")
  }
  const host = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true })).map((entry) => entry.address)
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error("That address isn't on the public internet")
  }
  return url
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

function decodeEntities(text: string) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#")) {
      const value =
        code[1].toLowerCase() === "x"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10)
      return Number.isFinite(value) ? String.fromCodePoint(value) : match
    }
    return ENTITIES[code.toLowerCase()] ?? match
  })
}

/** Readable text from an HTML page: no scripts, styles or markup. */
function htmlToText(html: string) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  const body = html
    .replace(/<(script|style|noscript|svg|template|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<\/(p|div|section|article|li|h[1-6]|tr|br|header|footer)>/gi,
      "\n"
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
  const text = decodeEntities(body)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return { title: title ? decodeEntities(title).trim() : undefined, text }
}

async function readBody(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) {
    return ""
  }
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < MAX_PAGE_BYTES) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }
    chunks.push(value)
    size += value.length
  }
  await reader.cancel().catch(() => undefined)
  return new TextDecoder().decode(Buffer.concat(chunks))
}

export type PageResult = {
  url: string
  title?: string
  text: string
  truncated: boolean
}

/** Reads a public web page as text. Redirects are checked hop by hop. */
export async function fetchPage(raw: string): Promise<PageResult> {
  let url = await assertPublicUrl(raw)

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; ai-bots/1.0)",
        accept:
          "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    const location = response.headers.get("location")
    if (response.status >= 300 && response.status < 400 && location) {
      url = await assertPublicUrl(new URL(location, url).toString())
      continue
    }
    if (!response.ok) {
      throw new Error(`The page answered ${response.status}`)
    }

    const type = response.headers.get("content-type") ?? ""
    if (!/text\/|json|xml/.test(type)) {
      throw new Error(
        `That's not a page I can read (${type || "unknown type"})`
      )
    }

    const body = await readBody(response)
    const { title, text } = /html/.test(type)
      ? htmlToText(body)
      : { title: undefined, text: body.trim() }

    return {
      url: url.toString(),
      title,
      text: text.slice(0, MAX_PAGE_CHARS),
      truncated: text.length > MAX_PAGE_CHARS,
    }
  }

  throw new Error("Too many redirects")
}
