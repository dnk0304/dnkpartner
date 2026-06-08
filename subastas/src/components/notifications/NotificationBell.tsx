"use client";

/**
 * NotificationBell — header bell with unread badge + preview dropdown.
 *
 * Self-contained (no TopBar edit required) — drop anywhere in a layout.
 *
 * Polling: refreshes the unread count every 60s while mounted.
 * Manual refresh: click opens the dropdown and re-fetches the preview list.
 *
 * Endpoints consumed:
 *   GET  /api/notifications/unread-count
 *   GET  /api/notifications?limit=5
 *   POST /api/notifications/mark-read       (mark single OR all)
 *
 * Auth-aware: when logged out, the bell is a quiet "Inicia sesión" CTA link.
 */

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Bell, BellOff, CheckCheck, Inbox, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api-path";
import {
  NotificationListResponse,
  NotificationRow,
  UnreadCountResponse,
  formatRelativeEs,
  summarizeNotification,
} from "@/lib/notification-types";
import { cn } from "@/lib/utils";

const POLL_MS = 60_000;

export type NotificationBellProps = {
  /** Extra classes for the trigger button. */
  className?: string;
  /** Where the "Ver todas" link points. Defaults to the notifications page. */
  inboxHref?: string;
};

export function NotificationBell({ className, inboxHref = "/notifications" }: NotificationBellProps) {
  const { status } = useSession();
  const authed = status === "authenticated";

  const [count, setCount] = React.useState(0);
  const [items, setItems] = React.useState<NotificationRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // --- Poll unread count ---
  React.useEffect(() => {
    if (!authed) {
      setCount(0);
      return;
    }
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await apiFetch("/api/notifications/unread-count");
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as UnreadCountResponse;
        if (!cancelled) setCount(body.count ?? 0);
      } catch {
        // silent — try again next interval
      }
    };

    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [authed]);

  // --- Refresh preview list on open ---
  const loadPreview = React.useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/notifications?limit=6");
      if (!res.ok) {
        setError("No se pudieron cargar las notificaciones.");
        return;
      }
      const body = (await res.json()) as NotificationListResponse;
      setItems(body.data ?? []);
    } catch {
      setError("Sin conexión.");
    } finally {
      setLoading(false);
    }
  }, [authed]);

  React.useEffect(() => {
    if (open) loadPreview();
  }, [open, loadPreview]);

  const markAllRead = async () => {
    if (count === 0) return;
    // Optimistic
    setCount(0);
    setItems((curr) => curr.map((i) => ({ ...i, read: true })));
    try {
      await apiFetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      // refetch on error to recover correct state
      loadPreview();
    }
  };

  const markOneRead = async (id: string) => {
    setItems((curr) => curr.map((i) => (i.id === id ? { ...i, read: true } : i)));
    setCount((c) => Math.max(0, c - 1));
    try {
      await apiFetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch {
      // best-effort
    }
  };

  if (!authed) {
    return (
      <Link
        href="/login"
        className={cn(
          "inline-flex items-center justify-center h-9 w-9 rounded-full text-[#1F3A5F]/60 hover:text-[#1F3A5F] hover:bg-[#1F3A5F]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A5F]/40",
          className,
        )}
        aria-label="Inicia sesión para ver notificaciones"
        title="Inicia sesión para ver notificaciones"
      >
        <BellOff className="h-5 w-5" aria-hidden="true" />
      </Link>
    );
  }

  const displayCount = count > 99 ? "99+" : String(count);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={count > 0 ? `Notificaciones (${count} sin leer)` : "Notificaciones"}
          aria-haspopup="menu"
          className={cn(
            "relative inline-flex items-center justify-center h-9 w-9 rounded-full",
            "text-[#1F3A5F] hover:bg-[#1F3A5F]/5",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A5F]/40",
            className,
          )}
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {count > 0 && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1",
                "rounded-full bg-[var(--color-warn-critical-soft)] text-[var(--color-ink-primary)] border border-[var(--color-warn-critical)] text-[10px] font-semibold",
                "flex items-center justify-center leading-none",
                "ring-2 ring-white",
              )}
            >
              {displayCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[360px] max-w-[calc(100vw-1rem)] p-0 bg-[#FBF8F3] border-[#1F3A5F]/15"
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1F3A5F]/10">
          <div className="font-semibold text-sm text-[#1F3A5F]">Notificaciones</div>
          <button
            type="button"
            onClick={markAllRead}
            disabled={count === 0}
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium rounded-md px-2 py-1",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A5F]/40",
              count === 0
                ? "text-[#1F3A5F]/30 cursor-not-allowed"
                : "text-[#1F3A5F] hover:bg-[#1F3A5F]/5",
            )}
          >
            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Marcar todas leídas
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-[#1F3A5F]/60 gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Cargando…
            </div>
          ) : error ? (
            <div className="px-3 py-6 text-sm text-[#B08A3E]">{error}</div>
          ) : items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-[#1F3A5F]/60">
              <Inbox className="h-8 w-8 mx-auto mb-2 text-[#1F3A5F]/30" aria-hidden="true" />
              Sin notificaciones por ahora.
            </div>
          ) : (
            <ul role="list" className="divide-y divide-[#1F3A5F]/10">
              {items.map((n) => {
                const { title, body } = summarizeNotification(n);
                const href = n.auctionId ? `/?auction=${encodeURIComponent(n.auctionId)}` : "#";
                return (
                  <li key={n.id} className={cn(!n.read && "bg-[#1F3A5F]/[0.03]")}>
                    <Link
                      href={href}
                      onClick={() => {
                        setOpen(false);
                        if (!n.read) markOneRead(n.id);
                      }}
                      className="block px-3 py-2.5 hover:bg-[#1F3A5F]/5 focus-visible:outline-none focus-visible:bg-[#1F3A5F]/5"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-1.5 h-2 w-2 rounded-full shrink-0",
                            n.read ? "bg-transparent" : "bg-[#B08A3E]",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-[#1F3A5F] truncate">{title}</div>
                          <div className="text-xs text-[#1F3A5F]/70 mt-0.5 line-clamp-2">{body}</div>
                          <div className="text-[10px] text-[#1F3A5F]/50 mt-1 uppercase tracking-wide">
                            {formatRelativeEs(n.sentAt)}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-[#1F3A5F]/10 px-3 py-2 text-center">
          <Link
            href={inboxHref}
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-[#1F3A5F] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A5F]/40 rounded"
          >
            Ver todas las notificaciones
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
