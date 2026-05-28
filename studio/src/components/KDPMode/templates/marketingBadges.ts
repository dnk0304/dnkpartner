// Marketing Badge Templates for KDP Covers
// These are pre-designed promotional badges with professional styling

export interface MarketingBadgeTemplate {
  id: string
  name: string
  preview: string // SVG or description
  category: 'bestseller' | 'award' | 'new' | 'special' | 'rating'
  elements: {
    type: 'shape' | 'text'
    shapeType?: 'rectangle' | 'circle'
    position: { x: number; y: number } // Relative position within badge
    width: number
    height: number
    content?: string
    style: {
      fill?: string
      stroke?: string
      strokeWidth?: number
      fontSize?: number
      fontFamily?: string
      fontWeight?: 'normal' | 'bold'
      color?: string
      textAlign?: 'left' | 'center' | 'right'
      borderRadius?: number
      opacity?: number
      rotation?: number
    }
  }[]
  defaultPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
  defaultSize: { width: number; height: number } // In 300 DPI pixels
  editable: {
    text?: boolean
    color?: boolean
    size?: boolean
  }
}

export const MARKETING_BADGE_TEMPLATES: MarketingBadgeTemplate[] = [
  {
    id: 'bestseller-gold-ribbon',
    name: 'Best Seller Gold Ribbon',
    preview: '🏆',
    category: 'bestseller',
    defaultPosition: 'top-right',
    defaultSize: { width: 400, height: 400 },
    editable: { text: true, color: true, size: true },
    elements: [
      // Gold circle background
      {
        type: 'shape',
        shapeType: 'circle',
        position: { x: 0, y: 0 },
        width: 400,
        height: 400,
        style: {
          fill: '#FFD700',
          stroke: '#B8860B',
          strokeWidth: 8,
          opacity: 0.95,
        }
      },
      // Inner circle for depth
      {
        type: 'shape',
        shapeType: 'circle',
        position: { x: 20, y: 20 },
        width: 360,
        height: 360,
        style: {
          fill: '#FFA500',
          opacity: 0.3,
        }
      },
      // Text: "BEST"
      {
        type: 'text',
        position: { x: 200, y: 140 },
        width: 300,
        height: 60,
        content: 'BEST',
        style: {
          fontSize: 48,
          fontFamily: 'Arial Black, sans-serif',
          fontWeight: 'bold',
          color: '#8B4513',
          textAlign: 'center',
        }
      },
      // Text: "SELLER"
      {
        type: 'text',
        position: { x: 200, y: 200 },
        width: 300,
        height: 60,
        content: 'SELLER',
        style: {
          fontSize: 48,
          fontFamily: 'Arial Black, sans-serif',
          fontWeight: 'bold',
          color: '#8B4513',
          textAlign: 'center',
        }
      },
    ]
  },
  {
    id: 'new-release-badge',
    name: 'New Release',
    preview: '⭐',
    category: 'new',
    defaultPosition: 'top-left',
    defaultSize: { width: 350, height: 120 },
    editable: { text: true, color: true, size: true },
    elements: [
      // Background ribbon
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 0, y: 0 },
        width: 350,
        height: 120,
        style: {
          fill: '#FF4444',
          borderRadius: 15,
          opacity: 0.95,
        }
      },
      // Border
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 5, y: 5 },
        width: 340,
        height: 110,
        style: {
          fill: 'transparent',
          stroke: '#FFFFFF',
          strokeWidth: 4,
          borderRadius: 12,
        }
      },
      // Text
      {
        type: 'text',
        position: { x: 175, y: 60 },
        width: 320,
        height: 80,
        content: 'NEW RELEASE',
        style: {
          fontSize: 42,
          fontFamily: 'Impact, sans-serif',
          fontWeight: 'bold',
          color: '#FFFFFF',
          textAlign: 'center',
        }
      },
    ]
  },
  {
    id: 'award-winner-medal',
    name: 'Award Winner',
    preview: '🥇',
    category: 'award',
    defaultPosition: 'top-left',
    defaultSize: { width: 380, height: 380 },
    editable: { text: true, color: true, size: true },
    elements: [
      // Medal circle
      {
        type: 'shape',
        shapeType: 'circle',
        position: { x: 0, y: 0 },
        width: 380,
        height: 380,
        style: {
          fill: '#C0C0C0',
          stroke: '#808080',
          strokeWidth: 6,
          opacity: 0.95,
        }
      },
      // Inner circle
      {
        type: 'shape',
        shapeType: 'circle',
        position: { x: 30, y: 30 },
        width: 320,
        height: 320,
        style: {
          fill: '#E8E8E8',
          opacity: 0.8,
        }
      },
      // Text: "AWARD"
      {
        type: 'text',
        position: { x: 190, y: 130 },
        width: 300,
        height: 50,
        content: 'AWARD',
        style: {
          fontSize: 44,
          fontFamily: 'Georgia, serif',
          fontWeight: 'bold',
          color: '#4B0082',
          textAlign: 'center',
        }
      },
      // Text: "WINNER"
      {
        type: 'text',
        position: { x: 190, y: 195 },
        width: 300,
        height: 50,
        content: 'WINNER',
        style: {
          fontSize: 44,
          fontFamily: 'Georgia, serif',
          fontWeight: 'bold',
          color: '#4B0082',
          textAlign: 'center',
        }
      },
    ]
  },
  {
    id: 'limited-edition',
    name: 'Limited Edition',
    preview: '💎',
    category: 'special',
    defaultPosition: 'bottom-right',
    defaultSize: { width: 380, height: 140 },
    editable: { text: true, color: true, size: true },
    elements: [
      // Background
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 0, y: 0 },
        width: 380,
        height: 140,
        style: {
          fill: '#2C3E50',
          borderRadius: 20,
          opacity: 0.92,
        }
      },
      // Gold accent line top
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 15, y: 15 },
        width: 350,
        height: 4,
        style: {
          fill: '#FFD700',
          borderRadius: 2,
        }
      },
      // Gold accent line bottom
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 15, y: 121 },
        width: 350,
        height: 4,
        style: {
          fill: '#FFD700',
          borderRadius: 2,
        }
      },
      // Text: "LIMITED"
      {
        type: 'text',
        position: { x: 190, y: 45 },
        width: 350,
        height: 40,
        content: 'LIMITED',
        style: {
          fontSize: 36,
          fontFamily: 'Courier New, monospace',
          fontWeight: 'bold',
          color: '#FFD700',
          textAlign: 'center',
        }
      },
      // Text: "EDITION"
      {
        type: 'text',
        position: { x: 190, y: 82 },
        width: 350,
        height: 40,
        content: 'EDITION',
        style: {
          fontSize: 36,
          fontFamily: 'Courier New, monospace',
          fontWeight: 'bold',
          color: '#FFD700',
          textAlign: 'center',
        }
      },
    ]
  },
  {
    id: 'five-star-rating',
    name: '5 Stars Rating',
    preview: '⭐⭐⭐⭐⭐',
    category: 'rating',
    defaultPosition: 'top-right',
    defaultSize: { width: 420, height: 120 },
    editable: { text: true, color: true, size: true },
    elements: [
      // Background
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 0, y: 0 },
        width: 420,
        height: 120,
        style: {
          fill: '#1E3A5F',
          borderRadius: 12,
          opacity: 0.93,
        }
      },
      // Text
      {
        type: 'text',
        position: { x: 210, y: 60 },
        width: 400,
        height: 80,
        content: '★★★★★ 5 STARS',
        style: {
          fontSize: 38,
          fontFamily: 'Arial, sans-serif',
          fontWeight: 'bold',
          color: '#FFD700',
          textAlign: 'center',
        }
      },
    ]
  },
  {
    id: 'number-one-bestseller',
    name: '#1 Bestseller',
    preview: '🥇',
    category: 'bestseller',
    defaultPosition: 'top-left',
    defaultSize: { width: 360, height: 360 },
    editable: { text: true, color: true, size: true },
    elements: [
      // Red circle background
      {
        type: 'shape',
        shapeType: 'circle',
        position: { x: 0, y: 0 },
        width: 360,
        height: 360,
        style: {
          fill: '#DC143C',
          stroke: '#8B0000',
          strokeWidth: 8,
          opacity: 0.95,
        }
      },
      // White inner circle
      {
        type: 'shape',
        shapeType: 'circle',
        position: { x: 40, y: 40 },
        width: 280,
        height: 280,
        style: {
          fill: '#FFFFFF',
          opacity: 0.2,
        }
      },
      // Text: "#1"
      {
        type: 'text',
        position: { x: 180, y: 100 },
        width: 280,
        height: 80,
        content: '#1',
        style: {
          fontSize: 72,
          fontFamily: 'Impact, sans-serif',
          fontWeight: 'bold',
          color: '#FFFFFF',
          textAlign: 'center',
        }
      },
      // Text: "BESTSELLER"
      {
        type: 'text',
        position: { x: 180, y: 200 },
        width: 320,
        height: 60,
        content: 'BESTSELLER',
        style: {
          fontSize: 32,
          fontFamily: 'Arial Black, sans-serif',
          fontWeight: 'bold',
          color: '#FFFFFF',
          textAlign: 'center',
        }
      },
    ]
  },
  {
    id: 'readers-choice',
    name: "Readers' Choice",
    preview: '📚',
    category: 'award',
    defaultPosition: 'bottom-left',
    defaultSize: { width: 380, height: 160 },
    editable: { text: true, color: true, size: true },
    elements: [
      // Background
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 0, y: 0 },
        width: 380,
        height: 160,
        style: {
          fill: '#4A90E2',
          borderRadius: 18,
          opacity: 0.94,
        }
      },
      // Decorative border
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 8, y: 8 },
        width: 364,
        height: 144,
        style: {
          fill: 'transparent',
          stroke: '#FFFFFF',
          strokeWidth: 3,
          borderRadius: 14,
        }
      },
      // Text: "READERS'"
      {
        type: 'text',
        position: { x: 190, y: 55 },
        width: 350,
        height: 45,
        content: "READERS'",
        style: {
          fontSize: 38,
          fontFamily: 'Times New Roman, serif',
          fontWeight: 'bold',
          color: '#FFFFFF',
          textAlign: 'center',
        }
      },
      // Text: "CHOICE"
      {
        type: 'text',
        position: { x: 190, y: 100 },
        width: 350,
        height: 45,
        content: 'CHOICE',
        style: {
          fontSize: 38,
          fontFamily: 'Times New Roman, serif',
          fontWeight: 'bold',
          color: '#FFFFFF',
          textAlign: 'center',
        }
      },
    ]
  },
  {
    id: 'amazon-bestseller',
    name: 'Amazon #1 Bestseller',
    preview: '🛒',
    category: 'bestseller',
    defaultPosition: 'top-right',
    defaultSize: { width: 400, height: 180 },
    editable: { text: true, color: true, size: true },
    elements: [
      // Orange gradient background
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 0, y: 0 },
        width: 400,
        height: 180,
        style: {
          fill: '#FF9900',
          borderRadius: 16,
          opacity: 0.96,
        }
      },
      // Black accent bar
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 0, y: 70 },
        width: 400,
        height: 40,
        style: {
          fill: '#232F3E',
          opacity: 0.9,
        }
      },
      // Text: "AMAZON"
      {
        type: 'text',
        position: { x: 200, y: 35 },
        width: 380,
        height: 50,
        content: 'AMAZON',
        style: {
          fontSize: 36,
          fontFamily: 'Arial Black, sans-serif',
          fontWeight: 'bold',
          color: '#232F3E',
          textAlign: 'center',
        }
      },
      // Text: "#1 BESTSELLER"
      {
        type: 'text',
        position: { x: 200, y: 90 },
        width: 380,
        height: 40,
        content: '#1 BESTSELLER',
        style: {
          fontSize: 28,
          fontFamily: 'Arial Black, sans-serif',
          fontWeight: 'bold',
          color: '#FFFFFF',
          textAlign: 'center',
        }
      },
      // Text: "IN CATEGORY"
      {
        type: 'text',
        position: { x: 200, y: 140 },
        width: 380,
        height: 35,
        content: 'IN CATEGORY',
        style: {
          fontSize: 20,
          fontFamily: 'Arial, sans-serif',
          fontWeight: 'bold',
          color: '#232F3E',
          textAlign: 'center',
        }
      },
    ]
  },
  {
    id: 'national-bestseller-starburst',
    name: 'National Bestseller',
    preview: '⭐',
    category: 'bestseller',
    defaultPosition: 'top-left',
    defaultSize: { width: 420, height: 420 },
    editable: { text: true, color: true, size: true },
    elements: [
      // Large outer circle
      {
        type: 'shape',
        shapeType: 'circle',
        position: { x: 0, y: 0 },
        width: 420,
        height: 420,
        style: {
          fill: '#E63946',
          stroke: '#9D0208',
          strokeWidth: 10,
          opacity: 0.95,
        }
      },
      // Inner yellow circle
      {
        type: 'shape',
        shapeType: 'circle',
        position: { x: 50, y: 50 },
        width: 320,
        height: 320,
        style: {
          fill: '#FFD60A',
          opacity: 0.4,
        }
      },
      // White center circle
      {
        type: 'shape',
        shapeType: 'circle',
        position: { x: 100, y: 100 },
        width: 220,
        height: 220,
        style: {
          fill: '#FFFFFF',
          opacity: 0.2,
        }
      },
      // Text: "NATIONAL"
      {
        type: 'text',
        position: { x: 210, y: 130 },
        width: 380,
        height: 50,
        content: 'NATIONAL',
        style: {
          fontSize: 42,
          fontFamily: 'Impact, sans-serif',
          fontWeight: 'bold',
          color: '#FFFFFF',
          textAlign: 'center',
        }
      },
      // Text: "BESTSELLER"
      {
        type: 'text',
        position: { x: 210, y: 220 },
        width: 380,
        height: 50,
        content: 'BESTSELLER',
        style: {
          fontSize: 38,
          fontFamily: 'Impact, sans-serif',
          fontWeight: 'bold',
          color: '#FFFFFF',
          textAlign: 'center',
        }
      },
    ]
  },
  {
    id: 'usa-today-bestseller',
    name: 'USA Today Bestseller',
    preview: '📰',
    category: 'bestseller',
    defaultPosition: 'top-right',
    defaultSize: { width: 400, height: 150 },
    editable: { text: true, color: true, size: true },
    elements: [
      // Navy blue background
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 0, y: 0 },
        width: 400,
        height: 150,
        style: {
          fill: '#003087',
          borderRadius: 10,
          opacity: 0.95,
        }
      },
      // Red accent stripe
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 0, y: 55 },
        width: 400,
        height: 40,
        style: {
          fill: '#E31837',
          opacity: 0.85,
        }
      },
      // Text: "USA TODAY"
      {
        type: 'text',
        position: { x: 200, y: 35 },
        width: 380,
        height: 40,
        content: 'USA TODAY',
        style: {
          fontSize: 32,
          fontFamily: 'Arial Black, sans-serif',
          fontWeight: 'bold',
          color: '#FFFFFF',
          textAlign: 'center',
        }
      },
      // Text: "BESTSELLER"
      {
        type: 'text',
        position: { x: 200, y: 75 },
        width: 380,
        height: 40,
        content: 'BESTSELLER',
        style: {
          fontSize: 30,
          fontFamily: 'Arial Black, sans-serif',
          fontWeight: 'bold',
          color: '#FFFFFF',
          textAlign: 'center',
        }
      },
    ]
  },
  {
    id: 'instant-bestseller',
    name: 'Instant Bestseller',
    preview: '⚡',
    category: 'bestseller',
    defaultPosition: 'top-left',
    defaultSize: { width: 380, height: 150 },
    editable: { text: true, color: true, size: true },
    elements: [
      // Electric yellow background
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 0, y: 0 },
        width: 380,
        height: 150,
        style: {
          fill: '#FFEB3B',
          borderRadius: 18,
          opacity: 0.95,
        }
      },
      // Black diagonal stripe
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 0, y: 60 },
        width: 380,
        height: 30,
        style: {
          fill: '#000000',
          opacity: 0.85,
        }
      },
      // Double border
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 6, y: 6 },
        width: 368,
        height: 138,
        style: {
          fill: 'transparent',
          stroke: '#000000',
          strokeWidth: 5,
          borderRadius: 14,
        }
      },
      // Text: "INSTANT"
      {
        type: 'text',
        position: { x: 190, y: 38 },
        width: 360,
        height: 45,
        content: 'INSTANT',
        style: {
          fontSize: 36,
          fontFamily: 'Impact, sans-serif',
          fontWeight: 'bold',
          color: '#000000',
          textAlign: 'center',
        }
      },
      // Text: "BESTSELLER"
      {
        type: 'text',
        position: { x: 190, y: 110 },
        width: 360,
        height: 45,
        content: 'BESTSELLER',
        style: {
          fontSize: 34,
          fontFamily: 'Impact, sans-serif',
          fontWeight: 'bold',
          color: '#000000',
          textAlign: 'center',
        }
      },
    ]
  },
  {
    id: 'million-copies-sold',
    name: 'Million Copies Sold',
    preview: '💰',
    category: 'special',
    defaultPosition: 'bottom-right',
    defaultSize: { width: 400, height: 180 },
    editable: { text: true, color: true, size: true },
    elements: [
      // Gold background
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 0, y: 0 },
        width: 400,
        height: 180,
        style: {
          fill: '#FFD700',
          borderRadius: 16,
          opacity: 0.96,
        }
      },
      // Dark inner rectangle
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 10, y: 10 },
        width: 380,
        height: 160,
        style: {
          fill: '#1A1A1A',
          borderRadius: 12,
          opacity: 0.85,
        }
      },
      // Gold accent line
      {
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 20, y: 85 },
        width: 360,
        height: 3,
        style: {
          fill: '#FFD700',
        }
      },
      // Text: "OVER"
      {
        type: 'text',
        position: { x: 200, y: 40 },
        width: 380,
        height: 35,
        content: 'OVER',
        style: {
          fontSize: 24,
          fontFamily: 'Arial, sans-serif',
          fontWeight: 'bold',
          color: '#FFD700',
          textAlign: 'center',
        }
      },
      // Text: "1 MILLION"
      {
        type: 'text',
        position: { x: 200, y: 75 },
        width: 380,
        height: 45,
        content: '1 MILLION',
        style: {
          fontSize: 38,
          fontFamily: 'Impact, sans-serif',
          fontWeight: 'bold',
          color: '#FFD700',
          textAlign: 'center',
        }
      },
      // Text: "COPIES SOLD"
      {
        type: 'text',
        position: { x: 200, y: 130 },
        width: 380,
        height: 40,
        content: 'COPIES SOLD',
        style: {
          fontSize: 28,
          fontFamily: 'Arial Black, sans-serif',
          fontWeight: 'bold',
          color: '#FFD700',
          textAlign: 'center',
        }
      },
    ]
  },
]

// Helper function to convert badge template to KDP elements
export function createBadgeElements(
  template: MarketingBadgeTemplate,
  position: { x: number; y: number },
  size: { width: number; height: number } = template.defaultSize,
  customText?: Record<string, string>
) {
  const scaleX = size.width / template.defaultSize.width
  const scaleY = size.height / template.defaultSize.height

  return template.elements.map((element, index) => {
    if (element.type === 'shape') {
      // For shapes, scale position relative to badge origin
      const scaledX = position.x + (element.position.x * scaleX)
      const scaledY = position.y + (element.position.y * scaleY)
      const scaledWidth = element.width * scaleX
      const scaledHeight = element.height * scaleY

      return {
        id: `${template.id}-shape-${index}`,
        type: 'shape' as const,
        shapeType: element.shapeType!,
        position: { x: scaledX, y: scaledY },
        width: scaledWidth,
        height: scaledHeight,
        rotation: element.style.rotation || 0,
        locked: false,
        visible: true,
        style: {
          fill: element.style.fill || '#000000',
          stroke: element.style.stroke || 'transparent',
          strokeWidth: (element.style.strokeWidth || 0) * scaleX,
          opacity: element.style.opacity || 1,
          borderRadius: element.style.borderRadius ? element.style.borderRadius * scaleX : 0,
        },
        coverPart: undefined,
      }
    } else {
      // Text element - need to handle center-aligned text positioning
      const content = customText && element.content && customText[element.content]
        ? customText[element.content]
        : element.content || ''

      // For center-aligned text, the position.x in template is the center point
      // We need to convert this to the actual position for rendering
      let scaledX = position.x + (element.position.x * scaleX)
      const scaledY = position.y + (element.position.y * scaleY)
      const scaledWidth = element.width * scaleX
      const scaledHeight = element.height * scaleY

      // Adjust X position based on text alignment
      if (element.style.textAlign === 'center') {
        // Position is already at center, adjust to left edge for the text box
        scaledX = scaledX - scaledWidth / 2
      } else if (element.style.textAlign === 'right') {
        scaledX = scaledX - scaledWidth
      }

      return {
        id: `${template.id}-text-${index}`,
        type: 'text' as const,
        content,
        position: { x: scaledX, y: scaledY },
        width: scaledWidth,
        height: scaledHeight,
        locked: false,
        visible: true,
        coverPart: undefined,
        style: {
          fontFamily: element.style.fontFamily || 'Arial',
          fontSize: (element.style.fontSize || 24) * Math.min(scaleX, scaleY),
          fontWeight: element.style.fontWeight || 'normal',
          fontStyle: 'normal' as const,
          color: element.style.color || '#000000',
          textAlign: element.style.textAlign || 'center',
          lineHeight: 1.2,
          letterSpacing: 0,
          textDecoration: 'none' as const,
          opacity: element.style.opacity || 1,
        },
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
      }
    }
  })
}
