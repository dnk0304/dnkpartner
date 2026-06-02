"use client";

/**
 * Admin blog editor — markdown textarea + SEO/metadata fields + publish toggle.
 *
 * Intentionally simple per brief: textarea (not WYSIWYG) since the source
 * articles are already markdown and we want round-trip fidelity. A
 * live-preview toggle uses react-markdown so Dennis can sanity-check
 * formatting before publishing.
 *
 * Mode is inferred from slugParam: "new" → create; anything else → edit.
 */
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArticleContent } from "@/components/blog/ArticleContent";

type Status = "DRAFT" | "PUBLISHED";

type FullArticle = {
  id: string;
  slug: string;
  title: string;
  seoTitle: string | null;
  metaDescription: string | null;
  primaryKeyword: string | null;
  secondaryKeywords: string[];
  cluster: string | null;
  imageAlt: string | null;
  canonicalUrl: string | null;
  bodyMarkdown: string;
  status: Status;
  publishedAt: string | null;
  updatedAt: string;
};

type EditorState = {
  slug: string;
  title: string;
  seoTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  secondaryKeywordsRaw: string; // comma-separated in UI
  cluster: string;
  imageAlt: string;
  canonicalUrl: string;
  bodyMarkdown: string;
};

const EMPTY: EditorState = {
  slug: "",
  title: "",
  seoTitle: "",
  metaDescription: "",
  primaryKeyword: "",
  secondaryKeywordsRaw: "",
  cluster: "",
  imageAlt: "",
  canonicalUrl: "",
  bodyMarkdown: "",
};

function articleToState(a: FullArticle): EditorState {
  return {
    slug: a.slug,
    title: a.title,
    seoTitle: a.seoTitle ?? "",
    metaDescription: a.metaDescription ?? "",
    primaryKeyword: a.primaryKeyword ?? "",
    secondaryKeywordsRaw: (a.secondaryKeywords ?? []).join(", "),
    cluster: a.cluster ?? "",
    imageAlt: a.imageAlt ?? "",
    canonicalUrl: a.canonicalUrl ?? "",
    bodyMarkdown: a.bodyMarkdown,
  };
}

function statePayload(s: EditorState) {
  return {
    slug: s.slug.trim(),
    title: s.title.trim(),
    seoTitle: s.seoTitle.trim() || null,
    metaDescription: s.metaDescription.trim() || null,
    primaryKeyword: s.primaryKeyword.trim() || null,
    secondaryKeywords: s.secondaryKeywordsRaw
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
    cluster: s.cluster.trim() || null,
    imageAlt: s.imageAlt.trim() || null,
    canonicalUrl: s.canonicalUrl.trim() || null,
    bodyMarkdown: s.bodyMarkdown,
  };
}

export function AdminBlogEditor({ slugParam }: { slugParam: string }) {
  const router = useRouter();
  const isNew = slugParam === "new";

  const [loaded, setLoaded] = useState(isNew);
  const [original, setOriginal] = useState<FullArticle | null>(null);
  const [state, setState] = useState<EditorState>(EMPTY);
  const [status, setStatus] = useState<Status>("DRAFT");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Existing articles open in formatted preview by default (readers' view);
  // new articles open in the raw editor so the author can start typing immediately.
  const [showPreview, setShowPreview] = useState(!isNew);

  // Load existing article
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      const r = await fetch(`/api/admin/articles/${slugParam}`, {
        cache: "no-store",
      });
      if (!r.ok) {
        if (!cancelled) {
          setError(r.status === 404 ? "Artículo no encontrado" : `Error ${r.status}`);
          setLoaded(true);
        }
        return;
      }
      const data = (await r.json()) as { success: boolean; article?: FullArticle };
      if (cancelled || !data.article) return;
      setOriginal(data.article);
      setState(articleToState(data.article));
      setStatus(data.article.status);
      setPublishedAt(data.article.publishedAt);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [slugParam, isNew]);

  const update = useCallback(<K extends keyof EditorState>(key: K, value: EditorState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (isNew) {
        const r = await fetch(`/api/admin/articles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(statePayload(state)),
        });
        const data = (await r.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          article?: { slug: string };
        };
        if (!r.ok || !data.success) {
          setError(`No se pudo crear: ${data.error ?? r.status}`);
          return;
        }
        router.push(`/admin/blog/${data.article?.slug ?? state.slug}`);
        router.refresh();
      } else {
        const r = await fetch(`/api/admin/articles/${slugParam}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(statePayload(state)),
        });
        const data = (await r.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          article?: { slug: string };
        };
        if (!r.ok || !data.success) {
          setError(`No se pudo guardar: ${data.error ?? r.status}`);
          return;
        }
        setNotice("Cambios guardados.");
        // If slug changed, navigate to the new URL
        const newSlug = data.article?.slug;
        if (newSlug && newSlug !== slugParam) {
          router.push(`/admin/blog/${newSlug}`);
          router.refresh();
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish() {
    if (isNew) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const action = status === "PUBLISHED" ? "unpublish" : "publish";
    try {
      const r = await fetch(`/api/admin/articles/${slugParam}/${action}`, {
        method: "POST",
      });
      const data = (await r.json().catch(() => ({}))) as {
        success?: boolean;
        article?: { status: Status; publishedAt: string | null };
        error?: string;
      };
      if (!r.ok || !data.success) {
        setError(`No se pudo ${action === "publish" ? "publicar" : "despublicar"}: ${data.error ?? r.status}`);
        return;
      }
      if (data.article) {
        setStatus(data.article.status);
        setPublishedAt(data.article.publishedAt);
      }
      setNotice(action === "publish" ? "Artículo publicado." : "Artículo despublicado.");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-[--color-page] p-8 text-sm text-[--color-ink-quiet]">
        Cargando…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[--color-page]">
      <header className="sticky top-0 z-10 border-b border-[--color-hairline] bg-[--color-surface]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/admin/blog"
              className="shrink-0 text-sm text-[--color-ink-secondary] hover:text-[--color-ink-primary]"
            >
              ← Guías
            </Link>
            <h1 className="truncate font-display text-base font-semibold text-[--color-ink-primary]">
              {isNew ? "Nueva guía" : state.title || slugParam}
            </h1>
            {!isNew ? (
              <span
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                  status === "PUBLISHED"
                    ? "bg-[--color-status-live-soft] text-[--color-ink-primary]"
                    : "bg-[--color-surface-muted] text-[--color-ink-secondary]"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${
                    status === "PUBLISHED"
                      ? "bg-[--color-status-live]"
                      : "bg-[--color-ink-quiet]"
                  }`}
                />
                {status === "PUBLISHED" ? "Publicado" : "Borrador"}
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="cursor-pointer rounded-md border border-[--color-hairline] px-3 py-1.5 text-xs font-medium text-[--color-ink-primary] hover:bg-[--color-surface-muted]"
            >
              {showPreview ? "Editar" : "Previsualizar"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="cursor-pointer rounded-md border border-[--color-hairline] bg-[--color-surface] px-3 py-1.5 text-xs font-medium text-[--color-ink-primary] hover:bg-[--color-surface-muted] disabled:opacity-50"
            >
              {busy ? "Guardando…" : isNew ? "Crear borrador" : "Guardar"}
            </button>
            {!isNew && status === "PUBLISHED" && original ? (
              <Link
                href={`/guia/${state.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer rounded-md border border-[--color-hairline] px-3 py-1.5 text-xs font-medium text-[--color-ink-primary] hover:bg-[--color-surface-muted]"
              >
                Ver página en vivo ↗
              </Link>
            ) : null}
            {!isNew ? (
              status === "PUBLISHED" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={togglePublish}
                  aria-label="Retirar artículo (despublicar)"
                  className="cursor-pointer inline-flex items-center gap-1.5 rounded-md border-2 border-[--color-warn-critical] bg-[--color-surface] px-4 py-2 text-sm font-semibold text-[--color-ink-primary] hover:bg-[--color-warn-critical-soft] disabled:opacity-50"
                >
                  <span aria-hidden className="h-2 w-2 rounded-full bg-[--color-warn-critical]" />
                  Retirar (despublicar)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={togglePublish}
                  aria-label="Aprobar y publicar artículo"
                  className="cursor-pointer inline-flex items-center gap-1.5 rounded-md bg-[--color-action] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[--color-action-hover] disabled:opacity-50"
                >
                  <span aria-hidden>✓</span>
                  Aprobar y publicar
                </button>
              )
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-md border border-[--color-warn-critical] bg-[--color-warn-critical-soft] px-3 py-2 text-sm text-[--color-ink-primary]"
          >
            {error}
          </div>
        ) : null}
        {notice ? (
          <div
            role="status"
            className="mb-4 rounded-md border border-[--color-warn-positive] bg-[--color-warn-positive-soft] px-3 py-2 text-sm text-[--color-ink-primary]"
          >
            {notice}
          </div>
        ) : null}

        {!isNew ? (
          <div
            className={`mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-[--color-ink-primary] ${
              status === "PUBLISHED"
                ? "border-[--color-status-live] bg-[--color-status-live-soft]"
                : "border-[--color-hairline] bg-[--color-surface-muted]"
            }`}
          >
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${
                status === "PUBLISHED" ? "bg-[--color-status-live]" : "bg-[--color-ink-quiet]"
              }`}
            />
            <span>
              {status === "PUBLISHED" ? (
                <>
                  <strong>Publicado.</strong> Visible al público en{" "}
                  <Link
                    href={`/guia/${state.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer underline text-[--color-ink-primary] hover:no-underline"
                  >
                    /guia/{state.slug}
                  </Link>
                  .
                </>
              ) : (
                <>
                  <strong>Borrador.</strong> Este artículo NO es visible al público todavía.
                </>
              )}
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* Main column: title + body / preview */}
          <section className="space-y-4">
            <Field label="Título" htmlFor="f-title" required>
              <input
                id="f-title"
                type="text"
                value={state.title}
                onChange={(e) => update("title", e.target.value)}
                className={INPUT_CLS}
                required
              />
            </Field>

            <Field
              label="Cuerpo del artículo (Markdown)"
              htmlFor="f-body"
              hint="Soporta GFM: tablas, listas, listas de tareas, etc."
              required
            >
              {showPreview ? (
                // Preview pane — renders via the SHARED <ArticleContent />
                // component (same render path as /guia/[slug]) so what Dennis
                // sees here is byte-for-byte what publishes live. We mirror
                // the public page's reading column (`max-w-3xl mx-auto px-6`)
                // inside the admin panel so width/padding match too — true
                // WYSIWYG, modulo the surrounding admin chrome.
                <div className="min-h-[400px] rounded-md border border-[--color-hairline] bg-[--color-surface] py-10">
                  <div className="mx-auto max-w-3xl px-6">
                    <ArticleContent
                      body={state.bodyMarkdown || "*Sin contenido aún.*"}
                    />
                  </div>
                </div>
              ) : (
                <textarea
                  id="f-body"
                  value={state.bodyMarkdown}
                  onChange={(e) => update("bodyMarkdown", e.target.value)}
                  className={`${INPUT_CLS} min-h-[500px] font-mono text-sm leading-relaxed`}
                  spellCheck
                  required
                />
              )}
            </Field>
          </section>

          {/* Sidebar: SEO + metadata */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-md border border-[--color-hairline] bg-[--color-surface] p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[--color-ink-quiet]">
                URL & estado
              </h2>
              <Field label="Slug" htmlFor="f-slug" hint="solo a-z, 0-9, guión" required>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[--color-ink-quiet]">/guia/</span>
                  <input
                    id="f-slug"
                    type="text"
                    value={state.slug}
                    onChange={(e) =>
                      update("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                    }
                    className={INPUT_CLS}
                    pattern="[a-z0-9-]+"
                    required
                  />
                </div>
              </Field>
              {!isNew && publishedAt ? (
                <p className="mt-2 text-xs text-[--color-ink-quiet]">
                  Publicado: {new Date(publishedAt).toLocaleString("es-ES")}
                </p>
              ) : null}
              {!isNew && original ? (
                <Link
                  href={`/guia/${state.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-[--color-action] hover:underline"
                >
                  Abrir en el sitio público ↗
                </Link>
              ) : null}
            </div>

            <div className="rounded-md border border-[--color-hairline] bg-[--color-surface] p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[--color-ink-quiet]">
                SEO
              </h2>
              <div className="space-y-3">
                <Field label="SEO Title" htmlFor="f-seoTitle" hint="≤ 60 caracteres">
                  <input
                    id="f-seoTitle"
                    type="text"
                    value={state.seoTitle}
                    onChange={(e) => update("seoTitle", e.target.value)}
                    className={INPUT_CLS}
                    maxLength={70}
                  />
                  <CharCount value={state.seoTitle} limit={60} />
                </Field>

                <Field label="Meta description" htmlFor="f-metaDesc" hint="≤ 155 caracteres">
                  <textarea
                    id="f-metaDesc"
                    value={state.metaDescription}
                    onChange={(e) => update("metaDescription", e.target.value)}
                    className={`${INPUT_CLS} min-h-[70px]`}
                    maxLength={180}
                  />
                  <CharCount value={state.metaDescription} limit={155} />
                </Field>

                <Field label="Palabra clave principal" htmlFor="f-kw">
                  <input
                    id="f-kw"
                    type="text"
                    value={state.primaryKeyword}
                    onChange={(e) => update("primaryKeyword", e.target.value)}
                    className={INPUT_CLS}
                  />
                </Field>

                <Field
                  label="Palabras clave secundarias"
                  htmlFor="f-kws"
                  hint="separadas por comas"
                >
                  <input
                    id="f-kws"
                    type="text"
                    value={state.secondaryKeywordsRaw}
                    onChange={(e) => update("secondaryKeywordsRaw", e.target.value)}
                    className={INPUT_CLS}
                  />
                </Field>

                <Field label="Cluster" htmlFor="f-cluster">
                  <input
                    id="f-cluster"
                    type="text"
                    value={state.cluster}
                    onChange={(e) => update("cluster", e.target.value)}
                    className={INPUT_CLS}
                  />
                </Field>

                <Field label="Canonical URL" htmlFor="f-canon" hint="dejar vacío = autodetectar">
                  <input
                    id="f-canon"
                    type="url"
                    value={state.canonicalUrl}
                    onChange={(e) => update("canonicalUrl", e.target.value)}
                    className={INPUT_CLS}
                    placeholder="https://subastasactivas.com/guia/..."
                  />
                </Field>

                <Field label="Image alt" htmlFor="f-alt">
                  <input
                    id="f-alt"
                    type="text"
                    value={state.imageAlt}
                    onChange={(e) => update("imageAlt", e.target.value)}
                    className={INPUT_CLS}
                  />
                </Field>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

const INPUT_CLS =
  "w-full rounded-md border border-[--color-hairline] bg-[--color-surface] px-2.5 py-1.5 text-sm text-[--color-ink-primary] placeholder:text-[--color-ink-quiet] focus:border-[--color-action] focus:outline-none focus:ring-2 focus:ring-[--color-action]/30";

function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-[--color-ink-secondary]">
        {label}
        {required ? <span className="ml-0.5 text-[--color-warn-critical]">*</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-[--color-ink-quiet]">{hint}</p> : null}
    </div>
  );
}

function CharCount({ value, limit }: { value: string; limit: number }) {
  const len = value.length;
  const over = len > limit;
  return (
    <p
      className={`mt-1 text-[11px] tabular-nums ${
        over ? "text-[--color-warn-critical]" : "text-[--color-ink-quiet]"
      }`}
    >
      {len}/{limit}
    </p>
  );
}
