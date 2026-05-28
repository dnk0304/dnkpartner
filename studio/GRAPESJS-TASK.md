# GrapesJS Integration Task — DNK AI Studio

## Goal
Add a visual Site Builder module to DNK AI Studio using GrapesJS. Must be able to load, edit, and export the Panini Pano website (`C:\Users\D\Desktop\panini-pano-website\`) visually.

## Step 1: Install GrapesJS
```bash
cd C:\Users\D\Desktop\dprosjekt\dennisproject
npm install grapesjs grapesjs-blocks-basic grapesjs-preset-webpage grapesjs-plugin-forms grapesjs-component-countdown grapesjs-tabs grapesjs-custom-code
```

## Step 2: Create SiteBuilder Component
Create `src/components/SiteBuilder/SiteBuilder.tsx`

Features:
- Full GrapesJS editor embedded in React via useRef + useEffect
- Left sidebar: Blocks panel (drag & drop components)
- Right sidebar: Style manager (colors, spacing, fonts, borders)
- Top bar: Device preview (desktop/tablet/mobile), undo/redo, export
- Canvas: Live editable preview of the loaded HTML

Key GrapesJS config:
```js
const editor = grapesjs.init({
  container: '#gjs',
  fromElement: false,
  height: '100vh',
  width: 'auto',
  storageManager: false, // We handle save ourselves
  plugins: ['grapesjs-blocks-basic', 'grapesjs-preset-webpage', 'grapesjs-plugin-forms'],
  canvas: {
    styles: [], // Load external CSS here
    scripts: [],
  },
  panels: { defaults: [] }, // Custom panels
  blockManager: { ... }, // Custom blocks
});
```

## Step 3: Custom Panini Pano Blocks
Register reusable blocks specific to our sites:

1. **Hero Section** — Video/image background + overlay text + CTA buttons
2. **Book Grid** — Stacked series cards with spider web expand
3. **Video Carousel** — Horizontal scrolling video cards with product links
4. **Peek Inside Grid** — 2-image preview per book with zoom overlay
5. **Digital Collection Grid** — Product cards with price + coming soon badges
6. **Testimonial Section** — Star ratings + customer quotes
7. **CTA Banner** — Full-width colored banner with button
8. **Footer** — Multi-column links + social icons + branding
9. **FAQ Accordion** — Expandable Q&A items
10. **Pricing Table** — Tiered pricing comparison

Each block = HTML template + default styles + editable fields.

## Step 4: Server Routes
Create `server/siteBuilder.ts`:

### POST /api/site-builder/load
- Reads an HTML file from disk
- Extracts `<style>` and `<link>` CSS
- Returns `{ html, css, components }` for GrapesJS

### POST /api/site-builder/save
- Receives `{ html, css }` from GrapesJS
- Writes back to the source HTML file
- Injects CSS into the corresponding style.css

### POST /api/site-builder/export
- Exports clean HTML + CSS + JS as a zip
- Or saves to a target directory (e.g., for Netlify deploy)

### GET /api/site-builder/projects
- Lists available website projects (folders with index.html)
- Returns project name, path, thumbnail

### POST /api/site-builder/new
- Creates a new site project from a template
- Copies template folder → new project directory

## Step 5: Template System
Create `src/components/SiteBuilder/templates/`:
- `coloring-book-store/` — Based on Panini Pano structure
- `lead-gen-landing/` — For projects like Segunda Ley
- `blank/` — Minimal starter

Each template = `index.html` + `style.css` + `assets/` folder.

## Step 6: Add Route to DNK Studio
In `src/App.tsx`, add route:
```tsx
<Route path="/site-builder" element={<SiteBuilder />} />
<Route path="/site-builder/:projectId" element={<SiteBuilder />} />
```

Add navigation link in sidebar/nav.

## Step 7: AI Block Generation (stretch goal)
Add a button "Generate Section with AI" that:
1. Takes a text prompt ("hero section for a coloring book store")
2. Calls Gemini to generate HTML + CSS
3. Inserts it as a new block in the editor

## Technical Notes
- GrapesJS is vanilla JS — use useRef to mount it in React
- Cleanup: `editor.destroy()` in useEffect return
- The editor needs the CSS loaded separately via `canvas.styles`
- For Panini Pano: load `index.html` body content + `style.css` into editor
- Preserve `<script>` tags but don't execute in editor (handle via custom code plugin)
- Font loading: include Google Fonts links in canvas config

## File Structure
```
src/components/SiteBuilder/
├── SiteBuilder.tsx          # Main component with GrapesJS
├── SiteBuilder.css          # Editor UI styling
├── blocks/
│   ├── heroBlock.ts         # Hero section block definition
│   ├── bookGridBlock.ts     # Book grid block
│   ├── carouselBlock.ts     # Video carousel block
│   ├── peekInsideBlock.ts   # Preview grid block
│   ├── ctaBlock.ts          # CTA banner block
│   ├── footerBlock.ts       # Footer block
│   ├── faqBlock.ts          # FAQ accordion block
│   └── index.ts             # Register all blocks
├── panels/
│   ├── topbar.ts            # Device preview + actions
│   └── sidebar.ts           # Block categories
└── templates/
    ├── coloring-book-store/
    │   ├── index.html
    │   ├── style.css
    │   └── preview.png
    └── lead-gen-landing/
        ├── index.html
        ├── style.css
        └── preview.png
```

## Step 8: Panini Pano Website QA + Improvements
After GrapesJS is built, open the Panini Pano website in the browser and do a full click-through review. Fix anything that looks off.

### Specific changes requested:
1. **Restructure In Motion section** — Instead of a generic carousel of random videos, organize videos BY BOOK SERIES:
   - **Goodbye Stress** row: 3 promo videos (1 per book in the series)
   - **Adult Relaxation** row: 5 promo videos (1 per book)
   - **Kids** row: 1 promo video
   - Each video card links to its specific Amazon product page
   - Series title above each row
   
2. **Reduce video overload** — The page currently feels heavy with too many videos. Keep it clean:
   - Hero video background stays
   - In Motion becomes organized series rows (above)
   - Remove any duplicate or redundant video references elsewhere on the page

3. **General improvements** — Click through every section and fix:
   - Broken links or missing images
   - Spacing/alignment issues
   - Mobile responsiveness
   - Text that could be better
   - Any sections that feel redundant or empty
   - Ensure all "Coming Soon" buttons are consistent
   - Make sure click-to-zoom works on all images
   - Check carousel arrows actually work
   - Verify spider web book expand animation is smooth

4. **Generate missing promo videos** — If any books don't have a 30s promo video yet, generate them using Veo 3.1 (only 1 at a time, respect rate limits). Save to `images/generated/video/book-promos/`

### Use browser automation to:
- Navigate to `http://localhost:8888` (start server with `node serve.js` in panini-pano-website/)
- Screenshot each section
- Click interactive elements (carousel, spider web, zoom)
- Test on mobile viewport (375px width)
- Log all issues found and fixed to memory/2026-03-27.md

## Success Criteria
1. Can open DNK Studio → Site Builder → load Panini Pano website
2. Can visually edit text, images, colors, spacing
3. Can drag new blocks onto the page
4. Can preview on desktop/tablet/mobile
5. Can save changes back to the HTML/CSS files
6. Can export as clean deployable site
