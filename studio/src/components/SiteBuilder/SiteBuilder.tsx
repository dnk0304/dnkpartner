import { useEffect, useRef, useState, useCallback } from 'react';
import grapesjs, { Editor } from 'grapesjs';
import gjsBlocksBasic from 'grapesjs-blocks-basic';
import gjsPresetWebpage from 'grapesjs-preset-webpage';
import gjsPluginForms from 'grapesjs-plugin-forms';
import gjsCustomCode from 'grapesjs-custom-code';
import { registerCustomBlocks } from './blocks';
import { registerCustomTypes, applyOwnerLocks } from './componentTypes';
import { TRADES_TEMPLATES } from './templates/trades';
import './SiteBuilder.css';

interface Toast {
  message: string;
  type: 'success' | 'error';
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

const LS_KEYS = {
  siteId: 'dnk.editor.lastSiteId',
  pageId: 'dnk.editor.lastPageId',
  mode: 'dnk.editor.mode',
};

const FA_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';

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
  const [mode, setMode] = useState<EditMode>(
    (localStorage.getItem(LS_KEYS.mode) as EditMode) || 'designer',
  );
  const [rightTab, setRightTab] = useState<RightTab>('style');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showThemePanel, setShowThemePanel] = useState(false);

  const showToast = useCallback((message: string, type: Toast['type']) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ─────────────────────────────────────────────────────────
  // Site / page pick-or-create on mount
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1. Resolve site (pick first / restore / create)
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

        // 2. Resolve pages
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

        // pick last-used or first
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

    // Mount style manager
    const smEl = document.getElementById('sb-style-manager');
    if (smEl) {
      const smSectors = editor.StyleManager.render();
      if (smSectors) smEl.appendChild(smSectors);
    }

    // Mount trait manager (Settings tab)
    const tmEl = document.getElementById('sb-trait-manager');
    if (tmEl) {
      const traitsEl = editor.TraitManager.render();
      if (traitsEl) tmEl.appendChild(traitsEl);
    }

    // Mount layer manager
    const lmEl = document.getElementById('sb-layer-manager');
    if (lmEl) {
      const layersEl = editor.LayerManager.render();
      if (layersEl) lmEl.appendChild(layersEl);
    }

    // Mount block manager
    const bmEl = document.getElementById('sb-block-manager');
    if (bmEl) {
      const blocks = editor.BlockManager.render([], { external: true });
      if (blocks) bmEl.appendChild(blocks);
    }

    // Re-apply locks when components are added/loaded (Owner mode)
    const reapplyLocks = () => {
      if ((localStorage.getItem(LS_KEYS.mode) as EditMode) === 'owner') {
        applyOwnerLocks(editor, true);
      }
    };
    editor.on('component:add', reapplyLocks);
    editor.on('load', reapplyLocks);
    editor.on('storage:load', reapplyLocks);

    // Toast on autosave events for UX feedback
    editor.on('storage:store', () => showToast('Saved', 'success'));
    editor.on('storage:error:store', () => showToast('Save failed', 'error'));

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
  }, [mode]);

  const handleUndo = () => editorRef.current?.UndoManager.undo();
  const handleRedo = () => editorRef.current?.UndoManager.redo();

  const handleSaveNow = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      await editor.store();
      showToast('Saved', 'success');
    } catch {
      showToast('Save failed', 'error');
    }
  };

  const handleAddPage = async () => {
    if (!site) return;
    const name = window.prompt('New page name:', 'About');
    if (!name) return;
    const path = window.prompt('Page path (e.g. /about):', `/${name.toLowerCase()}`);
    if (!path) return;
    try {
      const res = await fetch(`/api/site-builder/sites/${site.id}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path }),
      });
      if (!res.ok) throw new Error(`pages POST ${res.status}`);
      const created: Page = await res.json();
      setPages((prev) => [...prev, created]);
      switchPage(created.id);
    } catch (err) {
      showToast('Failed to create page', 'error');
    }
  };

  const switchPage = (newPageId: string) => {
    if (newPageId === pageId) return;
    localStorage.setItem(LS_KEYS.pageId, newPageId);
    // destroy current editor + re-init with new urls (pattern 1 from brief)
    editorRef.current?.destroy();
    editorRef.current = null;
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
    setShowTemplatePicker(false);
    showToast(`Applied template: ${tpl.label}`, 'success');
  };

  // ─────────────────────────────────────────────────────────
  // Theme tokens (CSS vars on canvas root)
  // ─────────────────────────────────────────────────────────
  const [theme, setTheme] = useState({
    primary: '#7c3aed',
    secondary: '#ec4899',
    font: 'Inter, system-ui, sans-serif',
    radius: '8px',
  });

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
            <button onClick={handleAddPage} title="New page">+ Page</button>
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

        {/* Mode toggle — make-or-break for owner-safe editing */}
        <div className="sb-toolbar-group sb-mode-toggle">
          <button
            className={mode === 'designer' ? 'active' : ''}
            onClick={() => setMode('designer')}
            title="Full edit access — for the designer building the site"
          >
            Designer
          </button>
          <button
            className={mode === 'owner' ? 'active' : ''}
            onClick={() => setMode('owner')}
            title="Locked structure — owner can only edit text, images & links"
          >
            Owner
          </button>
        </div>

        <div className="sb-toolbar-group">
          <button onClick={() => setShowTemplatePicker((v) => !v)}>
            Templates
          </button>
          <button onClick={() => setShowThemePanel((v) => !v)}>
            Theme
          </button>
          <button className="sb-save-btn" onClick={handleSaveNow} title="Save now (autosave is on)">
            Save
          </button>
        </div>
      </div>

      {/* Template picker dropdown */}
      {showTemplatePicker && (
        <div className="sb-popover" style={{ right: 200 }}>
          <div className="sb-popover-title">Start from a trades template</div>
          {Object.entries(TRADES_TEMPLATES).map(([key, tpl]) => (
            <button
              key={key}
              className="sb-popover-item"
              onClick={() => applyTemplate(key as keyof typeof TRADES_TEMPLATES)}
            >
              <div className="sb-popover-item-name">{tpl.label}</div>
              <div className="sb-popover-item-desc">{tpl.description}</div>
            </button>
          ))}
          <button
            className="sb-popover-close"
            onClick={() => setShowTemplatePicker(false)}
          >
            Close
          </button>
        </div>
      )}

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
          <div className="sb-panel-header">Blocks</div>
          <div className="sb-blocks-container" id="sb-block-manager" />
        </div>

        {/* Canvas */}
        <div className="sb-canvas" ref={containerRef}>
          <div id="gjs" />
        </div>

        {/* Right Panel - tabbed (Style / Settings / Layers) */}
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
            <button
              className={rightTab === 'layers' ? 'active' : ''}
              onClick={() => setRightTab('layers')}
            >
              Layers
            </button>
          </div>
          <div
            id="sb-style-manager"
            style={{ display: rightTab === 'style' ? 'block' : 'none' }}
          />
          <div
            id="sb-trait-manager"
            style={{ display: rightTab === 'traits' ? 'block' : 'none' }}
          />
          <div
            id="sb-layer-manager"
            style={{ display: rightTab === 'layers' ? 'block' : 'none' }}
          />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`sb-toast ${toast.type}`}>{toast.message}</div>
      )}
    </div>
  );
}
