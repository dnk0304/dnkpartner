# GrapesJS Site Builder — Coding Task

You are building a **GrapesJS-powered Site Builder** module inside the DNK AI Studio React app.

## Project location
`C:\Users\D\Desktop\dprosjekt\dennisproject`

## Context
- React + Vite frontend (`src/`)
- Express backend (`server/`)
- Routing via `react-router-dom` in `src/main.tsx`
- Existing routes: `/`, `/ai-trends`, `/health`, `/video-editor`
- TypeScript throughout. Keep types clean.
- UI style: dark theme (see existing components for patterns)

---

## Step 1: Install packages

```
npm install grapesjs grapesjs-blocks-basic grapesjs-preset-webpage grapesjs-plugin-forms grapesjs-component-countdown grapesjs-tabs grapesjs-custom-code
npm install --save-dev @types/grapesjs
```

---

## Step 2: Create `src/components/SiteBuilder/SiteBuilder.tsx`

A React component that:
- Mounts GrapesJS in a `useRef` div with `id="gjs"`
- Calls `editor.destroy()` in the useEffect cleanup
- Has a top toolbar: device preview buttons (desktop/tablet/mobile), undo, redo, save, export buttons
- Has a left panel: "Blocks" tab with draggable block items
- Has a right panel: "Style Manager" for editing selected component styles
- Loads Panini Pano CSS in canvas.styles (from `/api/site-builder/load`)
- Has a "Load Project" button that calls `POST /api/site-builder/load` and loads HTML+CSS into GrapesJS
- Has a "Save" button that calls `POST /api/site-builder/save` with the current HTML+CSS
- Shows success/error toast messages for save operations

GrapesJS init config:
```js
grapesjs.init({
  container: '#gjs',
  fromElement: false,
  height: '100%',
  width: 'auto',
  storageManager: false,
  plugins: ['grapesjs-blocks-basic', 'grapesjs-preset-webpage', 'grapesjs-plugin-forms', 'grapesjs-custom-code'],
  canvas: {
    styles: [],
    scripts: [],
  },
  panels: { defaults: [] },
});
```

---

## Step 3: Create custom blocks in `src/components/SiteBuilder/blocks/index.ts`

Register these 8 blocks via `editor.BlockManager.add()`:

1. **hero-section** — Video/image background + overlay text + CTA buttons
2. **book-grid** — 4-column grid of book cards with hover effects
3. **video-carousel** — Horizontal scroll row of video cards
4. **testimonial-section** — Star rating + quote + author cards
5. **cta-banner** — Full-width colored banner with centered heading + button
6. **footer-block** — Multi-column footer with links + social icons + copyright
7. **faq-accordion** — 3 expandable Q&A items
8. **pricing-table** — 3-tier pricing cards (Basic/Pro/Premium)

Each block: `{ label, content (HTML string), category, attributes }`

---

## Step 4: Create `server/siteBuilder.ts`

Express router with these routes:

### POST `/api/site-builder/load`
```json
Request: { "projectPath": "C:\\Users\\D\\Desktop\\panini-pano-website\\index.html" }
Response: { "html": "<body content>", "css": "<style.css content>", "projectPath": "..." }
```
- Reads the HTML file
- Extracts body innerHTML
- Reads the adjacent style.css
- Returns both

### POST `/api/site-builder/save`
```json
Request: { "projectPath": "...", "html": "...", "css": "..." }
Response: { "success": true, "message": "Saved" }
```
- Writes the HTML back (replace body content)
- Writes CSS to style.css
- Creates a `.backup` file before overwriting

### GET `/api/site-builder/projects`
- Scans `C:\Users\D\Desktop\panini-pano-website\` for index.html
- Also scans any other folder that has index.html (1 level deep from Desktop)
- Returns: `[{ name, path, lastModified }]`

### POST `/api/site-builder/export`
```json
Request: { "projectPath": "...", "html": "...", "css": "..." }
Response: { "success": true, "exportPath": "..." }
```
- Saves clean exported versions to a `/export/` subfolder

---

## Step 5: Create template files

`src/components/SiteBuilder/templates/coloring-book-store/index.html` — A minimal coloring book store page HTML with:
- Nav bar
- Hero section with heading
- 4-book grid section
- CTA banner
- Footer

`src/components/SiteBuilder/templates/lead-gen-landing/index.html` — A minimal lead gen page with:
- Hero with email signup form
- 3 feature bullets
- Testimonial
- Footer

---

## Step 6: Create `src/components/SiteBuilder/SiteBuilder.css`

Styles for the editor shell (not the GrapesJS canvas):
- Dark theme wrapping UI
- Top toolbar with flex layout
- Left/right panel sidebar styling
- Hide GrapesJS default panels (override `.gjs-*` classes)
- Responsive: panels collapse on <900px

---

## Step 7: Add route to `src/main.tsx`

Add import and route:
```tsx
import { SiteBuilder } from './components/SiteBuilder/SiteBuilder'
// ...
<Route path="/site-builder" element={<SiteBuilder />} />
```

Also register the server router in `server/index.ts`:
```ts
import { siteBuilderRouter } from './siteBuilder'
// ...
app.use('/api/site-builder', siteBuilderRouter)
```

---

## File structure to create:
```
src/components/SiteBuilder/
├── SiteBuilder.tsx
├── SiteBuilder.css
├── blocks/
│   └── index.ts
└── templates/
    ├── coloring-book-store/
    │   └── index.html
    └── lead-gen-landing/
        └── index.html
server/
└── siteBuilder.ts
```

---

## Quality rules
- No `any` types unless absolutely unavoidable
- Use `fs/promises` in server code
- GrapesJS import: `import grapesjs from 'grapesjs'`
- CSS import in component: `import './SiteBuilder.css'`
- Import GrapesJS CSS: `import 'grapesjs/dist/css/grapes.min.css'`
- Handle missing files gracefully (try/catch with meaningful errors)
- Match dark UI theme of the rest of the app

---

## When done, run this to notify:
```
openclaw system event --text "Done: GrapesJS SiteBuilder built — routes, server, blocks, templates all ready" --mode now
```
