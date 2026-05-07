import { useEffect } from "react";

const ROUTE_SHORTCUTS: Record<string, string> = {
  "1": "/",
  "2": "/board",
  "3": "/runs",
  "4": "/prs",
  "5": "/activity",
  "6": "/topology",
};

export const useKeyboardNav = (onNavigate: (path: string) => void) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const route = ROUTE_SHORTCUTS[e.key];
      if (route) {
        e.preventDefault();
        onNavigate(route);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNavigate]);
};

export const SHORTCUT_LABELS: Record<string, string> = {
  "/": "⌘1",
  "/board": "⌘2",
  "/runs": "⌘3",
  "/prs": "⌘4",
  "/activity": "⌘5",
  "/topology": "⌘6",
};
