"use client";

/**
 * Admin blog list — DRAFT / PUBLISHED filter + search + publish/unpublish
 * toggle + delete + link to editor.
 *
 * Consumes the existing backend admin API:
 *   GET    /api/admin/articles?status=&q=
 *   POST   /api/admin/articles/[slug]/publish
 *   POST   /api/admin/articles/[slug]/unpublish
 *   DELETE /api/admin/articles/[slug]
 *
 * Server gate on /admin/blog/page.tsx already redirects non-admin users;
 * the API also re-enforces requireAdmin so this is doubly safe.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Status = "DRAFT" | "PUBLISHED";
type StatusFilter = "ALL" | Status;

type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  seoTitle: string | null;
  metaDescription: string | null;
  primaryKeyword: string | null;
  cluster: string | null;
  status: Status;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function AdminBlogList() {
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ArticleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    const r = await fetch(`/api/admin/articles?${params.toString()}`, {
      cache: "no-store",
    });
    if (!r.ok) {
      setError(`No se pudo cargar (${r.status})`);
      setRows([]);
      return;
    }
    const data = (await r.json()) as { success: boolean; articles?: ArticleRow[] };
    setRows(data.articles ?? []);
  }, [status, q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function togglePublish(article: ArticleRow) {
    setBusySlug(article.slug);
    setError(null);
    const action = article.status === "PUBLISHED" ? "unpublish" : "publish";
    try {
      const r = await fetch(`/api/admin/articles/${article.slug}/${action}`, {
        method: "POST",
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        setError(`No se pudo ${action === "publish" ? "publicar" : "despublicar"}: ${body.error ?? r.status}`);
      } else {
        await load();
      }
    } finally {
      setBusySlug(null);
    }
  }

  async function deleteArticle(article: ArticleRow) {
    if (!confirm(`¿Eliminar "${article.title}" definitivamente?`)) return;
    setBusySlug(article.slug);
    setError(null);
    try {
      const r = await fetch(`/api/admin/articles/${article.slug}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        setError(`No se pudo eliminar (${r.status})`);
      } else {
        await load();
      }
    } finally {
      setBusySlug(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-page)]">
      <header className="border-b border-[var(--color-hairline)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-[var(--color-ink-primary)]">
              Guías — administración
            </h1>
            <p className="mt-0.5 text-xs text-[var(--color-ink-quiet)]">
              Editor de artículos publicados en /guia/&lt;slug&gt;
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)]"
            >
              ← Panel admin
            </Link>
            <Link
              href="/admin/blog/new"
              className="inline-flex items-center rounded-md bg-[var(--color-brand)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-brand-hover)]"
            >
              + Nueva guía
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Filtrar por estado"
            className="inline-flex overflow-hidden rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] text-sm"
          >
            {(["ALL", "DRAFT", "PUBLISHED"] as const).map((s) => (
              <button
                key={s}
                role="tab"
                type="button"
                aria-selected={status === s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  status === s
                    ? "bg-[var(--color-ink-primary)] text-white"
                    : "text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)]"
                }`}
              >
                {s === "ALL" ? "Todos" : s === "DRAFT" ? "Borradores" : "Publicados"}
              </button>
            ))}
          </div>

          <label className="flex-1">
            <span className="sr-only">Buscar</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por título, slug o palabra clave…"
              className="w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-ink-primary)] placeholder:text-[var(--color-ink-quiet)] focus:border-[var(--color-action)] focus:outline-none focus:ring-2 focus:ring-[var(--color-action)]/30"
            />
          </label>
        </div>

        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-md border border-[var(--color-warn-critical)] bg-[var(--color-warn-critical-soft)] px-3 py-2 text-sm text-[var(--color-ink-primary)]"
          >
            {error}
          </div>
        ) : null}

        {rows === null ? (
          <p className="text-sm text-[var(--color-ink-quiet)]">Cargando…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6 text-center text-sm text-[var(--color-ink-secondary)]">
            No hay guías con esos filtros.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--color-ink-quiet)]">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Título</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Slug</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Actualizado</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t border-[var(--color-hairline-soft)] align-top hover:bg-[var(--color-surface-muted)]/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/blog/${a.slug}`}
                        className="font-medium text-[var(--color-ink-primary)] hover:underline"
                      >
                        {a.title}
                      </Link>
                      {a.primaryKeyword ? (
                        <p className="mt-0.5 text-xs text-[var(--color-ink-quiet)]">
                          KW: {a.primaryKeyword}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--color-ink-secondary)]">
                      /guia/{a.slug}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-ink-quiet)]">
                      {new Date(a.updatedAt).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/blog/${a.slug}`}
                          className="rounded-md border border-[var(--color-hairline)] px-2.5 py-1 text-xs text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)]"
                        >
                          Editar
                        </Link>
                        <button
                          type="button"
                          disabled={busySlug === a.slug}
                          onClick={() => togglePublish(a)}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                            a.status === "PUBLISHED"
                              ? "border border-[var(--color-hairline)] text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)]"
                              : "bg-[var(--color-action)] text-white hover:bg-[var(--color-action-hover)]"
                          } disabled:opacity-50`}
                        >
                          {busySlug === a.slug
                            ? "…"
                            : a.status === "PUBLISHED"
                              ? "Despublicar"
                              : "Publicar"}
                        </button>
                        <button
                          type="button"
                          disabled={busySlug === a.slug}
                          onClick={() => deleteArticle(a)}
                          className="rounded-md border border-[var(--color-warn-critical)]/30 px-2.5 py-1 text-xs text-[var(--color-warn-critical)] hover:bg-[var(--color-warn-critical-soft)] disabled:opacity-50"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const isPub = status === "PUBLISHED";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
        isPub
          ? "bg-[var(--color-status-live-soft)] text-[var(--color-ink-primary)]"
          : "bg-[var(--color-surface-muted)] text-[var(--color-ink-secondary)]"
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${
          isPub ? "bg-[var(--color-status-live)]" : "bg-[var(--color-ink-quiet)]"
        }`}
      />
      {isPub ? "Publicado" : "Borrador"}
    </span>
  );
}
