import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { getChats } from "@/queries"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [chats, cookieStore] = await Promise.all([getChats(), cookies()])
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    // Pinned to the viewport so pages scroll inside their own regions (the chat
    // messages) rather than the whole window.
    <SidebarProvider defaultOpen={defaultOpen} className="h-svh">
      <AppSidebar chats={chats} />
      <SidebarInset className="min-h-0 overflow-hidden">
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
