"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ChatAvatar } from "@/components/chat-avatar";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { ChatListItem } from "@/queries";

export function ChatSearch({ chats }: { chats: ChatListItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 font-normal text-muted-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0"
            onClick={() => setOpen(true)}
            tooltip="Search"
            aria-label="Search"
          >
            <SearchIcon />
            <span className="flex-1 truncate text-left group-data-[collapsible=icon]:hidden">
              Search
            </span>
            <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">⌘K</Kbd>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search chats"
        description="Search your chats by bot name or latest message."
      >
        <Command>
          <CommandInput placeholder="Search chats..." />
          <CommandList>
            <CommandEmpty>No chats found.</CommandEmpty>
            <CommandGroup heading="Chats">
              {chats.map((chat) => {
                const name = chat.bot?.name ?? chat.name ?? "New chat";

                return (
                  <CommandItem
                    key={chat.id}
                    value={[name, chat.lastMessagePreview ?? ""].join(" ")}
                    className="items-start gap-2.5 py-2"
                    onSelect={() => {
                      setOpen(false);
                      router.push(`/chats/${chat.id}`);
                    }}
                  >
                    <ChatAvatar
                      seed={chat.bot?.avatar ?? chat.id}
                      className="size-8 shrink-0"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{name}</span>
                        <CommandShortcut className="shrink-0 tracking-normal">
                          {formatDistanceToNowStrict(chat.lastMessageAt)}
                        </CommandShortcut>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {chat.lastMessagePreview}
                      </span>
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
