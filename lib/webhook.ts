import { isAllowedWebhook } from "@/db/schema"

// Sends an automation's result to the chat app the user chose. Only the
// hosts in WEBHOOK_HOSTS are ever contacted, so a saved URL can't be used to
// reach anything else from the worker.

function truncate(text: string, max: number) {
  return text.length > max
    ? `${text.slice(0, max - 40).trimEnd()}\n\n…(cut short, see the full result in ai-bots)`
    : text
}

export async function deliverToWebhook(
  webhookUrl: string,
  title: string,
  body: string
) {
  if (!isAllowedWebhook(webhookUrl)) {
    return false
  }
  const url = new URL(webhookUrl)
  const message = `**${title}**\n\n${body}`

  let target = webhookUrl
  let payload: Record<string, unknown>
  if (url.hostname === "hooks.slack.com") {
    payload = { text: truncate(`*${title}*\n\n${body}`, 3500) }
  } else if (url.hostname === "api.telegram.org") {
    // https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>
    const chatId = url.searchParams.get("chat_id")
    if (!chatId || !/^\/bot[^/]+\/sendMessage$/.test(url.pathname)) {
      return false
    }
    url.search = ""
    target = url.toString()
    payload = {
      chat_id: chatId,
      text: truncate(`${title}\n\n${body}`, 4000),
      disable_web_page_preview: true,
    }
  } else {
    payload = { content: truncate(message, 1900) }
  }

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      // A redirect could point somewhere that isn't on the allow-list.
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    })
    return response.ok
  } catch {
    // Never log the URL: it carries the webhook's secret.
    console.warn("Webhook delivery failed")
    return false
  }
}
