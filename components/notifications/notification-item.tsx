"use client";

import type { Notification, NotificationType } from "@/lib/types";
import {
  X,
  AlertCircle,
  Info,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  UserCheck,
  UserX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NotificationItemProps = {
  notification: Notification;
  onAction: (notification: Notification) => void;
  onDismiss: (id: string) => void;
};

const iconMap: Record<NotificationType, LucideIcon> = {
  report_malfunction: AlertCircle,
  report_general: Info,
  report_scrap: AlertTriangle,
  session_started: UserCheck,
  session_completed: CheckCircle2,
  session_aborted: UserX,
  first_product_qa_pending: ClipboardCheck,
  job_due_soon: Clock,
  crud_success: CheckCircle2,
  crud_error: X,
};

const colorMap: Record<NotificationType, string> = {
  report_malfunction: "text-red-400 bg-red-500/10",
  report_general: "text-blue-400 bg-blue-500/10",
  report_scrap: "text-yellow-400 bg-yellow-500/10",
  session_started: "text-emerald-400 bg-emerald-500/10",
  session_completed: "text-emerald-400 bg-emerald-500/10",
  session_aborted: "text-red-400 bg-red-500/10",
  first_product_qa_pending: "text-amber-500 bg-amber-500/10",
  job_due_soon: "text-orange-400 bg-orange-500/10",
  crud_success: "text-emerald-400 bg-emerald-500/10",
  crud_error: "text-red-400 bg-red-500/10",
};

const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const NotificationItem = ({
  notification,
  onAction,
  onDismiss,
}: NotificationItemProps) => {
  const Icon = iconMap[notification.notification_type];
  const colorClass = colorMap[notification.notification_type];
  const hasAction = !!notification.action_type;
  const isQA = notification.notification_type === "first_product_qa_pending";

  const handleClick = () => {
    if (hasAction) {
      onAction(notification);
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDismiss(notification.id);
  };

  const Wrapper = hasAction ? "button" : "div";

  return (
    <Wrapper
      type={hasAction ? "button" : undefined}
      className={`flex w-full items-start gap-3 p-3 text-start transition-colors ${
        hasAction
          ? "cursor-pointer hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          : ""
      } ${notification.is_read ? "opacity-60" : ""} ${
        isQA && !notification.is_read ? "bg-amber-500/5 border-s-2 border-amber-500/50" : ""
      }`}
      onClick={hasAction ? handleClick : undefined}
    >
      {!notification.is_read && (
        <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
      )}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colorClass}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-medium text-foreground">
            {notification.title}
          </div>
          <div
            role="button"
            tabIndex={0}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
            onClick={handleDismiss}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleDismiss(e as unknown as React.MouseEvent);
              }
            }}
          >
            <X className="h-3 w-3" />
          </div>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
          {notification.message}
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground/70">
          {formatTime(notification.created_at)}
        </div>
      </div>
    </Wrapper>
  );
};
