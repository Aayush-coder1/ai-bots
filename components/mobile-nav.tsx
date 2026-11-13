"use client"

import { usePathname } from "next/navigation"

import { SidebarTrigger } from "@/components/ui/sidebar"

/**
 * The button that opens the sidebar on a phone, on every dashboard page.
 * Chats carry their own in the chat header.
 */
export function MobileNav() {
  const pathname = usePathname()
  if (pathname.startsWith("/chats/")) {
    return null
  }
  return <SidebarTrigger className="absolute top-3 left-3 z-10 md:hidden" />
}
