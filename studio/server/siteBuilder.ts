import { Router, Request, Response } from 'express';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const siteBuilderRouter = Router();

interface LoadRequest {
  projectPath: string;
}

interface SaveRequest {
  projectPath: string;
  html: string;
  css: string;
}

// POST /load - Load an HTML project into the editor
siteBuilderRouter.post('/load', async (req: Request, res: Response) => {
  try {
    const { projectPath } = req.body as LoadRequest;
    if (!projectPath) {
      return res.status(400).json({ error: 'projectPath is required' });
    }

    const htmlPath = projectPath.endsWith('.html') ? projectPath : path.join(projectPath, 'index.html');
    const dir = path.dirname(htmlPath);
    const cssPath = path.join(dir, 'style.css');

    let htmlContent: string;
    try {
      htmlContent = await fs.readFile(htmlPath, 'utf-8');
    } catch {
      return res.status(404).json({ error: `HTML file not found: ${htmlPath}` });
    }

    // Extract body content
    const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1].trim() : htmlContent;

    // Try to read CSS
    let cssContent = '';
    try {
      cssContent = await fs.readFile(cssPath, 'utf-8');
    } catch {
      // No CSS file, that's fine
    }

    res.json({ html: bodyHtml, css: cssContent, projectPath: htmlPath });
  } catch (err) {
    console.error('[SiteBuilder] Load error:', err);
    res.status(500).json({ error: 'Failed to load project' });
  }
});

// POST /save - Save HTML+CSS back to project files
siteBuilderRouter.post('/save', async (req: Request, res: Response) => {
  try {
    const { projectPath, html, css } = req.body as SaveRequest;
    if (!projectPath || html === undefined) {
      return res.status(400).json({ error: 'projectPath and html are required' });
    }

    const htmlPath = projectPath.endsWith('.html') ? projectPath : path.join(projectPath, 'index.html');
    const dir = path.dirname(htmlPath);
    const cssPath = path.join(dir, 'style.css');

    // Read existing HTML to preserve head
    let existingHtml: string;
    try {
      existingHtml = await fs.readFile(htmlPath, 'utf-8');
    } catch {
      existingHtml = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Site</title><link rel="stylesheet" href="style.css" /></head><body></body></html>';
    }

    // Create backup
    try {
      await fs.copyFile(htmlPath, htmlPath + '.backup');
    } catch {
      // Original might not exist yet
    }

    // Replace body content
    const headMatch = existingHtml.match(/<head[^>]*>[\s\S]*?<\/head>/i);
    const head = headMatch ? headMatch[0] : '<head><meta charset="UTF-8" /><title>Site</title><link rel="stylesheet" href="style.css" /></head>';
    const newHtml = `<!DOCTYPE html>\n<html lang="en">\n${head}\n<body>\n${html}\n</body>\n</html>`;

    await fs.writeFile(htmlPath, newHtml, 'utf-8');

    // Write CSS
    if (css !== undefined) {
      try {
        await fs.copyFile(cssPath, cssPath + '.backup');
      } catch {
        // No existing CSS
      }
      await fs.writeFile(cssPath, css, 'utf-8');
    }

    res.json({ success: true, message: 'Project saved successfully' });
  } catch (err) {
    console.error('[SiteBuilder] Save error:', err);
    res.status(500).json({ error: 'Failed to save project' });
  }
});

// GET /projects - List available projects
siteBuilderRouter.get('/projects', async (_req: Request, res: Response) => {
  try {
    const desktopPath = path.join('C:', 'Users', 'D', 'Desktop');
    const projects: Array<{ name: string; path: string; lastModified: string }> = [];

    // Check panini-pano-website specifically
    const paniniPath = path.join(desktopPath, 'panini-pano-website', 'index.html');
    try {
      const stat = await fs.stat(paniniPath);
      projects.push({
        name: 'panini-pano-website',
        path: paniniPath,
        lastModified: stat.mtime.toISOString(),
      });
    } catch {
      // Doesn't exist
    }

    // Scan desktop 1 level deep for other folders with index.html
    try {
      const entries = await fs.readdir(desktopPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'panini-pano-website') continue;
        const indexPath = path.join(desktopPath, entry.name, 'index.html');
        try {
          const stat = await fs.stat(indexPath);
          projects.push({
            name: entry.name,
            path: indexPath,
            lastModified: stat.mtime.toISOString(),
          });
        } catch {
          // No index.html in this folder
        }
      }
    } catch {
      // Can't read desktop
    }

    res.json(projects);
  } catch (err) {
    console.error('[SiteBuilder] Projects list error:', err);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// POST /export - Export clean versions
siteBuilderRouter.post('/export', async (req: Request, res: Response) => {
  try {
    const { projectPath, html, css } = req.body as SaveRequest;
    if (!projectPath || html === undefined) {
      return res.status(400).json({ error: 'projectPath and html are required' });
    }

    const htmlPath = projectPath.endsWith('.html') ? projectPath : path.join(projectPath, 'index.html');
    const dir = path.dirname(htmlPath);
    const exportDir = path.join(dir, 'export');

    await fs.mkdir(exportDir, { recursive: true });

    const exportHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Exported Site</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
${html}
</body>
</html>`;

    const exportHtmlPath = path.join(exportDir, 'index.html');
    const exportCssPath = path.join(exportDir, 'style.css');

    await fs.writeFile(exportHtmlPath, exportHtml, 'utf-8');
    if (css) {
      await fs.writeFile(exportCssPath, css, 'utf-8');
    }

    res.json({ success: true, exportPath: exportDir });
  } catch (err) {
    console.error('[SiteBuilder] Export error:', err);
    res.status(500).json({ error: 'Failed to export project' });
  }
});
