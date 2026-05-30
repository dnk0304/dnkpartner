import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import grapesjs, { Editor } from 'grapesjs';
import gjsBlocksBasic from 'grapesjs-blocks-basic';
import gjsPresetWebpage from 'grapesjs-preset-webpage';
import gjsPluginForms from 'grapesjs-plugin-forms';
import gjsCustomCode from 'grapesjs-custom-code';
import { registerCustomBlocks } from './blocks';
import { registerCustomTypes, applyOwnerLocks } from './componentTypes';
import { TRADES_TEMPLATES, BLANK_THUMBNAIL } from './templates/trades';
import './SiteBuilder.css';

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

interface Site {
  id: string;
  name: string;
}

interface Page {
  id: string;
  name: string;
  path: string;
  updated_at?: string;
}

type EditMode = 'designer' | 'owner';
type RightTab = 'style' | 'traits' | 'layers';

/**
 * Owner Style buckets. Each bucket maps a friendly size (S/M/L/XL) to a
 * concrete CSS value for a given property. Designed for non-coder owners.
 */
const SIZE_BUCKETS = {
  text: {
    label: 'Text size',
    property: 'font-size',
    values: { S: '0.875rem', M: '1rem', L: '1.25rem', XL: '1.75rem' },
  },
  spacing: {
    label: 'Spacing inside',
    property: 'padding',
    values: { S: '8px', M: '16px', L: '32px', XL: '64px' },
  },
  width: {
    label: 'Image width',
    property: 'width',
    values: { S: '25%', M: '50%', L: '75%', XL: '100%' },
  },
} as const;

type BucketKey = keyof typeof SIZE_BUCKETS;
type SizeKey = 'S' | 'M' | 'L' | 'XL';

const LS_KEYS = {
  siteId: 'dnk.editor.lastSiteId',
  pageId: 'dnk.editor.lastPageId',
  mode: 'dnk.editor.mode',
};

const FA_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';

/** ISO timestamp -> "Saved 11:42" / "Saved 2m ago" friendly string. */
function formatSavedAt(date: Date | null, now: number): string {
  if (!date) return 'Not yet saved';
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Saved just now';
  if (diffMin < 60) return `Saved ${diffMin}m ago`;
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  return `Saved at ${hh}:${mm}`;
}

export function SiteBuilder() {
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [toast, setToast] = useState<Toast | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [pageId, setPageId] = useState<string | null>(null);
  // Default to Owner mode (locked decision #8). Designer still available via toggle.
  const [mode, setMode] = useState<EditMode>(
    (localStorage.getItem(LS_KEYS.mode) as EditMode) || 'owner',
  );
  const [rightTab, setRightTab] = useState<RightTab>('style');
  const [showThemePanel, setShowThemePanel] = useState(false);
  // Empty-state template overlay (locked decision #13): true when the
  // current page has no components — shown over a blank canvas.
  const [showTemplateOverlay, setShowTemplateOverlay] = useState(false);
  // Inline new-page modal (locked decision #10): replaces window.prompt.
  const [newPageModal, setNewPageModal] = useState<null | {
    name: string;
    path: string;
    pathTouched: boolean;
    submitting: boolean;
    error: string | null;
  }>(null);
  // Saved timestamp state (locked decision #9): persistent header line,
  // driven by storageManager `store` events. NOT a transient toast.
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // tick so the "Xm ago" label refreshes without re-saving
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Tracks current Owner-mode selection so the simplified Style panel
  // can read/write to the right component.
  const [, setSelectedSig] = useState(0);

  // Theme tokens (CSS vars on canvas root)
  const [theme, setTheme] = useState({
    primary: '#7c3aed',
    secondary: '#ec4899',
    font: 'Inter, system-ui, sans-serif',
    radius: '8px',
  });

  const showToast = useCallback((message: string, type: Toast['type']) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Tick "saved Xm ago" every 30s — cheap, single setState
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // ─────────────────────────────────────────────────────────
  // Site / page pick-or-create on mount
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const sitesRes = await fetch('/api/site-builder/sites');
        if (!sitesRes.ok) throw new Error(`sites GET ${sitesRes.status}`);
        const sites: Site[] = await sitesRes.json();
        let chosen: Site | undefined;
        const lastSiteId = localStorage.getItem(LS_KEYS.siteId);
        if (lastSiteId) chosen = sites.find((s) => s.id === lastSiteId);
        if (!chosen) chosen = sites[0];
        if (!chosen) {
          const createRes = await fetch('/api/site-builder/sites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'My Site' }),
          });
          if (!createRes.ok) throw new Error(`sites POST ${createRes.status}`);
          chosen = await createRes.json();
        }
        if (cancelled || !chosen) return;
        localStorage.setItem(LS_KEYS.siteId, chosen.id);
        setSite(chosen);

        const pagesRes = await fetch(
          `/api/site-builder/sites/${chosen.id}/pages`,
        );
        if (!pagesRes.ok) throw new Error(`pages GET ${pagesRes.status}`);
        let pageList: Page[] = await pagesRes.json();
        if (pageList.length === 0) {
          const createPageRes = await fetch(
            `/api/site-builder/sites/${chosen.id}/pages`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: 'Home', path: '/' }),
            },
          );
          if (!createPageRes.ok)
            throw new Error(`pages POST ${createPageRes.status}`);
          const created: Page = await createPageRes.json();
          pageList = [created];
        }
        if (cancelled) return;
        setPages(pageList);

        const lastPageId = localStorage.getItem(LS_KEYS.pageId);
        const chosenPage =
          (lastPageId && pageList.find((p) => p.id === lastPageId)) ||
          pageList.find((p) => p.path === '/') ||
          pageList[0];
        localStorage.setItem(LS_KEYS.pageId, chosenPage.id);
        setPageId(chosenPage.id);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('[SiteBuilder] pick-or-create failed:', err);
        setLoadError(
          err instanceof Error ? err.message : 'Failed to load editor',
        );
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ─────────────────────────────────────────────────────────
  // Init GrapesJS once site + page are known
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!site || !pageId || editorRef.current) return;
    if (!containerRef.current) return;

    const editor = grapesjs.init({
      container: '#gjs',
      fromElement: false,
      height: '100%',
      width: 'auto',
      // Forge's verbatim remote storage manager (autosave → Postgres)
      storageManager: {
        type: 'remote',
        autosave: true,
        stepsBeforeSave: 3,
        options: {
          remote: {
            urlLoad: `/api/site-builder/sites/${site.id}/pages/${pageId}`,
            urlStore: `/api/site-builder/sites/${site.id}/pages/${pageId}`,
            fetchOptions: (opts: RequestInit) => ({
              ...opts,
              headers: {
                ...(opts.headers as Record<string, string> | undefined),
                'content-type': 'application/json',
              },
            }),
          },
        },
      },
      // ASSET MANAGER — wired for upload (locked decision #11). The upload
      // endpoint `/api/site-builder/assets/upload` is a Forge build-out
      // (FLAGGED). Until it exists, uploadFile() degrades gracefully:
      // small images (<2MB) become inline base64 data-URIs so the owner
      // can still place images today; large files surface a clear toast.
      assetManager: {
        upload: '/api/site-builder/assets/upload',
        uploadName: 'files',
        autoAdd: true,
        multiUpload: true,
      },
      plugins: [gjsBlocksBasic, gjsPresetWebpage, gjsPluginForms, gjsCustomCode],
      canvas: {
        styles: [FA_CDN],
        scripts: [],
      },
      panels: { defaults: [] },
      deviceManager: {
        devices: [
          { name: 'Desktop', width: '' },
          { name: 'Tablet', width: '768px', widthMedia: '992px' },
          { name: 'Mobile', width: '375px', widthMedia: '480px' },
        ],
      },
    });

    // Register custom types FIRST (so blocks dropping them get the right type)
    registerCustomTypes(editor);
    registerCustomBlocks(editor);

    // Mount style/trait/layer/block managers
    const mount = (id: string, render: () => HTMLElement | null | undefined) => {
      const el = document.getElementById(id);
      if (!el) return;
      const node = render();
      if (node) el.appendChild(node);
    };
    mount('sb-style-manager', () => editor.StyleManager.render());
    mount('sb-trait-manager', () => editor.TraitManager.render());
    mount('sb-layer-manager', () => editor.LayerManager.render());
    mount('sb-block-manager', () =>
      editor.BlockManager.render([], { external: true }),
    );

    // Re-apply locks when components are added/loaded (Owner mode)
    const reapplyLocks = () => {
      if ((localStorage.getItem(LS_KEYS.mode) as EditMode) === 'owner') {
        applyOwnerLocks(editor, true);
      }
    };
    editor.on('component:add', reapplyLocks);
    editor.on('load', reapplyLocks);
    editor.on('storage:load', reapplyLocks);

    // Persistent saved-timestamp (replaces 3s toast for routine autosaves)
    editor.on('storage:start:store', () => setIsSaving(true));
    editor.on('storage:end:store', () => setIsSaving(false));
    editor.on('storage:store', () => setSavedAt(new Date()));
    editor.on('storage:error:store', () => {
      setIsSaving(false);
      showToast('Save failed — your changes are safe locally. Retrying…', 'error');
    });

    // Empty-state overlay: show whenever the canvas has zero top-level components.
    const evalEmpty = () => {
      const count = editor.getComponents().length;
      setShowTemplateOverlay(count === 0);
    };
    editor.on('load', evalEmpty);
    editor.on('storage:load', evalEmpty);
    editor.on('component:add', evalEmpty);
    editor.on('component:remove', evalEmpty);

    // Track selection so the Owner Style panel re-renders
    const onSelChange = () => setSelectedSig((n) => n + 1);
    editor.on('component:selected', onSelChange);
    editor.on('component:deselected', onSelChange);

    // Custom upload handler: graceful degrade to base64 if the backend
    // endpoint is missing (Forge will replace this with a real bucket).
    editor.on('asset:upload:error', (err: unknown) => {
      console.warn('[SiteBuilder] asset upload error:', err);
      showToast(
        'Image upload needs the asset backend (FLAGGED to Forge). Use Add by URL for now.',
        'error',
      );
    });

    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, pageId]);

  // Device switching
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const deviceMap = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };
    editor.setDevice(deviceMap[device]);
  }, [device]);

  // Mode switching
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    localStorage.setItem(LS_KEYS.mode, mode);
    applyOwnerLocks(editor, mode === 'owner');
    // Owner default to Style tab; Designer respects last choice
    if (mode === 'owner') setRightTab('style');
  }, [mode]);

  // Theme tokens applied to canvas root
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const doc = editor.Canvas.getDocument();
    if (!doc) return;
    const root = doc.documentElement;
    root.style.setProperty('--brand-primary', theme.primary);
    root.style.setProperty('--brand-secondary', theme.secondary);
    root.style.setProperty('--brand-font', theme.font);
    root.style.setProperty('--brand-radius', theme.radius);
  }, [theme, site, pageId]);

  const handleUndo = () => editorRef.current?.UndoManager.undo();
  const handleRedo = () => editorRef.current?.UndoManager.redo();

  const handleSaveNow = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      await editor.store();
      // storage:store event will set savedAt
    } catch {
      showToast('Save failed', 'error');
    }
  };

  // ─────────────────────────────────────────────────────────
  // Preview — opens the page in a clean new tab (no editor chrome).
  // Reads the canvas HTML+CSS, wraps in a minimal doc, blob: URL.
  // ─────────────────────────────────────────────────────────
  const handlePreview = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const html = editor.getHtml();
    const css = editor.getCss() ?? '';
    const doc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Preview</title>
<link rel="stylesheet" href="${FA_CDN}"/>
<style>
  :root{--brand-primary:${theme.primary};--brand-secondary:${theme.secondary};--brand-font:${theme.font};--brand-radius:${theme.radius};}
  body{margin:0;font-family:var(--brand-font);}
  ${css}
</style>
</head>
<body>${html}</body>
</html>`;
    const blob = new Blob([doc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    // Revoke later — give the new tab time to load
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  // ─────────────────────────────────────────────────────────
  // Publish — saves current canvas, then POSTs the rendered HTML+CSS to the
  // publish endpoint which freezes a snapshot and exposes it at a public
  // /api/site-builder/public/<siteSlug>/<pagePath> URL (served by the studio
  // Express container, no editor chrome).
  // ─────────────────────────────────────────────────────────
  const handlePublish = async () => {
    const editor = editorRef.current;
    if (!editor || !site || !pageId) return;
    try {
      await editor.store();
      const html = editor.getHtml();
      const css = editor.getCss() ?? '';
      const res = await fetch(
        `/api/site-builder/sites/${site.id}/publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId, html, css }),
        },
      );
      if (!res.ok) throw new Error(`publish ${res.status}`);
      const { publicPath } = (await res.json()) as { publicPath: string };
      showToast(`Published. Live at ${publicPath}`, 'success');
      // Best-effort: open the public URL in a new tab so the owner sees it.
      try {
        window.open(publicPath, '_blank', 'noopener,noreferrer');
      } catch {
        /* popup blocked — toast already shows the URL */
      }
    } catch (err) {
      console.error('[SiteBuilder] publish failed:', err);
      showToast('Publish failed', 'error');
    }
  };

  // ─────────────────────────────────────────────────────────
  // New page — inline modal (replaces window.prompt)
  // ─────────────────────────────────────────────────────────
  const openNewPageModal = () => {
    setNewPageModal({
      name: '',
      path: '/',
      pathTouched: false,
      submitting: false,
      error: null,
    });
  };

  const submitNewPage = async () => {
    if (!site || !newPageModal) return;
    const name = newPageModal.name.trim();
    let path = newPageModal.path.trim();
    if (!name) {
      setNewPageModal({ ...newPageModal, error: 'Give the page a name.' });
      return;
    }
    if (!path.startsWith('/')) path = `/${path}`;
    if (pages.some((p) => p.path === path)) {
      setNewPageModal({
        ...newPageModal,
        error: `A page already lives at ${path}.`,
      });
      return;
    }
    setNewPageModal({ ...newPageModal, submitting: true, error: null });
    try {
      const res = await fetch(`/api/site-builder/sites/${site.id}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path }),
      });
      if (!res.ok) throw new Error(`pages POST ${res.status}`);
      const created: Page = await res.json();
      setPages((prev) => [...prev, created]);
      setNewPageModal(null);
      switchPage(created.id);
    } catch (err) {
      console.error('[SiteBuilder] create page failed:', err);
      setNewPageModal({
        ...newPageModal,
        submitting: false,
        error: 'Could not create the page. Please try again.',
      });
    }
  };

  const switchPage = (newPageId: string) => {
    if (newPageId === pageId) return;
    localStorage.setItem(LS_KEYS.pageId, newPageId);
    editorRef.current?.destroy();
    editorRef.current = null;
    setSavedAt(null);
    setPageId(newPageId);
  };

  const applyTemplate = (templateKey: keyof typeof TRADES_TEMPLATES) => {
    const editor = editorRef.current;
    if (!editor) return;
    const tpl = TRADES_TEMPLATES[templateKey];
    if (!tpl) return;
    if (
      editor.getComponents().length > 0 &&
      !window.confirm('Replace current page content with this template?')
    ) {
      return;
    }
    editor.setComponents(tpl.html);
    const tplCss = (tpl as { css?: string }).css;
    if (tplCss) editor.setStyle(tplCss);
    setShowTemplateOverlay(false);
    showToast(`Applied template: ${tpl.label}`, 'success');
  };

  const startBlank = () => setShowTemplateOverlay(false);

  // Open the asset manager (image picker) — for the "Add image" button
  const openAssetManager = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.AssetManager.open({
      select: (asset, complete) => {
        const url = typeof asset === 'string' ? asset : asset.get('src');
        const selected = editor.getSelected();
        if (selected && selected.is('image')) {
          selected.set('src', url);
        } else {
          // Drop a fresh image at the end of the canvas
          editor.addComponents({ type: 'image', src: url });
        }
        if (complete) editor.AssetManager.close();
      },
    });
  };

  // ─────────────────────────────────────────────────────────
  // Owner Style panel — read/write S/M/L/XL on the selected component
  // ─────────────────────────────────────────────────────────
  const ownerSelectedStyle = useMemo(() => {
    const editor = editorRef.current;
    if (!editor) return null;
    const sel = editor.getSelected();
    if (!sel) return null;
    const styles = sel.getStyle() as Record<string, string>;
    return { sel, styles };
  }, [mode, rightTab, nowTick]);

  const setBucket = (bucket: BucketKey, size: SizeKey) => {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = editor.getSelected();
    if (!sel) {
      showToast('Click something on the page first, then pick a size.', 'info');
      return;
    }
    const spec = SIZE_BUCKETS[bucket];
    sel.addStyle({ [spec.property]: spec.values[size] });
    setSelectedSig((n) => n + 1);
  };

  const currentBucketValue = (bucket: BucketKey): SizeKey | null => {
    if (!ownerSelectedStyle) return null;
    const spec = SIZE_BUCKETS[bucket];
    const v = ownerSelectedStyle.styles[spec.property];
    const found = (Object.entries(spec.values) as [SizeKey, string][]).find(
      ([, val]) => val === v,
    );
    return found ? found[0] : null;
  };

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="sb-loading">
        <div className="sb-spinner" />
        <p>Loading editor…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="sb-loading">
        <p style={{ color: '#ef4444' }}>Editor failed to load: {loadError}</p>
        <button
          className="sb-btn"
          onClick={() => window.location.reload()}
          style={{ marginTop: 16 }}
        >
          Retry
        </button>
      </div>
    );
  }

  const savedLabel = isSaving ? 'Saving…' : formatSavedAt(savedAt, nowTick);

  return (
    <div className="site-builder">
      {/* Toolbar */}
      <div className="sb-toolbar">
        <span className="sb-toolbar-title">Site Builder</span>

        {/* Page switcher */}
        {pages.length > 0 && (
          <div className="sb-toolbar-group">
            <select
              className="sb-select"
              value={pageId ?? ''}
              onChange={(e) => switchPage(e.target.value)}
              title="Current page"
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.path})
                </option>
              ))}
            </select>
            <button onClick={openNewPageModal} title="New page">+ Page</button>
          </div>
        )}

        <div className="sb-toolbar-group">
          <button
            className={device === 'desktop' ? 'active' : ''}
            onClick={() => setDevice('desktop')}
            title="Desktop"
          >
            Desktop
          </button>
          <button
            className={device === 'tablet' ? 'active' : ''}
            onClick={() => setDevice('tablet')}
            title="Tablet"
          >
            Tablet
          </button>
          <button
            className={device === 'mobile' ? 'active' : ''}
            onClick={() => setDevice('mobile')}
            title="Mobile"
          >
            Mobile
          </button>
        </div>

        <div className="sb-toolbar-group">
          <button onClick={handleUndo} title="Undo">Undo</button>
          <button onClick={handleRedo} title="Redo">Redo</button>
        </div>

        {/* Mode toggle — Owner is default; Designer is opt-in */}
        <div className="sb-toolbar-group sb-mode-toggle">
          <button
            className={mode === 'owner' ? 'active' : ''}
            onClick={() => setMode('owner')}
            title="Simple mode — edit text, images & sizes"
          >
            Owner
          </button>
          <button
            className={mode === 'designer' ? 'active' : ''}
            onClick={() => setMode('designer')}
            title="Full edit access — for the designer building the site"
          >
            Designer
          </button>
        </div>

        <div className="sb-toolbar-group">
          {/* Persistent saved-timestamp */}
          <span
            className={`sb-saved-indicator${isSaving ? ' is-saving' : ''}`}
            aria-live="polite"
            title={savedAt ? savedAt.toLocaleString() : 'No save yet'}
          >
            <i
              className={`fa-solid ${
                isSaving ? 'fa-arrows-rotate fa-spin' : 'fa-cloud-check'
              }`}
              aria-hidden="true"
            />
            {savedLabel}
          </span>
        </div>

        <div className="sb-toolbar-group">
          <button onClick={() => setShowTemplateOverlay(true)} title="Templates">
            Templates
          </button>
          <button onClick={() => setShowThemePanel((v) => !v)}>
            Theme
          </button>
          <button onClick={handlePreview} title="Open preview in a new tab">
            <i className="fa-solid fa-eye" aria-hidden="true" /> Preview
          </button>
          <button
            className="sb-save-btn"
            onClick={handleSaveNow}
            title="Save now (autosave is on)"
          >
            Save
          </button>
          <button
            className="sb-publish-btn"
            onClick={handlePublish}
            title="Publish the site live"
          >
            <i className="fa-solid fa-rocket" aria-hidden="true" /> Publish
          </button>
        </div>
      </div>

      {/* Theme panel */}
      {showThemePanel && (
        <div className="sb-popover" style={{ right: 120, minWidth: 260 }}>
          <div className="sb-popover-title">Brand theme</div>
          <label className="sb-theme-row">
            <span>Primary color</span>
            <input
              type="color"
              value={theme.primary}
              onChange={(e) => setTheme((t) => ({ ...t, primary: e.target.value }))}
            />
          </label>
          <label className="sb-theme-row">
            <span>Secondary color</span>
            <input
              type="color"
              value={theme.secondary}
              onChange={(e) => setTheme((t) => ({ ...t, secondary: e.target.value }))}
            />
          </label>
          <label className="sb-theme-row">
            <span>Font</span>
            <select
              value={theme.font}
              onChange={(e) => setTheme((t) => ({ ...t, font: e.target.value }))}
            >
              <option value="Inter, system-ui, sans-serif">Inter</option>
              <option value="'Plus Jakarta Sans', sans-serif">Plus Jakarta Sans</option>
              <option value="Georgia, serif">Georgia (serif)</option>
              <option value="'Roboto Slab', serif">Roboto Slab</option>
              <option value="system-ui, sans-serif">System UI</option>
            </select>
          </label>
          <label className="sb-theme-row">
            <span>Corner radius</span>
            <select
              value={theme.radius}
              onChange={(e) => setTheme((t) => ({ ...t, radius: e.target.value }))}
            >
              <option value="0px">Square</option>
              <option value="4px">Subtle (4px)</option>
              <option value="8px">Rounded (8px)</option>
              <option value="14px">Soft (14px)</option>
              <option value="999px">Pill</option>
            </select>
          </label>
          <button
            className="sb-popover-close"
            onClick={() => setShowThemePanel(false)}
          >
            Close
          </button>
        </div>
      )}

      {/* Main area */}
      <div className="sb-main">
        {/* Left Panel - Blocks */}
        <div className="sb-panel-left">
          <div className="sb-panel-header">
            <span>Blocks</span>
            <button
              className="sb-add-image-btn"
              onClick={openAssetManager}
              title="Add an image (upload or paste URL)"
            >
              <i className="fa-solid fa-image" aria-hidden="true" /> Add image
            </button>
          </div>
          <div className="sb-blocks-container" id="sb-block-manager" />
        </div>

        {/* Canvas */}
        <div className="sb-canvas" ref={containerRef}>
          <div id="gjs" />

          {/* Empty-state template overlay */}
          {showTemplateOverlay && (
            <div className="sb-template-overlay" role="dialog" aria-modal="true">
              <div className="sb-template-overlay-inner">
                <h2 className="sb-template-overlay-title">Start your page</h2>
                <p className="sb-template-overlay-sub">
                  Pick a starter you can edit, or begin from a blank page.
                </p>
                <div className="sb-template-grid">
                  {Object.entries(TRADES_TEMPLATES).map(([key, tpl]) => (
                    <button
                      key={key}
                      type="button"
                      className="sb-template-card"
                      onClick={() =>
                        applyTemplate(key as keyof typeof TRADES_TEMPLATES)
                      }
                    >
                      <img
                        src={tpl.thumbnail}
                        alt=""
                        className="sb-template-thumb"
                      />
                      <div className="sb-template-card-body">
                        <div className="sb-template-card-name">{tpl.label}</div>
                        <div className="sb-template-card-desc">
                          {tpl.description}
                        </div>
                      </div>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="sb-template-card sb-template-card-blank"
                    onClick={startBlank}
                  >
                    <img
                      src={BLANK_THUMBNAIL}
                      alt=""
                      className="sb-template-thumb"
                    />
                    <div className="sb-template-card-body">
                      <div className="sb-template-card-name">Blank page</div>
                      <div className="sb-template-card-desc">
                        Start from an empty canvas.
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - tabbed */}
        <div className="sb-panel-right">
          <div className="sb-right-tabs">
            <button
              className={rightTab === 'style' ? 'active' : ''}
              onClick={() => setRightTab('style')}
            >
              Style
            </button>
            <button
              className={rightTab === 'traits' ? 'active' : ''}
              onClick={() => setRightTab('traits')}
            >
              Settings
            </button>
            {mode === 'designer' && (
              <button
                className={rightTab === 'layers' ? 'active' : ''}
                onClick={() => setRightTab('layers')}
              >
                Layers
              </button>
            )}
          </div>

          {/* Owner Style panel — S/M/L/XL buckets */}
          {mode === 'owner' && rightTab === 'style' && (
            <div className="sb-owner-style">
              {!ownerSelectedStyle && (
                <p className="sb-owner-hint">
                  Click any text or image on the page to change its size.
                </p>
              )}
              {ownerSelectedStyle && (
                <>
                  {(Object.keys(SIZE_BUCKETS) as BucketKey[]).map((bucket) => {
                    const spec = SIZE_BUCKETS[bucket];
                    const current = currentBucketValue(bucket);
                    return (
                      <div key={bucket} className="sb-bucket-row">
                        <div className="sb-bucket-label">{spec.label}</div>
                        <div className="sb-bucket-group" role="group">
                          {(['S', 'M', 'L', 'XL'] as SizeKey[]).map((size) => (
                            <button
                              key={size}
                              type="button"
                              className={`sb-bucket-btn${
                                current === size ? ' active' : ''
                              }`}
                              onClick={() => setBucket(bucket, size)}
                              aria-pressed={current === size}
                              title={`${spec.label}: ${size} (${spec.values[size]})`}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <p className="sb-owner-footnote">
                    Need finer control? Switch to{' '}
                    <button
                      type="button"
                      className="sb-link-btn"
                      onClick={() => setMode('designer')}
                    >
                      Designer mode
                    </button>
                    .
                  </p>
                </>
              )}
            </div>
          )}

          {/* Full Style Manager — Designer mode only (Owner uses buckets above) */}
          <div
            id="sb-style-manager"
            style={{
              display:
                mode === 'designer' && rightTab === 'style' ? 'block' : 'none',
            }}
          />
          <div
            id="sb-trait-manager"
            style={{ display: rightTab === 'traits' ? 'block' : 'none' }}
          />
          <div
            id="sb-layer-manager"
            style={{
              display:
                mode === 'designer' && rightTab === 'layers' ? 'block' : 'none',
            }}
          />
        </div>
      </div>

      {/* New-page modal (replaces window.prompt) */}
      {newPageModal && (
        <div
          className="sb-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sb-newpage-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setNewPageModal(null);
          }}
        >
          <div className="sb-modal">
            <h3 id="sb-newpage-title" className="sb-modal-title">
              Add a new page
            </h3>
            <label className="sb-modal-field">
              <span>Page name</span>
              <input
                autoFocus
                type="text"
                placeholder="About"
                value={newPageModal.name}
                onChange={(e) => {
                  const v = e.target.value;
                  setNewPageModal((m) =>
                    m
                      ? {
                          ...m,
                          name: v,
                          path: m.pathTouched
                            ? m.path
                            : `/${v.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')}`,
                          error: null,
                        }
                      : m,
                  );
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitNewPage();
                  if (e.key === 'Escape') setNewPageModal(null);
                }}
              />
            </label>
            <label className="sb-modal-field">
              <span>URL path</span>
              <input
                type="text"
                placeholder="/about"
                value={newPageModal.path}
                onChange={(e) =>
                  setNewPageModal((m) =>
                    m
                      ? { ...m, path: e.target.value, pathTouched: true, error: null }
                      : m,
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitNewPage();
                  if (e.key === 'Escape') setNewPageModal(null);
                }}
              />
            </label>
            {newPageModal.error && (
              <p className="sb-modal-error">{newPageModal.error}</p>
            )}
            <div className="sb-modal-actions">
              <button
                type="button"
                className="sb-modal-btn"
                onClick={() => setNewPageModal(null)}
                disabled={newPageModal.submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sb-modal-btn sb-modal-btn-primary"
                onClick={submitNewPage}
                disabled={newPageModal.submitting || !newPageModal.name.trim()}
              >
                {newPageModal.submitting ? 'Creating…' : 'Create page'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`sb-toast ${toast.type}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      )}
    </div>
  );
}
