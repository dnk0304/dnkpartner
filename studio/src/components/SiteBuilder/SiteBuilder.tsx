import { useEffect, useRef, useState, useCallback } from 'react';
import grapesjs, { Editor } from 'grapesjs';
import gjsBlocksBasic from 'grapesjs-blocks-basic';
import gjsPresetWebpage from 'grapesjs-preset-webpage';
import gjsPluginForms from 'grapesjs-plugin-forms';
import gjsCustomCode from 'grapesjs-custom-code';
import { registerCustomBlocks } from './blocks';
import './SiteBuilder.css';

interface Toast {
  message: string;
  type: 'success' | 'error';
}

interface ProjectInfo {
  name: string;
  path: string;
  lastModified: string;
}

export function SiteBuilder() {
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [toast, setToast] = useState<Toast | null>(null);
  const [projectPath, setProjectPath] = useState('');
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [showProjects, setShowProjects] = useState(false);

  const showToast = useCallback((message: string, type: Toast['type']) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Init GrapesJS
  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;

    const editor = grapesjs.init({
      container: '#gjs',
      fromElement: false,
      height: '100%',
      width: 'auto',
      storageManager: false,
      plugins: [gjsBlocksBasic, gjsPresetWebpage, gjsPluginForms, gjsCustomCode],
      canvas: {
        styles: [],
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

    // Register custom blocks
    registerCustomBlocks(editor);

    // Mount style manager into right panel
    const smEl = document.getElementById('sb-style-manager');
    if (smEl) {
      const smSectors = editor.StyleManager.render();
      if (smSectors) smEl.appendChild(smSectors);
    }

    // Mount block manager into left panel
    const bmEl = document.getElementById('sb-block-manager');
    if (bmEl) {
      const blocks = editor.BlockManager.render([], { external: true });
      if (blocks) bmEl.appendChild(blocks);
    }

    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  // Device switching
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const deviceMap = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };
    editor.setDevice(deviceMap[device]);
  }, [device]);

  const handleUndo = () => editorRef.current?.UndoManager.undo();
  const handleRedo = () => editorRef.current?.UndoManager.redo();

  const handleSave = async () => {
    const editor = editorRef.current;
    if (!editor || !projectPath) {
      showToast('No project loaded. Load a project first.', 'error');
      return;
    }

    try {
      const html = editor.getHtml();
      const css = editor.getCss() ?? '';
      const resp = await fetch('/api/site-builder/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, html, css }),
      });
      const data = await resp.json();
      if (data.success) {
        showToast('Project saved successfully!', 'success');
      } else {
        showToast(data.error || 'Save failed', 'error');
      }
    } catch (err) {
      showToast('Failed to save project', 'error');
    }
  };

  const handleExport = async () => {
    const editor = editorRef.current;
    if (!editor || !projectPath) {
      showToast('No project loaded', 'error');
      return;
    }

    try {
      const html = editor.getHtml();
      const css = editor.getCss() ?? '';
      const resp = await fetch('/api/site-builder/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, html, css }),
      });
      const data = await resp.json();
      if (data.success) {
        showToast(`Exported to ${data.exportPath}`, 'success');
      } else {
        showToast(data.error || 'Export failed', 'error');
      }
    } catch (err) {
      showToast('Failed to export', 'error');
    }
  };

  const loadProject = async (path: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    try {
      const resp = await fetch('/api/site-builder/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: path }),
      });
      const data = await resp.json();

      if (data.error) {
        showToast(data.error, 'error');
        return;
      }

      editor.setComponents(data.html);
      if (data.css) {
        editor.setStyle(data.css);
      }
      setProjectPath(data.projectPath);
      setShowProjects(false);
      showToast(`Loaded: ${data.projectPath}`, 'success');
    } catch (err) {
      showToast('Failed to load project', 'error');
    }
  };

  const fetchProjects = async () => {
    try {
      const resp = await fetch('/api/site-builder/projects');
      const data = await resp.json();
      setProjects(data);
      setShowProjects(true);
    } catch {
      showToast('Failed to fetch projects', 'error');
    }
  };

  return (
    <div className="site-builder">
      {/* Toolbar */}
      <div className="sb-toolbar">
        <span className="sb-toolbar-title">Site Builder</span>

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

        <div className="sb-toolbar-group">
          <button onClick={fetchProjects}>Load Project</button>
          <button className="sb-save-btn" onClick={handleSave}>Save</button>
          <button onClick={handleExport}>Export</button>
        </div>
      </div>

      {/* Project picker dropdown */}
      {showProjects && (
        <div
          style={{
            position: 'absolute',
            top: 52,
            right: 120,
            zIndex: 100,
            background: '#14141f',
            border: '1px solid #2a2a3d',
            borderRadius: 8,
            padding: 8,
            minWidth: 300,
            maxHeight: 300,
            overflowY: 'auto',
          }}
        >
          <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Available Projects
          </div>
          {projects.length === 0 && (
            <div style={{ padding: '12px', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
              No projects found
            </div>
          )}
          {projects.map((p) => (
            <button
              key={p.path}
              onClick={() => loadProject(p.path)}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontSize: '0.85rem',
                textAlign: 'left',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#1c1c2a')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                {new Date(p.lastModified).toLocaleDateString()}
              </div>
            </button>
          ))}
          <button
            onClick={() => setShowProjects(false)}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 12px',
              background: 'transparent',
              border: 'none',
              borderTop: '1px solid #2a2a3d',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              marginTop: 4,
            }}
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

        {/* Right Panel - Style Manager */}
        <div className="sb-panel-right">
          <div className="sb-panel-header">Style Manager</div>
          <div id="sb-style-manager" />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`sb-toast ${toast.type}`}>{toast.message}</div>
      )}
    </div>
  );
}
