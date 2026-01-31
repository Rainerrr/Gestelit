"use client";

import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNotification } from "@/contexts/NotificationContext";
import { NotificationItem } from "./notification-item";
import type { Notification } from "@/lib/types";

export const NotificationCenter = () => {
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    clearAll,
  } = useNotification();
  const router = useRouter();

  const handleAction = async (notification: Notification) => {
    await markAsRead(notification.id);

    if (!notification.action_type || !notification.action_payload) return;

    const payload = notification.action_payload;

    switch (notification.action_type) {
      case "view_report": {
        const reportType = payload.reportType as string;
        if (reportType === "malfunction") {
          router.push("/admin/reports/malfunctions");
        } else if (reportType === "general") {
          router.push("/admin/reports/general");
        } else if (reportType === "scrap") {
          router.push("/admin/reports/scrap");
        }
        break;
      }
      case "view_session": {
        router.push("/admin/history");
        break;
      }
      case "approve_qa": {
        router.push("/admin/jobs");
        break;
      }
      case "view_job": {
        router.push("/admin/jobs");
        break;
      }
      case "view_maintenance": {
        router.push("/admin/maintenance");
        break;
      }
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label="התראות"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-80 sm:w-96 max-h-[500px] overflow-hidden p-0 border-border bg-card"
        dir="rtl"
      >
        <div className="flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">התראות</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void markAllAsRead()}
                  className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="h-3 w-3" />
                  <span>סמן הכל כנקרא</span>
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void clearAll()}
                  className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-transparent border-t-primary" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              אין התראות
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[400px] divide-y divide-border/50">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onAction={(n) => void handleAction(n)}
                  onDismiss={(id) => void dismissNotification(id)}
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
