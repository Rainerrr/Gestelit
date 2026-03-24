"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// ============================================
// TYPES
// ============================================

type ToastVariant = "success" | "error" | "info" | "warning";

type ToastNotification = {
  id: string;
  variant: ToastVariant;
  title: string;
  message: string;
  exiting: boolean;
};

type ToastOptions = {
  title: string;
  message: string;
  variant?: ToastVariant;
};

type ToastContextValue = {
  toast: (options: ToastOptions) => void;
};

// ============================================
// CONSTANTS
// ============================================

const TOAST_VISIBLE_DURATION = 3500;
const TOAST_EXIT_DURATION = 400;

// ============================================
// CONTEXT
// ============================================

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
};

// ============================================
// PROVIDER
// ============================================

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [portalMounted, setPortalMounted] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    setPortalMounted(true);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const toast = useCallback((options: ToastOptions) => {
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

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {portalMounted &&
        createPortal(
          <div
            className="fixed bottom-6 left-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none max-sm:bottom-auto max-sm:top-4 max-sm:left-1/2 max-sm:-translate-x-1/2 max-sm:px-4"
            dir="rtl"
          >
            {toasts.map((t) => (
              <ToastItem key={t.id} toast={t} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
};

// ============================================
// TOAST ITEM (reuses same styling as NotificationContext)
// ============================================

const variantStyles: Record<ToastVariant, { bg: string; text: string; border: string; icon: string }> = {
  success: {
    bg: "bg-emerald-950/90",
    text: "text-emerald-100",
    border: "border-emerald-500/50",
    icon: "\u2713",
  },
  error: {
    bg: "bg-red-950/90",
    text: "text-red-100",
    border: "border-red-500/50",
    icon: "\u2715",
  },
  warning: {
    bg: "bg-yellow-950/90",
    text: "text-yellow-100",
    border: "border-yellow-500/50",
    icon: "\u26A0",
  },
  info: {
    bg: "bg-blue-950/90",
    text: "text-blue-100",
    border: "border-blue-500/50",
    icon: "\u2139",
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
