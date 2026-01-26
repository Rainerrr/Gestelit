"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  fetchNotificationsAdminApi,
  cleanupNotificationsAdminApi,
  updateNotificationAdminApi,
  checkDueJobsAdminApi,
} from "@/lib/api/notifications";
import type { Notification } from "@/lib/types";

type ToastVariant = "success" | "error" | "info" | "warning";

type ToastNotification = {
  id: string;
  variant: ToastVariant;
  title: string;
  message: string;
  exiting: boolean;
};

type NotifyOptions = {
  title: string;
  message: string;
  variant?: ToastVariant;
};

type NotificationContextValue = {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  notify: (options: NotifyOptions) => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismissNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within NotificationProvider");
  }
  return context;
};

const TOAST_VISIBLE_DURATION = 4000;
const TOAST_EXIT_DURATION = 400;
const POLL_FALLBACK_INTERVAL = 5000;
const DUE_JOBS_CHECK_INTERVAL = 3600000;
const MAX_RETRIES = 10;
const MAX_BACKOFF_MS = 30000;

type NotificationProviderProps = {
  children: ReactNode;
};

const notificationTypeToVariant: Record<string, ToastVariant> = {
  report_malfunction: "error",
  report_scrap: "warning",
  report_general: "info",
  session_started: "success",
  session_completed: "success",
  session_aborted: "warning",
  first_product_qa_pending: "warning",
  job_due_soon: "warning",
};

type StreamEvent =
  | { type: "initial"; notifications: Notification[] }
  | { type: "insert"; notification: Notification }
  | { type: "update"; notification: Notification }
  | { type: "delete"; notificationId: string }
  | { type: "error"; message: string };

export const NotificationProvider = ({ children }: NotificationProviderProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [portalMounted, setPortalMounted] = useState(false);
  const mountedRef = useRef(true);
  const lastCleanupRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const backoffTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialLoadDoneRef = useRef(false);

  // Enable portal rendering after hydration
  useEffect(() => {
    setPortalMounted(true);
  }, []);

  // Toast trigger for a notification
  const showNotificationToast = useCallback((n: Notification) => {
    const variant = notificationTypeToVariant[n.notification_type] ?? "info";
    const toastId = `toast-${n.id}`;

    const newToast: ToastNotification = {
      id: toastId,
      variant,
      title: n.title,
      message: n.message,
      exiting: false,
    };

    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === toastId ? { ...t, exiting: true } : t)),
      );
    }, TOAST_VISIBLE_DURATION);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toastId));
    }, TOAST_VISIBLE_DURATION + TOAST_EXIT_DURATION);
  }, []);

  // Manual toast notification (for programmatic use)
  const notify = useCallback((options: NotifyOptions) => {
    const { title, message, variant = "info" } = options;
    const toastId = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const newToast: ToastNotification = {
      id: toastId,
      variant,
      title,
      message,
      exiting: false,
    };

    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === toastId ? { ...t, exiting: true } : t)),
      );
    }, TOAST_VISIBLE_DURATION);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toastId));
    }, TOAST_VISIBLE_DURATION + TOAST_EXIT_DURATION);
  }, []);

  // Polling fallback
  const loadNotifications = useCallback(async () => {
    try {
      const { notifications: data } = await fetchNotificationsAdminApi({ limit: 50 });
      if (mountedRef.current) {
        setNotifications(data);
        setIsLoading(false);
      }
    } catch {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return;
    pollIntervalRef.current = setInterval(() => {
      void loadNotifications();
    }, POLL_FALLBACK_INTERVAL);
  }, [loadNotifications]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // SSE connection
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const url = new URL("/api/admin/notifications/stream", window.location.origin);
    const es = new EventSource(url.toString(), { withCredentials: true });
    eventSourceRef.current = es;

    es.onmessage = (event: MessageEvent<string>) => {
      if (!mountedRef.current) return;

      const payload = JSON.parse(event.data) as StreamEvent;

      if (payload.type === "initial") {
        setNotifications(payload.notifications);
        setIsLoading(false);
        initialLoadDoneRef.current = true;
        retryRef.current = 0;
        stopPolling();
      }

      if (payload.type === "insert") {
        setNotifications((prev) => [payload.notification, ...prev]);
        if (initialLoadDoneRef.current && !payload.notification.is_read) {
          showNotificationToast(payload.notification);
        }
      }

      if (payload.type === "update") {
        setNotifications((prev) =>
          prev.map((n) => (n.id === payload.notification.id ? payload.notification : n)),
        );
      }

      if (payload.type === "delete") {
        setNotifications((prev) =>
          prev.filter((n) => n.id !== payload.notificationId),
        );
      }

      if (payload.type === "error") {
        console.error("[NotificationContext] SSE error event:", payload.message);
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;

      if (!mountedRef.current) return;

      if (retryRef.current >= MAX_RETRIES) {
        startPolling();
        return;
      }

      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** retryRef.current);
      retryRef.current += 1;

      backoffTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };
  }, [showNotificationToast, stopPolling, startPolling]);

  // Main connection effect
  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (backoffTimeoutRef.current) {
        clearTimeout(backoffTimeoutRef.current);
        backoffTimeoutRef.current = null;
      }
      stopPolling();
    };
  }, [connect, stopPolling]);

  // Daily cleanup - run once per day on mount
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (lastCleanupRef.current !== today) {
      lastCleanupRef.current = today;
      void cleanupNotificationsAdminApi().catch(() => {});
    }
  }, []);

  // Check due jobs periodically
  useEffect(() => {
    void checkDueJobsAdminApi().catch(() => {});

    const interval = setInterval(() => {
      void checkDueJobsAdminApi().catch(() => {});
    }, DUE_JOBS_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    await updateNotificationAdminApi(id, { is_read: true }).catch(() => {});
  }, []);

  const markAllAsRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.is_read);
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true })),
    );
    await Promise.all(
      unread.map((n) =>
        updateNotificationAdminApi(n.id, { is_read: true }).catch(() => {}),
      ),
    );
  }, [notifications]);

  const dismissNotification = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await updateNotificationAdminApi(id, { is_dismissed: true }).catch(() => {});
  }, []);

  const clearAll = useCallback(async () => {
    setNotifications([]);
    await cleanupNotificationsAdminApi({ deleteAll: true }).catch(() => {});
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read && !n.is_dismissed).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        notify,
        markAsRead,
        markAllAsRead,
        dismissNotification,
        clearAll,
        refreshNotifications: loadNotifications,
      }}
    >
      {children}
      {/* Toast Container - rendered via portal to escape stacking context */}
      {portalMounted &&
        createPortal(
          <div
            style={{
              position: "fixed",
              zIndex: 9999,
              bottom: "1.5rem",
              left: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              pointerEvents: "none",
              direction: "rtl",
              maxWidth: "min(420px, calc(100vw - 3rem))",
            }}
          >
            {toasts.map((toast) => (
              <ToastItem key={toast.id} toast={toast} />
            ))}
          </div>,
          document.body,
        )}
    </NotificationContext.Provider>
  );
};

const variantStyles: Record<ToastVariant, { bg: string; text: string; border: string; icon: string }> = {
  success: {
    bg: "bg-emerald-950/90",
    text: "text-emerald-100",
    border: "border-emerald-500/50",
    icon: "✓",
  },
  error: {
    bg: "bg-red-950/90",
    text: "text-red-100",
    border: "border-red-500/50",
    icon: "✕",
  },
  warning: {
    bg: "bg-yellow-950/90",
    text: "text-yellow-100",
    border: "border-yellow-500/50",
    icon: "⚠",
  },
  info: {
    bg: "bg-blue-950/90",
    text: "text-blue-100",
    border: "border-blue-500/50",
    icon: "ℹ",
  },
};

const iconBgStyles: Record<ToastVariant, string> = {
  success: "bg-emerald-500/20 text-emerald-300",
  error: "bg-red-500/20 text-red-300",
  warning: "bg-yellow-500/20 text-yellow-300",
  info: "bg-blue-500/20 text-blue-300",
};

const ToastItem = ({ toast }: { toast: ToastNotification }) => {
  const style = variantStyles[toast.variant];
  const iconBg = iconBgStyles[toast.variant];

  return (
    <div
      className={`pointer-events-auto w-full rounded-xl border-2 px-4 py-4 shadow-2xl backdrop-blur-md ${style.bg} ${style.border} ${style.text} ${
        toast.exiting ? "animate-toast-out" : "animate-toast-in"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base font-bold ${iconBg}`}>
          {style.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold leading-tight">{toast.title}</div>
          <div className="mt-1 text-sm opacity-80 leading-snug line-clamp-2">{toast.message}</div>
        </div>
      </div>
    </div>
  );
};
