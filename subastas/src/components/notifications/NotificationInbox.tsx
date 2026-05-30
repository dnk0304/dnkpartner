"use client";

/**
 * NotificationInbox — the full-page list view.
 *
 * - Cursor pagination via `nextCursor` from the API.
 * - Filter: All / Unread (re-fetches with `?unread=true`).
 * - Per-row actions: mark read (PATCH /api/notifications/[id]), delete.
 * - "Marcar todas leídas" (POST /api/notifications/mark-read { all: true }).
 *
 * Empty + loading + error states fully designed (per Pixel checklist).
 *
 * Endpoints consumed:
 *   GET    /api/notifications?limit=&cursor=&unread=
 *   POST   /api/notifications/mark-read
 *   PATCH  /api/notifications/[id]
 *   DELETE /api/notifications/[id]
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Bell,
  CheckCheck,
  ChevronDown,
  Inbox,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-path";
import {
  NotificationListResponse,
  NotificationRow,
  formatRelativeEs,
  summarizeNotification,
} from "@/lib/notification-types";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread";

export function NotificationInbox() {
  const { status } = useSession();
  const router = useRouter();

  const [items, setItems] = React.useState<NotificationRow[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/login?callbackUrl=${encodeURIComponent("/notifications")}`);
    }
  }, [status, router]);

  const load = React.useCallback(
    async (opts: { append?: boolean; cursor?: string | null; filterOverride?: Filter } = {}) => {
      if (status !== "authenticated") return;
      const effectiveFilter = opts.filterOverride ?? filter;
      const append = opts.append ?? false;
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);

      const qs = new URLSearchParams({ limit: "20" });
      if (effectiveFilter === "unread") qs.set("unread", "true");
      if (opts.cursor) qs.set("cursor", opts.cursor);

      try {
        const res = await apiFetch(`/api/notifications?${qs.toString()}`);
        if (!res.ok) {
          setError("No se pudieron cargar las notificaciones.");
          return;
        }
        const body = (await res.json()) as NotificationListResponse;
        setItems((curr) => (append ? [...curr, ...body.data] : body.data));
        setCursor(body.pagination?.nextCursor ?? null);
        setHasMore(body.pagination?.hasMore ?? false);
      } catch {
        setError("Sin conexión. Reinténtalo.");
      } finally {
        append ? setLoadingMore(false) : setLoading(false);
      }
    },
    [filter, status],
  );

  // Initial + filter-change load.
  React.useEffect(() => {
    if (status !== "authenticated") return;
    load({ append: false, cursor: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, status]);

  const handleMarkAllRead = async () => {
    try {
      await apiFetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setItems((curr) => curr.map((i) => ({ ...i, read: true })));
      if (filter === "unread") load({ append: false, cursor: null });
    } catch {
      // best effort
    }
  };

  const handleMarkOne = async (id: string, read: boolean) => {
    setItems((curr) => curr.map((i) => (i.id === id ? { ...i, read } : i)));
    try {
      await apiFetch(`/api/notifications/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read }),
      });
    } catch {
      // rollback on failure
      setItems((curr) => curr.map((i) => (i.id === id ? { ...i, read: !read } : i)));
    }
  };

  const handleDelete = async (id: string) => {
    const prev = items;
    setItems((curr) => curr.filter((i) => i.id !== id));
    try {
      const res = await apiFetch(`/api/notifications/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) setItems(prev);
    } catch {
      setItems(prev);
    }
  };

  const handleLoadMore = () => {
    if (!cursor || loadingMore) return;
    load({ append: true, cursor });
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-16 text-[#1F3A5F]/70 gap-2 text-sm">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Cargando…
      </div>
    );
  }

  if (status === "unauthenticated") {
    // The redirect-effect handles navigation; this is a fallback render.
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold text-[#1F3A5F] tracking-tight flex items-center gap-2.5">
            <Bell className="h-7 w-7 text-[#B08A3E]" aria-hidden="true" />
            Tus notificaciones
          </h1>
          <p className="text-sm text-[#1F3A5F]/70 mt-1">
            Cambios de estado y eventos relevantes de las subastas que sigues.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-1.5 text-sm font-medium rounded-md px-3 h-9 border border-[#1F3A5F]/20 text-[#1F3A5F] hover:bg-[#1F3A5F]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A5F]/40"
          >
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            Marcar todas leídas
          </button>
          <button
            type="button"
            onClick={() => load({ append: false, cursor: null })}
            className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-[#1F3A5F]/20 text-[#1F3A5F] hover:bg-[#1F3A5F]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A5F]/40"
            aria-label="Actualizar"
            title="Actualizar"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="mb-4 inline-flex rounded-full border border-[#1F3A5F]/15 bg-white p-0.5">
        {(["all", "unread"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cn(
              "px-3 h-7 text-xs font-medium rounded-full transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A5F]/40",
              filter === f
                ? "bg-[#1F3A5F] text-white"
                : "text-[#1F3A5F]/70 hover:text-[#1F3A5F]",
            )}
          >
            {f === "all" ? "Todas" : "Sin leer"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[#1F3A5F]/60 gap-2 text-sm">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Cargando…
        </div>
      ) : error ? (
        <div className="rounded-md border border-[#B08A3E]/30 bg-[#B08A3E]/5 px-4 py-3 text-sm text-[#B08A3E]">
          {error}
        </div>
      ) : items.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul role="list" className="space-y-2">
          {items.map((n) => (
            <NotificationItem
              key={n.id}
              n={n}
              onMarkRead={(read) => handleMarkOne(n.id, read)}
              onDelete={() => handleDelete(n.id)}
            />
          ))}
        </ul>
      )}

      {hasMore && (
        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="border-[#1F3A5F]/30 text-[#1F3A5F] hover:bg-[#1F3A5F]/5"
          >
            {loadingMore ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                Cargando…
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-2" aria-hidden="true" />
                Cargar más
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  return (
    <div className="rounded-lg border border-dashed border-[#1F3A5F]/15 bg-white py-12 text-center">
      <Inbox className="h-10 w-10 mx-auto text-[#1F3A5F]/25 mb-3" aria-hidden="true" />
      <h2 className="text-base font-semibold text-[#1F3A5F]">
        {filter === "unread" ? "Estás al día" : "Sin notificaciones por ahora"}
      </h2>
      <p className="text-sm text-[#1F3A5F]/60 mt-1 max-w-sm mx-auto">
        Sigue subastas que te interesen para enterarte de cualquier cambio en cuanto ocurra.
      </p>
      <div className="mt-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-[#1F3A5F] text-white text-sm font-medium hover:bg-[#1F3A5F]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1F3A5F]"
        >
          Explorar subastas
        </Link>
      </div>
    </div>
  );
}

function NotificationItem({
  n,
  onMarkRead,
  onDelete,
}: {
  n: NotificationRow;
  onMarkRead: (read: boolean) => void;
  onDelete: () => void;
}) {
  const { title, body } = summarizeNotification(n);
  const href = n.auctionId ? `/?auction=${encodeURIComponent(n.auctionId)}` : "#";

  return (
    <li
      className={cn(
        "group rounded-lg border bg-white transition-colors",
        n.read ? "border-[#1F3A5F]/10" : "border-[#B08A3E]/40 bg-[#B08A3E]/[0.03]",
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <span
          aria-hidden="true"
          className={cn(
            "mt-1.5 h-2 w-2 rounded-full shrink-0",
            n.read ? "bg-transparent" : "bg-[#B08A3E]",
          )}
        />
        <Link
          href={href}
          onClick={() => {
            if (!n.read) onMarkRead(true);
          }}
          className="min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A5F]/40 rounded"
        >
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-medium text-[#1F3A5F]", !n.read && "font-semibold")}>
              {title}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-[#1F3A5F]/40">
              {formatRelativeEs(n.sentAt)}
            </span>
          </div>
          <p className="text-sm text-[#1F3A5F]/75 mt-0.5">{body}</p>
        </Link>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onMarkRead(!n.read)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-[#1F3A5F]/60 hover:bg-[#1F3A5F]/5 hover:text-[#1F3A5F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A5F]/40"
            aria-label={n.read ? "Marcar como no leída" : "Marcar como leída"}
            title={n.read ? "Marcar como no leída" : "Marcar como leída"}
          >
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-[#1F3A5F]/60 hover:bg-[#B08A3E]/10 hover:text-[#B08A3E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A5F]/40"
            aria-label="Eliminar notificación"
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}
