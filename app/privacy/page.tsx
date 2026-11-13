import type { Metadata } from "next"

import { LegalPage } from "@/components/legal-page"
import { GITHUB_URL } from "@/lib/github"

export const metadata: Metadata = {
  title: "Privacy",
  description: "What ai-bots stores, why, and who processes it.",
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      updated="13 November 2026"
      intro="This page says in plain words what ai-bots stores about you, why, and which services handle it. ai-bots is run by an individual developer, Aayush Wanve."
      sections={[
        {
          title: "What is stored",
          body: [
            "Your account: the email address and name you sign in with, handled by Clerk.",
            "Your bots and conversations: each bot's name, job and instructions, your chat messages and the bots' replies, and the automations you create with their results.",
            "Each bot's memory: notes the bot saves about what you told it, kept as a file on that bot's own cloud computer and deleted when you delete the bot.",
            "Usage records: how many AI tokens, computer seconds, searches and page reads your bots used, so plan limits can be applied.",
            "Connected devices: a name, operating system and the path of the folder you shared, plus the commands bots asked to run there and their output, kept for up to 7 days.",
          ],
        },
        {
          title: "What is never stored",
          body: [
            "Card details: payments are handled by the payment provider, and ai-bots never sees your card number.",
            "Files on your computer: bots can only read files inside the one folder you share, and only when a task needs them. Nothing is copied in bulk.",
            "Your device token and pairing codes are stored only as one-way hashes. A webhook address you add is stored so results can be sent there, and is never shown again in full.",
          ],
        },
        {
          title: "Who processes your data",
          body: [
            "To work, ai-bots sends data to these services: Clerk (sign-in and billing), Neon (database), Google Gemini (the AI model that reads your messages and writes replies), Daytona and E2B (the bots' cloud computers), Trigger.dev (background and scheduled work), Vercel (hosting) and Sentry (error reports, with message text and inputs masked).",
            "When a bot searches the web or opens a page for you, the search terms and page address go to the sites involved.",
            "Your data is not sold and is not used for advertising.",
          ],
        },
        {
          title: "Your choices",
          body: [
            "You can delete a bot (which deletes its computer and memory), a chat, an automation or a connected device at any time from the app.",
            "You can export any chat as Markdown from the chat's header.",
            `To delete your whole account and its data, or to ask a question about privacy, open an issue at ${GITHUB_URL}/issues or message @aayucooldev on X.`,
          ],
        },
        {
          title: "Changes",
          body: [
            "If this page changes in a way that matters, the date at the top changes and the new version applies from then on.",
          ],
        },
      ]}
    />
  )
}
