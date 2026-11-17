import { MessageSquare } from "lucide-react";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { AdminChatConsole } from "@/components/chat/chat-ui";

export default function AdminMessagesPage() {
  return (
    <AdminLayout
      header={
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold text-foreground sm:text-xl">
              הודעות
            </h1>
            <p className="text-xs text-muted-foreground">
              שיחות תפעוליות בין מנהלים לעובדי הייצור
            </p>
          </div>
        </div>
      }
      aiContext={{
        screen: "admin-chat",
        visibleSummary: "מסך שיחות תפעוליות בין מנהלים לעובדים בסשנים פעילים.",
      }}
    >
      <AdminChatConsole />
    </AdminLayout>
  );
}
