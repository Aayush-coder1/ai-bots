import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getChats } from "@/queries/bots";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const chats = await getChats();

  return (
    <SidebarProvider>
      <AppSidebar chats={chats} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
