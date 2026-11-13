import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { GithubStar } from "@/components/github-star"
import { MobileNav } from "@/components/mobile-nav"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { getBots, getChats } from "@/queries"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [chats, bots, cookieStore] = await Promise.all([
    getChats(),
    getBots(),
    cookies(),
  ])
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    // Pinned to the viewport so pages scroll inside their own regions (the chat
    // messages) rather than the whole window.
    <SidebarProvider defaultOpen={defaultOpen} className="h-svh">
      <AppSidebar chats={chats} bots={bots} />
      <SidebarInset className="min-h-0 overflow-hidden">
        <MobileNav />
        <GithubStar floating />
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
