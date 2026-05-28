// Decorative Elements Library for KDP Covers
// SVG-based symbols, shapes, and decorative elements

export interface DecorativeElement {
  id: string
  name: string
  category: 'symbol' | 'animal' | 'nature' | 'ornament' | 'badge' | 'divider'
  svg: string // SVG path data or full SVG
  viewBox: string
  defaultSize: { width: number; height: number } // In 300 DPI pixels
  fillable: boolean // Can the fill color be changed?
  strokeable: boolean // Can the stroke color be changed?
}

export const DECORATIVE_ELEMENTS: DecorativeElement[] = [
  // SYMBOLS
  {
    id: 'star-solid',
    name: 'Star (Solid)',
    category: 'symbol',
    viewBox: '0 0 24 24',
    svg: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
    defaultSize: { width: 200, height: 200 },
    fillable: true,
    strokeable: true,
  },
  {
    id: 'heart-solid',
    name: 'Heart (Solid)',
    category: 'symbol',
    viewBox: '0 0 24 24',
    svg: '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>',
    defaultSize: { width: 200, height: 200 },
    fillable: true,
    strokeable: true,
  },
  {
    id: 'crown',
    name: 'Crown',
    category: 'symbol',
    viewBox: '0 0 24 24',
    svg: '<path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>',
    defaultSize: { width: 240, height: 200 },
    fillable: true,
    strokeable: true,
  },
  {
    id: 'diamond',
    name: 'Diamond',
    category: 'symbol',
    viewBox: '0 0 24 24',
    svg: '<path d="M12 2L2 8l10 14L22 8 12 2zm0 2.5L19.5 8 12 19.5 4.5 8 12 4.5z"/>',
    defaultSize: { width: 200, height: 220 },
    fillable: true,
    strokeable: true,
  },
  {
    id: 'sparkles',
    name: 'Sparkles',
    category: 'symbol',
    viewBox: '0 0 24 24',
    svg: '<path d="M12 1l2.5 6.5L21 10l-6.5 2.5L12 19l-2.5-6.5L3 10l6.5-2.5L12 1z"/><path d="M19 14l1.5 4L25 19.5 20.5 21 19 25l-1.5-4L13 19.5 17.5 18 19 14z" transform="scale(0.5) translate(24 10)"/>',
    defaultSize: { width: 200, height: 200 },
    fillable: true,
    strokeable: true,
  },
  {
    id: 'lightning',
    name: 'Lightning Bolt',
    category: 'symbol',
    viewBox: '0 0 24 24',
    svg: '<path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>',
    defaultSize: { width: 160, height: 240 },
    fillable: true,
    strokeable: true,
  },

  // ANIMALS
  {
    id: 'butterfly',
    name: 'Butterfly',
    category: 'animal',
    viewBox: '0 0 24 24',
    svg: '<path d="M12 2c-1 0-2 1-2 2v6c-2-1-4-2-5-1s-1 4 1 6c2 2 5 2 6 1v6c0 1 1 2 2 2s2-1 2-2v-6c1 1 4 1 6-1 2-2 2-5 1-6s-3 0-5 1V4c0-1-1-2-2-2zm-4 8c1 0 2 1 2 2s-1 2-2 2-2-1-2-2 1-2 2-2zm8 0c1 0 2 1 2 2s-1 2-2 2-2-1-2-2 1-2 2-2z"/>',
    defaultSize: { width: 220, height: 200 },
    fillable: true,
    strokeable: true,
  },
  {
    id: 'bird',
    name: 'Bird',
    category: 'animal',
    viewBox: '0 0 24 24',
    svg: '<path d="M20 10c0-1.1-.9-2-2-2h-2V5c0-1.7-1.3-3-3-3S10 3.3 10 5v3H8c-1.1 0-2 .9-2 2v2c0 2.2 1.8 4 4 4h2v6h4v-6h2c2.2 0 4-1.8 4-4v-2z"/><circle cx="15" cy="6" r="1"/>',
    defaultSize: { width: 200, height: 220 },
    fillable: true,
    strokeable: true,
  },
  {
    id: 'cat',
    name: 'Cat',
    category: 'animal',
    viewBox: '0 0 24 24',
    svg: '<path d="M12 2L8 8h2v12h4V8h2l-4-6z"/><path d="M6 10c-1.1 0-2 .9-2 2v8h4v-8c0-1.1-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2v8h4v-8c0-1.1-.9-2-2-2z"/><circle cx="10" cy="14" r="1"/><circle cx="14" cy="14" r="1"/>',
    defaultSize: { width: 200, height: 240 },
    fillable: true,
    strokeable: true,
  },

  // NATURE
  {
    id: 'flower',
    name: 'Flower',
    category: 'nature',
    viewBox: '0 0 24 24',
    svg: '<circle cx="12" cy="12" r="3"/><path d="M12 2c1 0 2 2 2 4 0 1-1 2-2 2s-2-1-2-2c0-2 1-4 2-4zm0 20c-1 0-2-2-2-4 0-1 1-2 2-2s2 1 2 2c0 2-1 4-2 4zm10-10c0 1-2 2-4 2-1 0-2-1-2-2s1-2 2-2c2 0 4 1 4 2zM2 12c0-1 2-2 4-2 1 0 2 1 2 2s-1 2-2 2c-2 0-4-1-4-2zm16.5-5.5c.7.7 0 2.5-1.5 4s-3.3 2.2-4 1.5-0-2.5 1.5-4 3.3-2.2 4-1.5zm-13 13c-.7-.7 0-2.5 1.5-4s3.3-2.2 4-1.5 0 2.5-1.5 4-3.3 2.2-4 1.5zm13 0c-.7.7-2.5 0-4-1.5s-2.2-3.3-1.5-4 2.5 0 4 1.5 2.2 3.3 1.5 4zm-13-13c.7-.7 2.5 0 4 1.5s2.2 3.3 1.5 4-2.5 0-4-1.5-2.2-3.3-1.5-4z"/>',
    defaultSize: { width: 220, height: 220 },
    fillable: true,
    strokeable: true,
  },
  {
    id: 'leaf',
    name: 'Leaf',
    category: 'nature',
    viewBox: '0 0 24 24',
    svg: '<path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.67C7.87 17.01 10.03 12 17 10c3.5-.83 5.5-1.5 5.5-4.5S18.5 1 17 8z"/>',
    defaultSize: { width: 180, height: 240 },
    fillable: true,
    strokeable: true,
  },
  {
    id: 'tree',
    name: 'Tree',
    category: 'nature',
    viewBox: '0 0 24 24',
    svg: '<path d="M12 2L7 10h3v4H7l5 8 5-8h-3v-4h3L12 2z"/>',
    defaultSize: { width: 180, height: 260 },
    fillable: true,
    strokeable: true,
  },

  // ORNAMENTS
  {
    id: 'flourish-left',
    name: 'Flourish (Left)',
    category: 'ornament',
    viewBox: '0 0 100 40',
    svg: '<path d="M100 20 Q80 5, 60 15 T20 20 Q40 15, 50 18 T80 22 Q65 24, 60 20" fill="none" stroke="currentColor" stroke-width="2"/>',
    defaultSize: { width: 400, height: 160 },
    fillable: false,
    strokeable: true,
  },
  {
    id: 'flourish-corner',
    name: 'Corner Flourish',
    category: 'ornament',
    viewBox: '0 0 50 50',
    svg: '<path d="M5 45 Q10 30, 20 25 T45 5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 45 Q15 40, 25 35 T45 25" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    defaultSize: { width: 200, height: 200 },
    fillable: false,
    strokeable: true,
  },
  {
    id: 'scroll-ornament',
    name: 'Scroll Ornament',
    category: 'ornament',
    viewBox: '0 0 100 50',
    svg: '<path d="M10 25 Q20 10, 35 20 T60 25 Q70 30, 80 15" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="25" r="3"/><circle cx="90" cy="20" r="3"/>',
    defaultSize: { width: 400, height: 200 },
    fillable: false,
    strokeable: true,
  },

  // BADGES
  {
    id: 'badge-circle',
    name: 'Circle Badge',
    category: 'badge',
    viewBox: '0 0 100 100',
    svg: '<circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" stroke-width="2"/>',
    defaultSize: { width: 300, height: 300 },
    fillable: false,
    strokeable: true,
  },
  {
    id: 'badge-star',
    name: 'Star Badge',
    category: 'badge',
    viewBox: '0 0 100 100',
    svg: '<path d="M50 10 L58 40 L90 40 L65 58 L75 90 L50 70 L25 90 L35 58 L10 40 L42 40 Z" fill="none" stroke="currentColor" stroke-width="2.5"/>',
    defaultSize: { width: 300, height: 300 },
    fillable: false,
    strokeable: true,
  },
  {
    id: 'badge-shield',
    name: 'Shield Badge',
    category: 'badge',
    viewBox: '0 0 100 120',
    svg: '<path d="M50 10 L90 25 L90 60 Q90 90, 50 110 Q10 90, 10 60 L10 25 Z" fill="none" stroke="currentColor" stroke-width="2.5"/>',
    defaultSize: { width: 280, height: 340 },
    fillable: false,
    strokeable: true,
  },

  // DIVIDERS
  {
    id: 'divider-simple',
    name: 'Simple Line',
    category: 'divider',
    viewBox: '0 0 200 10',
    svg: '<line x1="0" y1="5" x2="200" y2="5" stroke="currentColor" stroke-width="2"/>',
    defaultSize: { width: 800, height: 40 },
    fillable: false,
    strokeable: true,
  },
  {
    id: 'divider-dots',
    name: 'Dotted Line',
    category: 'divider',
    viewBox: '0 0 200 10',
    svg: '<circle cx="20" cy="5" r="3"/><circle cx="60" cy="5" r="3"/><circle cx="100" cy="5" r="3"/><circle cx="140" cy="5" r="3"/><circle cx="180" cy="5" r="3"/>',
    defaultSize: { width: 800, height: 40 },
    fillable: true,
    strokeable: false,
  },
  {
    id: 'divider-ornate',
    name: 'Ornate Divider',
    category: 'divider',
    viewBox: '0 0 200 20',
    svg: '<path d="M10 10 L50 10 M60 10 Q70 5, 80 10 T100 10 Q110 15, 120 10 L150 10 M160 10 L190 10" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="100" cy="10" r="4"/>',
    defaultSize: { width: 800, height: 80 },
    fillable: false,
    strokeable: true,
  },
]

// Helper function to create SVG element from template
export function createSVGElement(
  element: DecorativeElement,
  position: { x: number; y: number },
  size: { width: number; height: number } = element.defaultSize,
  fillColor: string = '#000000',
  strokeColor: string = '#000000',
  strokeWidth: number = 2
): string {
  const [, , vbWidth, vbHeight] = element.viewBox.split(' ').map(Number)
  const scaleX = size.width / vbWidth
  const scaleY = size.height / vbHeight
  
  // Replace currentColor and apply colors
  let svgContent = element.svg
  if (element.fillable && !svgContent.includes('fill="none"')) {
    svgContent = svgContent.replace(/fill="[^"]*"/g, `fill="${fillColor}"`)
    if (!svgContent.includes('fill=')) {
      svgContent = svgContent.replace(/<path /g, `<path fill="${fillColor}" `)
      svgContent = svgContent.replace(/<circle /g, `<circle fill="${fillColor}" `)
    }
  }
  if (element.strokeable) {
    svgContent = svgContent.replace(/stroke="currentColor"/g, `stroke="${strokeColor}"`)
    svgContent = svgContent.replace(/stroke-width="[^"]*"/g, `stroke-width="${strokeWidth}"`)
  }

  return `<svg x="${position.x}" y="${position.y}" width="${size.width}" height="${size.height}" viewBox="${element.viewBox}">${svgContent}</svg>`
}

// Get elements by category
export function getElementsByCategory(category: DecorativeElement['category']): DecorativeElement[] {
  return DECORATIVE_ELEMENTS.filter(el => el.category === category)
}
