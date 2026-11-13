import type { Metadata } from "next"

import { LegalPage } from "@/components/legal-page"
import { GITHUB_URL } from "@/lib/github"

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using ai-bots.",
}

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="13 November 2026"
      intro="These are the terms for using ai-bots, a service run by an individual developer, Aayush Wanve. By using the app you agree to them."
      sections={[
        {
          title: "The service",
          body: [
            "ai-bots lets you create AI bots that have their own cloud computers, run tasks for you on a schedule, and, if you connect a device, work inside a folder you choose on that device.",
            "The bots are driven by an AI model. They can be wrong, misread a page or fail a task. Check results that matter before you rely on them.",
          ],
        },
        {
          title: "Your responsibilities",
          body: [
            "You are responsible for the tasks you give your bots and for what they do on your behalf, including on the devices you connect.",
            "Don't use ai-bots to break the law, to access systems or data you are not allowed to access, to send spam, to harass anyone, or to collect personal data you have no right to collect. Follow the terms of the websites your bots visit.",
            "When you connect a device, share only a folder you are comfortable letting a bot change, and keep approval on unless you understand the risk of turning it off.",
          ],
        },
        {
          title: "Plans and payment",
          body: [
            "Paid plans are billed monthly in advance and renew until you cancel. You can cancel at any time from the pricing page; the plan stays active until the end of the period you paid for.",
            "Each plan includes allowances for a billing period. When an allowance is used up, bots stop using it until the period resets. You are never charged beyond the plan price.",
          ],
        },
        {
          title: "Availability",
          body: [
            "ai-bots is provided as it is. It depends on other services (the AI model, cloud computers, hosting) and can be slow or unavailable at times. Features may change.",
            "Accounts that abuse the service or put it or other people at risk may be suspended.",
          ],
        },
        {
          title: "Liability",
          body: [
            "To the extent the law allows, ai-bots is not liable for indirect or consequential losses, or for loss of data on devices you connect. Keep backups of anything important.",
          ],
        },
        {
          title: "Contact",
          body: [
            `Questions about these terms: open an issue at ${GITHUB_URL}/issues or message @aayucooldev on X.`,
          ],
        },
      ]}
    />
  )
}
