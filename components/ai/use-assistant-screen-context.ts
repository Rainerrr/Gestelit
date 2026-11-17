"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
let current: { pathname: string; context: Record<string, unknown> } | null = null;
/** Publish only intentional page context, never DOM snapshots or credentials. */
export function useAssistantScreenContext(context: Record<string, unknown>) {
  const pathname = usePathname();
  const serialized = JSON.stringify(context);
  useEffect(() => {
    const entry = { pathname, context: JSON.parse(serialized) as Record<string, unknown> };
    current = entry;
    return () => { if (current === entry) current = null; };
  }, [pathname, serialized]);
}
export function getAssistantScreenContext(pathname: string) {
  return current?.pathname === pathname ? current.context : {};
}
