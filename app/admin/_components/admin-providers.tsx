"use client";

import type { ReactNode } from "react";
import { NotificationProvider } from "@/contexts/NotificationContext";

export const AdminProviders = ({ children }: { children: ReactNode }) => {
  return <NotificationProvider>{children}</NotificationProvider>;
};
