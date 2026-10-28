"use client";

import { UserButton } from "@clerk/nextjs";
import { formatDistanceToNowStrict } from "date-fns";
import { PlusIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BotDialog } from "@/components/bot-dialog";
import { ChatAvatar } from "@/components/chat-avatar";
import { ChatSearch } from "@/components/chat-search";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import type { ChatListItem } from "@/queries/bots";

export function AppSidebar({ chats }: { chats: ChatListItem[] }) {
  const [botDialogOpen, setBotDialogOpen] = useState(false);

  return (
    <>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <SidebarMenu className="w-fit self-end group-data-[collapsible=icon]:self-center">
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton
                      size="lg"
                      className="size-9 justify-center p-0"
                      aria-label="New chat"
                    />
                  }
                >
                  <PlusIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => setBotDialogOpen(true)}>
                      <PlusIcon />
                      Create new bot
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <UsersIcon />
                      Create group chat
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
          <ChatSearch chats={chats} />
        </SidebarHeader>
        <SidebarContent>
          {chats.length > 0 ? (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {chats.map((chat) => {
                    const name = chat.bot?.name ?? chat.name ?? "New chat";

                    return (
                      <SidebarMenuItem key={chat.id}>
                        <SidebarMenuButton
                          size="lg"
                          className="h-auto items-start gap-2.5 py-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center"
                          tooltip={name}
                          render={
                            <Link
                              href={`/chats/${chat.id}`}
                              aria-label={name}
                            />
                          }
                        >
                          <ChatAvatar
                            seed={chat.bot?.avatar ?? chat.id}
                            className="size-8 shrink-0 group-data-[collapsible=icon]:size-6"
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-medium">
                                {name}
                              </span>
                              <span className="ml-auto shrink-0 text-xs text-sidebar-foreground/60">
                                {formatDistanceToNowStrict(chat.lastMessageAt)}
                              </span>
                            </span>
                            <span className="truncate text-xs text-sidebar-foreground/60">
                              {chat.lastMessagePreview}
                            </span>
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<div />}>
                <UserButton
                  showName
                  appearance={{
                    elements: {
                      rootBox: "w-full min-w-0",
                      userButtonTrigger:
                        "w-full justify-start rounded-md p-0 focus:shadow-none group-data-[collapsible=icon]:justify-center",
                      userButtonBox:
                        "w-full items-center gap-2 group-data-[collapsible=icon]:w-auto",
                      userButtonOuterIdentifier:
                        "truncate text-sm font-medium text-sidebar-foreground group-data-[collapsible=icon]:hidden",
                      avatarBox: "size-8 group-data-[collapsible=icon]:size-6",
                    },
                  }}
                />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <BotDialog
        trigger={null}
        open={botDialogOpen}
        onOpenChange={setBotDialogOpen}
      />
    </>
  );
}
