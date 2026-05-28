// ============================================================
// 3D Liquid Paint Splash Background Effect
// 30 Mini Paint Streams + 75 Mini Ball Particles
// Realistic splash physics with 3D shading
// ============================================================

import { useEffect, useRef, useCallback } from 'react'

// Vibrant paint colors
const PAINT_COLORS = [
  { base: [255, 45, 85], highlight: [255, 150, 170], shadow: [160, 20, 50] },     // Red
  { base: [255, 130, 0], highlight: [255, 200, 100], shadow: [180, 80, 0] },      // Orange
  { base: [255, 210, 0], highlight: [255, 245, 120], shadow: [200, 160, 0] },     // Yellow
  { base: [50, 205, 90], highlight: [140, 255, 170], shadow: [20, 140, 50] },     // Green
  { base: [0, 140, 255], highlight: [100, 200, 255], shadow: [0, 80, 180] },      // Blue
  { base: [100, 80, 220], highlight: [160, 150, 255], shadow: [60, 40, 150] },    // Indigo
  { base: [180, 70, 230], highlight: [230, 160, 255], shadow: [120, 30, 160] },   // Purple
  { base: [255, 60, 130], highlight: [255, 140, 180], shadow: [180, 30, 90] },    // Magenta
  { base: [0, 210, 200], highlight: [100, 255, 245], shadow: [0, 150, 140] },     // Cyan
]

// Mini paint stream
interface PaintStream {
  x: number
  y: number
  vx: number
  vy: number
  color: typeof PAINT_COLORS[0]
  thickness: number
  points: { x: number; y: number; thickness: number; age: number }[]
  wobble: number
  wobbleSpeed: number
}

// Mini ball particle
interface BallParticle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: typeof PAINT_COLORS[0]
  trail: { x: number; y: number; size: number; alpha: number }[]
}

// Splash droplet
interface SplashDroplet {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  size: number
  color: typeof PAINT_COLORS[0]
  alpha: number
  type: 'glob' | 'droplet' | 'splatter' | 'streak'
  rotation: number
  stretch: number
  wobbleOffset: number
}

export function PowderSplash() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | undefined>(undefined)
  const streamsRef = useRef<PaintStream[]>([])
  const ballsRef = useRef<BallParticle[]>([])
  const dropletsRef = useRef<SplashDroplet[]>([])
  const dprRef = useRef<number>(1)

  // Create 30 mini paint streams
  const createStreams = useCallback((canvas: HTMLCanvasElement) => {
    const streams: PaintStream[] = []
    const dpr = dprRef.current
    
    for (let i = 0; i < 30; i++) {
      const color = PAINT_COLORS[i % PAINT_COLORS.length]
      const angle = Math.random() * Math.PI * 2
      const speed = (Math.random() * 2.5 + 1.5) * dpr
      
      streams.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        thickness: (3 + Math.random() * 6) * dpr,
        points: [],
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.03 + Math.random() * 0.04,
      })
    }
    
    return streams
  }, [])

  // Create 75 mini ball particles
  const createBalls = useCallback((canvas: HTMLCanvasElement) => {
    const balls: BallParticle[] = []
    const dpr = dprRef.current
    
    for (let i = 0; i < 75; i++) {
      const color = PAINT_COLORS[Math.floor(Math.random() * PAINT_COLORS.length)]
      const angle = Math.random() * Math.PI * 2
      const speed = (Math.random() * 3 + 2) * dpr
      
      balls.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: (2 + Math.random() * 4) * dpr,
        color,
        trail: [],
      })
    }
    
    return balls
  }, [])

  // Create realistic splash
  const createSplash = useCallback((x: number, y: number, color: typeof PAINT_COLORS[0], vx: number, vy: number, intensity: number = 1) => {
    const dpr = dprRef.current
    const droplets: SplashDroplet[] = []
    const baseAngle = Math.atan2(-vy, -vx)
    const speed = Math.sqrt(vx * vx + vy * vy)
    
    // Large organic splatters
    for (let i = 0; i < Math.floor(3 * intensity); i++) {
      const angle = baseAngle + (Math.random() - 0.5) * Math.PI * 1.4
      const spd = (speed * 0.7 + Math.random() * 5) * dpr
      
      droplets.push({
        x, y,
        z: Math.random() * 40,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        size: (12 + Math.random() * 18) * dpr * intensity,
        color,
        alpha: 1,
        type: 'splatter',
        rotation: angle,
        stretch: 1.3 + Math.random() * 0.8,
        wobbleOffset: Math.random() * Math.PI * 2,
      })
    }
    
    // Medium globs
    for (let i = 0; i < Math.floor(5 * intensity); i++) {
      const angle = baseAngle + (Math.random() - 0.5) * Math.PI * 1.5
      const spd = (speed * 0.8 + Math.random() * 6) * dpr
      
      droplets.push({
        x, y,
        z: Math.random() * 30,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        size: (6 + Math.random() * 10) * dpr * intensity,
        color,
        alpha: 1,
        type: 'glob',
        rotation: Math.random() * Math.PI * 2,
        stretch: 1 + Math.random() * 0.3,
        wobbleOffset: 0,
      })
    }
    
    // Elongated streaks
    for (let i = 0; i < Math.floor(4 * intensity); i++) {
      const angle = baseAngle + (Math.random() - 0.5) * Math.PI * 1.2
      const spd = (speed * 1.2 + Math.random() * 8) * dpr
      
      droplets.push({
        x, y,
        z: Math.random() * 20,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        size: (2 + Math.random() * 4) * dpr,
        color,
        alpha: 1,
        type: 'streak',
        rotation: angle,
        stretch: 4 + Math.random() * 6,
        wobbleOffset: 0,
      })
    }
    
    // Small scattered droplets
    for (let i = 0; i < Math.floor(15 * intensity); i++) {
      const angle = baseAngle + (Math.random() - 0.5) * Math.PI * 2
      const spd = (Math.random() * 8 + 2) * dpr
      
      droplets.push({
        x, y,
        z: Math.random() * 35,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        size: (1.5 + Math.random() * 3) * dpr,
        color,
        alpha: 1,
        type: 'droplet',
        rotation: 0,
        stretch: 1,
        wobbleOffset: 0,
      })
    }
    
    dropletsRef.current.push(...droplets)
  }, [])

  // Draw 3D ball with glossy highlight
  const drawGlossyBall = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: typeof PAINT_COLORS[0], alpha: number = 1) => {
    ctx.save()
    ctx.globalAlpha = alpha
    
    // Main body gradient
    const bodyGrad = ctx.createRadialGradient(
      x - size * 0.3, y - size * 0.3, 0,
      x, y, size
    )
    bodyGrad.addColorStop(0, `rgb(${color.highlight[0]}, ${color.highlight[1]}, ${color.highlight[2]})`)
    bodyGrad.addColorStop(0.4, `rgb(${color.base[0]}, ${color.base[1]}, ${color.base[2]})`)
    bodyGrad.addColorStop(0.8, `rgb(${color.base[0]}, ${color.base[1]}, ${color.base[2]})`)
    bodyGrad.addColorStop(1, `rgb(${color.shadow[0]}, ${color.shadow[1]}, ${color.shadow[2]})`)
    
    ctx.fillStyle = bodyGrad
    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.fill()
    
    // Glossy highlight
    const highlightGrad = ctx.createRadialGradient(
      x - size * 0.35, y - size * 0.35, 0,
      x - size * 0.35, y - size * 0.35, size * 0.5
    )
    highlightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)')
    highlightGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.4)')
    highlightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)')
    
    ctx.fillStyle = highlightGrad
    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.fill()
    
    ctx.restore()
  }, [])

  // Draw organic splatter with curved edges
  const drawSplatter = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: typeof PAINT_COLORS[0], alpha: number, rotation: number, stretch: number, wobbleOffset: number) => {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(x, y)
    ctx.rotate(rotation)
    
    // Gradient fill
    const gradient = ctx.createRadialGradient(
      -size * 0.2, -size * 0.2, 0,
      0, 0, size * stretch
    )
    gradient.addColorStop(0, `rgb(${color.highlight[0]}, ${color.highlight[1]}, ${color.highlight[2]})`)
    gradient.addColorStop(0.35, `rgb(${color.base[0]}, ${color.base[1]}, ${color.base[2]})`)
    gradient.addColorStop(1, `rgb(${color.shadow[0]}, ${color.shadow[1]}, ${color.shadow[2]})`)
    
    ctx.fillStyle = gradient
    ctx.beginPath()
    
    // Organic curved shape
    const points = 12
    const controlPoints: { x: number; y: number }[] = []
    
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2
      const wobble = 0.5 + Math.sin(angle * 3 + wobbleOffset) * 0.3 + Math.cos(angle * 5 + wobbleOffset * 1.5) * 0.2
      const stretchFactor = angle < Math.PI ? stretch : 1
      const r = size * wobble * stretchFactor
      controlPoints.push({
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
      })
    }
    
    ctx.moveTo(controlPoints[0].x, controlPoints[0].y)
    for (let i = 0; i < points; i++) {
      const curr = controlPoints[i]
      const next = controlPoints[(i + 1) % points]
      const cpX = (curr.x + next.x) / 2 + (Math.random() - 0.5) * size * 0.1
      const cpY = (curr.y + next.y) / 2 + (Math.random() - 0.5) * size * 0.1
      ctx.quadraticCurveTo(curr.x * 1.1, curr.y * 1.1, cpX, cpY)
    }
    ctx.closePath()
    ctx.fill()
    
    // Glossy highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.beginPath()
    ctx.ellipse(-size * 0.25, -size * 0.25, size * 0.25, size * 0.15, -0.5, 0, Math.PI * 2)
    ctx.fill()
    
    ctx.restore()
  }, [])

  // Draw elongated streak
  const drawStreak = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: typeof PAINT_COLORS[0], alpha: number, rotation: number, stretch: number) => {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(x, y)
    ctx.rotate(rotation)
    
    const length = size * stretch
    
    // Gradient along streak
    const gradient = ctx.createLinearGradient(0, 0, length, 0)
    gradient.addColorStop(0, `rgb(${color.highlight[0]}, ${color.highlight[1]}, ${color.highlight[2]})`)
    gradient.addColorStop(0.2, `rgb(${color.base[0]}, ${color.base[1]}, ${color.base[2]})`)
    gradient.addColorStop(0.8, `rgba(${color.base[0]}, ${color.base[1]}, ${color.base[2]}, 0.8)`)
    gradient.addColorStop(1, `rgba(${color.shadow[0]}, ${color.shadow[1]}, ${color.shadow[2]}, 0)`)
    
    ctx.fillStyle = gradient
    ctx.beginPath()
    
    // Tapered streak shape
    ctx.moveTo(0, -size)
    ctx.quadraticCurveTo(length * 0.3, -size * 0.8, length * 0.6, -size * 0.3)
    ctx.quadraticCurveTo(length * 0.85, -size * 0.1, length, 0)
    ctx.quadraticCurveTo(length * 0.85, size * 0.1, length * 0.6, size * 0.3)
    ctx.quadraticCurveTo(length * 0.3, size * 0.8, 0, size)
    ctx.closePath()
    ctx.fill()
    
    // Small highlight at head
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.beginPath()
    ctx.ellipse(size * 0.3, -size * 0.3, size * 0.4, size * 0.2, -0.3, 0, Math.PI * 2)
    ctx.fill()
    
    ctx.restore()
  }, [])

  // Animation loop
  const animate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const dpr = dprRef.current

    // Fade background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.012)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Update and draw 75 ball particles
    ballsRef.current.forEach(ball => {
      // Store trail
      ball.trail.push({ x: ball.x, y: ball.y, size: ball.size * 0.7, alpha: 0.5 })
      if (ball.trail.length > 12) ball.trail.shift()
      
      // Move
      ball.x += ball.vx
      ball.y += ball.vy
      
      // Bounce with splash
      const margin = ball.size
      let bounced = false
      
      if (ball.x <= margin) {
        ball.x = margin
        ball.vx = Math.abs(ball.vx)
        bounced = true
      } else if (ball.x >= canvas.width - margin) {
        ball.x = canvas.width - margin
        ball.vx = -Math.abs(ball.vx)
        bounced = true
      }
      
      if (ball.y <= margin) {
        ball.y = margin
        ball.vy = Math.abs(ball.vy)
        bounced = true
      } else if (ball.y >= canvas.height - margin) {
        ball.y = canvas.height - margin
        ball.vy = -Math.abs(ball.vy)
        bounced = true
      }
      
      if (bounced) {
        createSplash(ball.x, ball.y, ball.color, ball.vx, ball.vy, 0.6)
        ball.vx += (Math.random() - 0.5) * 1.5 * dpr
        ball.vy += (Math.random() - 0.5) * 1.5 * dpr
      }
      
      // Maintain speed
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy)
      const targetSpeed = 2.5 * dpr
      if (speed < targetSpeed * 0.7) {
        const factor = targetSpeed / speed
        ball.vx *= factor
        ball.vy *= factor
      } else if (speed > targetSpeed * 1.4) {
        const factor = targetSpeed / speed
        ball.vx *= factor
        ball.vy *= factor
      }
      
      // Random nudge
      if (Math.random() < 0.02) {
        ball.vx += (Math.random() - 0.5) * 0.5 * dpr
        ball.vy += (Math.random() - 0.5) * 0.5 * dpr
      }
      
      // Draw trail
      ball.trail.forEach((t, i) => {
        const alpha = (i / ball.trail.length) * 0.3
        ctx.globalAlpha = alpha
        ctx.fillStyle = `rgb(${ball.color.base[0]}, ${ball.color.base[1]}, ${ball.color.base[2]})`
        ctx.beginPath()
        ctx.arc(t.x, t.y, t.size, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.globalAlpha = 1
      
      // Draw glossy ball
      drawGlossyBall(ctx, ball.x, ball.y, ball.size, ball.color)
    })

    // Update and draw 30 paint streams
    streamsRef.current.forEach(stream => {
      stream.wobble += stream.wobbleSpeed
      
      // Organic wobble movement
      const wobbleX = Math.sin(stream.wobble) * 1.5 * dpr
      const wobbleY = Math.cos(stream.wobble * 1.4) * 1.5 * dpr
      
      stream.x += stream.vx + wobbleX
      stream.y += stream.vy + wobbleY
      
      // Store point
      const thicknessVar = stream.thickness * (0.7 + Math.sin(stream.wobble * 2.5) * 0.3)
      stream.points.push({
        x: stream.x,
        y: stream.y,
        thickness: thicknessVar,
        age: 0,
      })
      
      if (stream.points.length > 60) stream.points.shift()
      stream.points.forEach(p => p.age += 0.025)

      // Bounce with splash
      const margin = stream.thickness
      let bounced = false
      
      if (stream.x <= margin) {
        stream.x = margin
        stream.vx = Math.abs(stream.vx)
        bounced = true
      } else if (stream.x >= canvas.width - margin) {
        stream.x = canvas.width - margin
        stream.vx = -Math.abs(stream.vx)
        bounced = true
      }
      
      if (stream.y <= margin) {
        stream.y = margin
        stream.vy = Math.abs(stream.vy)
        bounced = true
      } else if (stream.y >= canvas.height - margin) {
        stream.y = canvas.height - margin
        stream.vy = -Math.abs(stream.vy)
        bounced = true
      }
      
      if (bounced) {
        createSplash(stream.x, stream.y, stream.color, stream.vx, stream.vy, 1.2)
        stream.vx += (Math.random() - 0.5) * 2 * dpr
        stream.vy += (Math.random() - 0.5) * 2 * dpr
      }

      // Maintain speed
      const speed = Math.sqrt(stream.vx * stream.vx + stream.vy * stream.vy)
      const targetSpeed = 2 * dpr
      if (speed < targetSpeed * 0.6) {
        stream.vx *= 1.08
        stream.vy *= 1.08
      } else if (speed > targetSpeed * 1.6) {
        stream.vx *= 0.92
        stream.vy *= 0.92
      }

      // Draw stream with 3D shading
      if (stream.points.length > 2) {
        for (let i = 1; i < stream.points.length; i++) {
          const p = stream.points[i]
          const prev = stream.points[i - 1]
          const alpha = Math.max(0, 1 - p.age)
          
          if (alpha > 0.02) {
            // 3D gradient along segment
            const gradient = ctx.createLinearGradient(
              prev.x, prev.y - p.thickness / 2,
              prev.x, prev.y + p.thickness / 2
            )
            gradient.addColorStop(0, `rgba(${stream.color.highlight[0]}, ${stream.color.highlight[1]}, ${stream.color.highlight[2]}, ${alpha})`)
            gradient.addColorStop(0.3, `rgba(${stream.color.base[0]}, ${stream.color.base[1]}, ${stream.color.base[2]}, ${alpha})`)
            gradient.addColorStop(0.7, `rgba(${stream.color.base[0]}, ${stream.color.base[1]}, ${stream.color.base[2]}, ${alpha})`)
            gradient.addColorStop(1, `rgba(${stream.color.shadow[0]}, ${stream.color.shadow[1]}, ${stream.color.shadow[2]}, ${alpha * 0.9})`)
            
            ctx.strokeStyle = gradient
            ctx.lineWidth = p.thickness * (1 - p.age * 0.4)
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.beginPath()
            ctx.moveTo(prev.x, prev.y)
            ctx.lineTo(p.x, p.y)
            ctx.stroke()
          }
        }
        
        // Stream head
        const head = stream.points[stream.points.length - 1]
        drawGlossyBall(ctx, head.x, head.y, stream.thickness * 0.6, stream.color)
      }
    })

    // Update and draw splash droplets (sorted by depth)
    dropletsRef.current.sort((a, b) => a.z - b.z)
    
    dropletsRef.current = dropletsRef.current.filter(d => {
      d.x += d.vx
      d.y += d.vy
      d.vx *= 0.95
      d.vy *= 0.95
      d.alpha -= 0.007
      d.rotation += 0.015
      
      if (d.alpha <= 0.01) return false
      
      const sizeMult = 0.4 + d.alpha * 0.6
      
      if (d.type === 'splatter') {
        drawSplatter(ctx, d.x, d.y, d.size * sizeMult, d.color, d.alpha, d.rotation, d.stretch, d.wobbleOffset)
      } else if (d.type === 'glob') {
        drawGlossyBall(ctx, d.x, d.y, d.size * sizeMult, d.color, d.alpha)
      } else if (d.type === 'streak') {
        drawStreak(ctx, d.x, d.y, d.size * sizeMult, d.color, d.alpha, d.rotation, d.stretch)
      } else {
        drawGlossyBall(ctx, d.x, d.y, d.size * sizeMult, d.color, d.alpha)
      }
      
      return true
    })

    animationRef.current = requestAnimationFrame(animate)
  }, [createSplash, drawGlossyBall, drawSplatter, drawStreak])

  // Initialize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      dprRef.current = dpr
      
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      
      const ctx = canvas.getContext('2d', { alpha: false })
      if (ctx) {
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      
      streamsRef.current = createStreams(canvas)
      ballsRef.current = createBalls(canvas)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    animationRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [animate, createStreams, createBalls])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 pointer-events-none"
      style={{ background: '#000000' }}
    />
  )
}
