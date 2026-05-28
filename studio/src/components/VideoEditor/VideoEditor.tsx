import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useReducer,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  Play,
  Pause,
  Square,
  Plus,
  Trash2,
  Download,
  Music,
  Type,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Film,
  Upload,
  X,
  Scissors,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════
   TYPE DEFINITIONS
   ═══════════════════════════════════════════════════════════════ */

interface TextOverlay {
  id: string
  text: string
  fontSize: number
  color: string
  position: 'top' | 'center' | 'bottom'
  // Extended positioning: x/y in percent (0–100). Defaults map to position.
  x?: number
  y?: number
  startTime: number
  duration: number
}

interface VideoClip {
  id: string
  name: string
  path: string
  duration: number
  thumbnailUrl: string
  trimStart: number
  trimEnd: number
  transition: 'cut' | 'crossfade' | 'wipe-left' | 'wipe-right' | 'slide'
  transitionDuration: number    // seconds, default 0.5
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  textOverlays: TextOverlay[]
}

interface MusicTrack {
  id: string
  name: string
  category: string
  duration: number
  path: string
}

type AspectRatio = '16:9' | '9:16' | '1:1'

interface TimelineState {
  clips: VideoClip[]
  musicTrack: MusicTrack | null
  aspectRatio: AspectRatio
}

interface EditorState {
  current: TimelineState
  past: TimelineState[]
  future: TimelineState[]
}

type EditorAction =
  | { type: 'SET_CLIPS'; clips: VideoClip[] }
  | { type: 'ADD_CLIP'; clip: VideoClip }
  | { type: 'REMOVE_CLIP'; id: string }
  | { type: 'UPDATE_CLIP'; id: string; updates: Partial<VideoClip> }
  | { type: 'REORDER_CLIPS'; fromIndex: number; toIndex: number }
  | { type: 'SET_MUSIC'; track: MusicTrack | null }
  | { type: 'SET_ASPECT_RATIO'; ratio: AspectRatio }
  | { type: 'APPLY_TEMPLATE'; template: TemplatePreset }
  | { type: 'UNDO' }
  | { type: 'REDO' }

interface TemplatePreset {
  name: string
  aspectRatio: AspectRatio
  introText: TextOverlay | null
  outroText: TextOverlay | null
}

interface SourceClip {
  name: string
  path: string
  duration: number
  thumbnailUrl: string
}

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

const API_BASE = 'http://localhost:3001'

const TEMPLATES: TemplatePreset[] = [
  {
    name: 'Book Promo 30s',
    aspectRatio: '9:16',
    introText: {
      id: 'tpl-intro',
      text: 'NEW RELEASE',
      fontSize: 56,
      color: '#ffffff',
      position: 'center',
      startTime: 0,
      duration: 3,
    },
    outroText: {
      id: 'tpl-outro',
      text: 'Available Now',
      fontSize: 48,
      color: '#ffffff',
      position: 'bottom',
      startTime: 0,
      duration: 4,
    },
  },
  {
    name: 'TikTok Vertical',
    aspectRatio: '9:16',
    introText: null,
    outroText: null,
  },
  {
    name: 'YouTube Landscape',
    aspectRatio: '16:9',
    introText: null,
    outroText: null,
  },
]

const MUSIC_TRACKS: MusicTrack[] = [
  { id: 'mt-1', name: 'Gentle Morning', category: 'Calm', duration: 120, path: '/audio/gentle-morning.mp3' },
  { id: 'mt-2', name: 'Ocean Breeze', category: 'Calm', duration: 90, path: '/audio/ocean-breeze.mp3' },
  { id: 'mt-3', name: 'Sunlit Pages', category: 'Calm', duration: 105, path: '/audio/sunlit-pages.mp3' },
  { id: 'mt-4', name: 'Electric Pulse', category: 'Upbeat', duration: 60, path: '/audio/electric-pulse.mp3' },
  { id: 'mt-5', name: 'Neon Rush', category: 'Upbeat', duration: 75, path: '/audio/neon-rush.mp3' },
  { id: 'mt-6', name: 'Pop Bounce', category: 'Upbeat', duration: 45, path: '/audio/pop-bounce.mp3' },
  { id: 'mt-7', name: 'Rising Spirit', category: 'Inspirational', duration: 90, path: '/audio/rising-spirit.mp3' },
  { id: 'mt-8', name: 'Golden Hour', category: 'Inspirational', duration: 110, path: '/audio/golden-hour.mp3' },
  { id: 'mt-9', name: 'Whisper Soft', category: 'ASMR', duration: 80, path: '/audio/whisper-soft.mp3' },
  { id: 'mt-10', name: 'Rain Taps', category: 'ASMR', duration: 95, path: '/audio/rain-taps.mp3' },
  { id: 'mt-11', name: 'Toy Piano', category: 'Playful', duration: 55, path: '/audio/toy-piano.mp3' },
  { id: 'mt-12', name: 'Cartoon Hop', category: 'Playful', duration: 40, path: '/audio/cartoon-hop.mp3' },
  { id: 'mt-13', name: 'Epic Trailer', category: 'Cinematic', duration: 130, path: '/audio/epic-trailer.mp3' },
  { id: 'mt-14', name: 'Dark Tension', category: 'Cinematic', duration: 100, path: '/audio/dark-tension.mp3' },
]

const MUSIC_CATEGORIES = ['Calm', 'Upbeat', 'Inspirational', 'ASMR', 'Playful', 'Cinematic']

const CLIP_COLORS = [
  'bg-violet-600/70',
  'bg-blue-600/70',
  'bg-emerald-600/70',
  'bg-amber-600/70',
  'bg-rose-600/70',
  'bg-cyan-600/70',
  'bg-pink-600/70',
  'bg-teal-600/70',
]

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

function uid(): string {
  return crypto.randomUUID()
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getClipDuration(clip: VideoClip): number {
  return clip.trimEnd - clip.trimStart
}

function getTotalDuration(clips: VideoClip[]): number {
  return clips.reduce((sum, c) => sum + getClipDuration(c), 0)
}

/* ═══════════════════════════════════════════════════════════════
   REDUCER (with undo/redo history)
   ═══════════════════════════════════════════════════════════════ */

function pushHistory(state: EditorState, next: TimelineState): EditorState {
  return {
    current: next,
    past: [...state.past.slice(-49), state.current],
    future: [],
  }
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_CLIPS': {
      const next = { ...state.current, clips: action.clips }
      return pushHistory(state, next)
    }
    case 'ADD_CLIP': {
      const next = { ...state.current, clips: [...state.current.clips, action.clip] }
      return pushHistory(state, next)
    }
    case 'REMOVE_CLIP': {
      const next = { ...state.current, clips: state.current.clips.filter(c => c.id !== action.id) }
      return pushHistory(state, next)
    }
    case 'UPDATE_CLIP': {
      const next = {
        ...state.current,
        clips: state.current.clips.map(c =>
          c.id === action.id ? { ...c, ...action.updates } : c
        ),
      }
      return pushHistory(state, next)
    }
    case 'REORDER_CLIPS': {
      const clips = [...state.current.clips]
      const [moved] = clips.splice(action.fromIndex, 1)
      clips.splice(action.toIndex, 0, moved)
      return pushHistory(state, { ...state.current, clips })
    }
    case 'SET_MUSIC': {
      return pushHistory(state, { ...state.current, musicTrack: action.track })
    }
    case 'SET_ASPECT_RATIO': {
      return pushHistory(state, { ...state.current, aspectRatio: action.ratio })
    }
    case 'APPLY_TEMPLATE': {
      const tpl = action.template
      const clips = state.current.clips.map((clip, i) => {
        const overlays = [...clip.textOverlays]
        if (i === 0 && tpl.introText) {
          overlays.push({ ...tpl.introText, id: uid() })
        }
        if (i === state.current.clips.length - 1 && tpl.outroText) {
          const outroStart = getClipDuration(clip) - tpl.outroText.duration
          overlays.push({ ...tpl.outroText, id: uid(), startTime: Math.max(0, outroStart) })
        }
        return { ...clip, textOverlays: overlays }
      })
      return pushHistory(state, { ...state.current, clips, aspectRatio: tpl.aspectRatio })
    }
    case 'UNDO': {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      return {
        current: previous,
        past: state.past.slice(0, -1),
        future: [state.current, ...state.future],
      }
    }
    case 'REDO': {
      if (state.future.length === 0) return state
      const next = state.future[0]
      return {
        current: next,
        past: [...state.past, state.current],
        future: state.future.slice(1),
      }
    }
    default:
      return state
  }
}

const initialState: EditorState = {
  current: { clips: [], musicTrack: null, aspectRatio: '16:9' },
  past: [],
  future: [],
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export function VideoEditor() {
  const [state, dispatch] = useReducer(editorReducer, initialState)
  const { clips, musicTrack, aspectRatio } = state.current

  // Source clips from the server (clip library)
  const [sourceClips, setSourceClips] = useState<SourceClip[]>([])
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playheadTime, setPlayheadTime] = useState(0)
  const [pxPerSecond, setPxPerSecond] = useState(40)
  const [showMusicModal, setShowMusicModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportOutputName, setExportOutputName] = useState('my-export')
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle')
  const [exportResult, setExportResult] = useState<string | null>(null)
  const [propertiesTab, setPropertiesTab] = useState<'clip' | 'transitions' | 'text'>('clip')
  const [musicCategory, setMusicCategory] = useState('Calm')
  const [previewAudioId, setPreviewAudioId] = useState<string | null>(null)

  // Phase 1A improvements state
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [brandingEnabled, setBrandingEnabled] = useState(false)
  const [brandingTheme, setBrandingTheme] = useState<'QuietHours' | 'GrabABite' | 'PermissionSlip' | 'ArtOfDoingLess' | 'ItalyCalled'>('QuietHours')
  const [exportProgress, setExportProgress] = useState(0)
  const [waveformBars, setWaveformBars] = useState<number[]>([])
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const projectFileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedClip = clips.find(c => c.id === selectedClipId) ?? null
  const totalDuration = getTotalDuration(clips)

  /* ─── Fetch source clips on mount ──────────────────────── */
  useEffect(() => {
    fetch(`${API_BASE}/api/video/clips`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((data: SourceClip[]) => setSourceClips(data))
      .catch(() => {
        /* Server may not have this endpoint yet - that's fine */
      })
  }, [])

  /* ─── Keyboard shortcuts ───────────────────────────────── */
  useEffect(() => {
    function handleKey(e: globalThis.KeyboardEvent) {
      // Don't intercept when typing in an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return

      if (e.key === 'Delete' && selectedClipId) {
        dispatch({ type: 'REMOVE_CLIP', id: selectedClipId })
        setSelectedClipId(null)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        dispatch({ type: 'UNDO' })
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        dispatch({ type: 'REDO' })
      }
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault()
        togglePlay()
      }
      // J/K/L shuttle controls
      if (e.key === 'k') {
        e.preventDefault()
        if (videoRef.current) videoRef.current.playbackRate = 1
        setIsPlaying(false)
        if (playIntervalRef.current) clearInterval(playIntervalRef.current)
      }
      if (e.key === 'l') {
        e.preventDefault()
        if (!isPlaying) togglePlay()
      }
      if (e.key === 'j') {
        e.preventDefault()
        setPlayheadTime(prev => clamp(prev - 2, 0, totalDuration))
      }
      // Frame stepping
      if (e.key === 'ArrowRight' && !e.shiftKey) {
        e.preventDefault()
        setPlayheadTime(prev => clamp(prev + 1 / 30, 0, totalDuration))
      }
      if (e.key === 'ArrowLeft' && !e.shiftKey) {
        e.preventDefault()
        setPlayheadTime(prev => clamp(prev - 1 / 30, 0, totalDuration))
      }
      // I/O trim in/out
      if (e.key === 'i' && selectedClipId) {
        e.preventDefault()
        const clip = clips.find(c => c.id === selectedClipId)
        if (clip) {
          const clipStart = clips.slice(0, clips.indexOf(clip)).reduce((s, c) => s + getClipDuration(c), 0)
          const offset = playheadTime - clipStart
          const newTrimStart = clamp(clip.trimStart + offset, 0, clip.trimEnd - 0.1)
          dispatch({ type: 'UPDATE_CLIP', id: selectedClipId, updates: { trimStart: newTrimStart } })
        }
      }
      if (e.key === 'o' && selectedClipId) {
        e.preventDefault()
        const clip = clips.find(c => c.id === selectedClipId)
        if (clip) {
          const clipStart = clips.slice(0, clips.indexOf(clip)).reduce((s, c) => s + getClipDuration(c), 0)
          const offset = playheadTime - clipStart
          const newTrimEnd = clamp(clip.trimStart + offset, clip.trimStart + 0.1, clip.duration)
          dispatch({ type: 'UPDATE_CLIP', id: selectedClipId, updates: { trimEnd: newTrimEnd } })
        }
      }
      // ? = keyboard shortcuts modal
      if (e.key === '?') {
        setShowShortcutsModal(true)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedClipId, isPlaying, clips, totalDuration, playheadTime])

  /* ─── Playback loop ────────────────────────────────────── */
  const togglePlay = useCallback(() => {
    if (clips.length === 0) return
    if (isPlaying) {
      setIsPlaying(false)
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
      videoRef.current?.pause()
    } else {
      setIsPlaying(true)
      playIntervalRef.current = setInterval(() => {
        setPlayheadTime(prev => {
          const next = prev + 0.05
          if (next >= totalDuration) {
            setIsPlaying(false)
            if (playIntervalRef.current) clearInterval(playIntervalRef.current)
            return 0
          }
          return next
        })
      }, 50)
    }
  }, [isPlaying, clips, totalDuration])

  const stopPlayback = useCallback(() => {
    setIsPlaying(false)
    setPlayheadTime(0)
    if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    videoRef.current?.pause()
  }, [])

  useEffect(() => {
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    }
  }, [])

  /* ─── Determine which clip the playhead is over ─────── */
  function getClipAtPlayhead(): { clip: VideoClip; offset: number } | null {
    let acc = 0
    for (const clip of clips) {
      const dur = getClipDuration(clip)
      if (playheadTime >= acc && playheadTime < acc + dur) {
        return { clip, offset: playheadTime - acc + clip.trimStart }
      }
      acc += dur
    }
    return null
  }

  const currentClipInfo = getClipAtPlayhead()

  /* Sync <video> element with playhead (best effort) */
  useEffect(() => {
    if (videoRef.current && currentClipInfo) {
      const src = `${API_BASE}${currentClipInfo.clip.path}`
      if (videoRef.current.getAttribute('data-src') !== src) {
        videoRef.current.src = src
        videoRef.current.setAttribute('data-src', src)
      }
      const diff = Math.abs(videoRef.current.currentTime - currentClipInfo.offset)
      if (diff > 0.5) {
        videoRef.current.currentTime = currentClipInfo.offset
      }
      if (isPlaying && videoRef.current.paused) {
        videoRef.current.play().catch(() => {})
      }
    }
  }, [currentClipInfo?.clip.id, isPlaying, Math.floor(playheadTime * 2)])

  /* ─── Import clips from file input ─────────────────────── */
  function handleFileImport(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      const clip: VideoClip = {
        id: uid(),
        name: file.name,
        path: URL.createObjectURL(file),
        duration: 30, // placeholder until metadata loaded
        thumbnailUrl: '',
        trimStart: 0,
        trimEnd: 30,
        transition: 'cut',
        transitionDuration: 0.5,
        easing: 'linear',
        textOverlays: [],
      }
      // Try to get real duration + generate thumbnail
      const tempVideo = document.createElement('video')
      tempVideo.preload = 'metadata'
      tempVideo.src = clip.path
      tempVideo.onloadedmetadata = () => {
        const dur = tempVideo.duration
        dispatch({
          type: 'UPDATE_CLIP',
          id: clip.id,
          updates: { duration: dur, trimEnd: dur },
        })
        // Generate thumbnail at 1s
        tempVideo.currentTime = Math.min(1, dur * 0.1)
      }
      tempVideo.onseeked = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = 320
          canvas.height = 180
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(tempVideo, 0, 0, 320, 180)
            const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8)
            dispatch({ type: 'UPDATE_CLIP', id: clip.id, updates: { thumbnailUrl } })
          }
        } catch {
          // Cross-origin or codec issue — thumbnail stays empty
        }
      }
      dispatch({ type: 'ADD_CLIP', clip })
    }
    e.target.value = ''
  }

  /* ─── Add source clip to timeline ──────────────────────── */
  function addSourceClipToTimeline(src: SourceClip) {
    const clip: VideoClip = {
      id: uid(),
      name: src.name,
      path: src.path,
      duration: src.duration,
      thumbnailUrl: src.thumbnailUrl,
      trimStart: 0,
      trimEnd: src.duration,
      transition: 'cut',
      transitionDuration: 0.5,
      easing: 'linear',
      textOverlays: [],
    }
    dispatch({ type: 'ADD_CLIP', clip })
  }

  /* ─── Timeline drag and drop reorder ───────────────────── */
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  function handleTimelineDragStart(e: DragEvent<HTMLDivElement>, index: number) {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  function handleTimelineDragOver(e: DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  function handleTimelineDrop(e: DragEvent<HTMLDivElement>, toIndex: number) {
    e.preventDefault()
    if (dragIndex !== null && dragIndex !== toIndex) {
      dispatch({ type: 'REORDER_CLIPS', fromIndex: dragIndex, toIndex })
    }
    setDragIndex(null)
    setDragOverIndex(null)
  }

  function handleTimelineDragEnd() {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  /* ─── Trim handles ─────────────────────────────────────── */
  const [trimming, setTrimming] = useState<{
    clipId: string
    edge: 'start' | 'end'
    startX: number
    initialValue: number
  } | null>(null)

  function startTrim(clipId: string, edge: 'start' | 'end', clientX: number) {
    const clip = clips.find(c => c.id === clipId)
    if (!clip) return
    setTrimming({
      clipId,
      edge,
      startX: clientX,
      initialValue: edge === 'start' ? clip.trimStart : clip.trimEnd,
    })
  }

  useEffect(() => {
    if (!trimming) return
    function onMouseMove(e: MouseEvent) {
      if (!trimming) return
      const deltaPx = e.clientX - trimming.startX
      const deltaSec = deltaPx / pxPerSecond
      const clip = clips.find(c => c.id === trimming.clipId)
      if (!clip) return
      // Snap to nearest second if snapEnabled
      const snapFn = (v: number) => snapEnabled ? Math.round(v * 2) / 2 : v
      if (trimming.edge === 'start') {
        const raw = clamp(trimming.initialValue + deltaSec, 0, clip.trimEnd - 0.1)
        dispatch({ type: 'UPDATE_CLIP', id: clip.id, updates: { trimStart: snapFn(raw) } })
      } else {
        const raw = clamp(trimming.initialValue + deltaSec, clip.trimStart + 0.1, clip.duration)
        dispatch({ type: 'UPDATE_CLIP', id: clip.id, updates: { trimEnd: snapFn(raw) } })
      }
    }
    function onMouseUp() {
      setTrimming(null)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [trimming, clips, pxPerSecond, snapEnabled])

  /* ─── Export ────────────────────────────────────────────── */
  async function handleExport() {
    setExportStatus('exporting')
    setExportResult(null)
    const body = {
      clips: clips.map(c => ({
        path: c.path,
        trimStart: c.trimStart,
        trimEnd: c.trimEnd,
        transition: c.transition,
        textOverlays: c.textOverlays.map(t => ({
          text: t.text,
          fontSize: t.fontSize,
          color: t.color,
          position: t.position,
          startTime: t.startTime,
          duration: t.duration,
        })),
      })),
      aspectRatio,
      musicPath: musicTrack?.path ?? null,
      outputName: exportOutputName,
    }
    try {
      const res = await fetch(`${API_BASE}/api/video/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Export failed')
      const data = await res.json()
      setExportResult(data.downloadUrl ?? data.output ?? 'Export complete')
      setExportStatus('done')
    } catch {
      setExportStatus('error')
    }
  }

  /* ─── Export with Remotion (HD) ───────────────────────── */
  async function handleRemotionExport() {
    setExportStatus('exporting')
    setExportProgress(0)
    setExportResult(null)

    // Simulated progress while rendering
    const progressInterval = setInterval(() => {
      setExportProgress(prev => Math.min(prev + 2, 95))
    }, 800)

    try {
      const body = {
        clips: clips.map(c => ({
          path: c.path,
          trimStart: c.trimStart,
          trimEnd: c.trimEnd,
          transition: c.transition,
          transitionDuration: c.transitionDuration,
          textOverlays: c.textOverlays.map(t => ({
            text: t.text,
            fontSize: t.fontSize,
            color: t.color,
            x: t.x ?? (t.position === 'top' ? 50 : t.position === 'bottom' ? 50 : 50),
            y: t.y ?? (t.position === 'top' ? 10 : t.position === 'bottom' ? 85 : 50),
            startTime: t.startTime,
            duration: t.duration,
          })),
        })),
        aspectRatio,
        musicPath: musicTrack?.path ?? null,
        brandingTheme,
        brandingEnabled,
        textOverlays: [],
      }
      const res = await fetch(`${API_BASE}/api/video/render-remotion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Remotion render failed')
      const data = await res.json()
      setExportProgress(100)
      setExportResult(data.downloadUrl ?? 'Remotion export complete')
      setExportStatus('done')
    } catch (err: any) {
      setExportStatus('error')
    } finally {
      clearInterval(progressInterval)
    }
  }

  /* ─── Project Save ─────────────────────────────────────── */
  function saveProject() {
    const projectData = {
      version: '1.0',
      savedAt: new Date().toISOString(),
      state: state.current,
    }
    const json = JSON.stringify(projectData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `panini-pano-project-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ─── Project Load ─────────────────────────────────────── */
  function handleProjectLoad(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const projectData = JSON.parse(ev.target?.result as string)
        const loadedState: TimelineState = projectData.state ?? projectData
        if (loadedState.clips) {
          dispatch({ type: 'SET_CLIPS', clips: loadedState.clips })
        }
        if (loadedState.musicTrack !== undefined) {
          dispatch({ type: 'SET_MUSIC', track: loadedState.musicTrack })
        }
        if (loadedState.aspectRatio) {
          dispatch({ type: 'SET_ASPECT_RATIO', ratio: loadedState.aspectRatio })
        }
      } catch {
        alert('Invalid project file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  /* ─── Music Audio Preview ──────────────────────────────── */
  function previewMusicTrack(track: MusicTrack) {
    if (audioRef.current) {
      if (playingAudioId === track.id) {
        audioRef.current.pause()
        setPlayingAudioId(null)
      } else {
        audioRef.current.src = `${API_BASE}${track.path}`
        audioRef.current.play().catch(() => {})
        setPlayingAudioId(track.id)
      }
    }
  }

  function stopMusicPreview() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setPlayingAudioId(null)
    setWaveformBars([])
  }

  /* ─── Waveform generation (cosmetic) ───────────────────── */
  function generateWaveformBars(): number[] {
    const bars = Array.from({ length: 50 }, () => 4 + Math.random() * 32)
    setWaveformBars(bars)
    return bars
  }

  /* ─── Select music track ───────────────────────────────── */

  /* ─── Apply template ───────────────────────────────────── */
  function applyTemplate(tpl: TemplatePreset) {
    dispatch({ type: 'APPLY_TEMPLATE', template: tpl })
  }

  /* ─── Add text overlay ─────────────────────────────────── */
  function addTextOverlay() {
    if (!selectedClipId) return
    const overlay: TextOverlay = {
      id: uid(),
      text: 'New Text',
      fontSize: 48,
      color: '#ffffff',
      position: 'center',
      startTime: 0,
      duration: 3,
    }
    const clip = clips.find(c => c.id === selectedClipId)
    if (!clip) return
    dispatch({
      type: 'UPDATE_CLIP',
      id: selectedClipId,
      updates: { textOverlays: [...clip.textOverlays, overlay] },
    })
  }

  function updateTextOverlay(clipId: string, overlayId: string, updates: Partial<TextOverlay>) {
    const clip = clips.find(c => c.id === clipId)
    if (!clip) return
    dispatch({
      type: 'UPDATE_CLIP',
      id: clipId,
      updates: {
        textOverlays: clip.textOverlays.map(o =>
          o.id === overlayId ? { ...o, ...updates } : o
        ),
      },
    })
  }

  function removeTextOverlay(clipId: string, overlayId: string) {
    const clip = clips.find(c => c.id === clipId)
    if (!clip) return
    dispatch({
      type: 'UPDATE_CLIP',
      id: clipId,
      updates: { textOverlays: clip.textOverlays.filter(o => o.id !== overlayId) },
    })
  }

  /* ─── Timeline click to seek ────────────────────────────── */
  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft
    const time = x / pxPerSecond
    setPlayheadTime(clamp(time, 0, totalDuration))
  }

  /* ─── Aspect ratio preview dimensions ───────────────────── */
  function getPreviewStyle(): { aspectRatio: string } {
    switch (aspectRatio) {
      case '9:16': return { aspectRatio: '9/16' }
      case '1:1': return { aspectRatio: '1/1' }
      default: return { aspectRatio: '16/9' }
    }
  }

  /* ─── Generate time ruler ticks ─────────────────────────── */
  function renderTimeRuler() {
    const dur = Math.max(totalDuration, 30)
    const tickInterval = pxPerSecond >= 30 ? 5 : 10
    const ticks: React.ReactElement[] = []
    for (let t = 0; t <= dur; t += tickInterval) {
      ticks.push(
        <div
          key={t}
          className="absolute top-0 flex flex-col items-center"
          style={{ left: t * pxPerSecond }}
        >
          <span className="text-[10px] text-slate-500 select-none">{t}s</span>
          <div className="w-px h-2 bg-slate-600" />
        </div>
      )
    }
    // Minor ticks every second when zoomed in
    if (pxPerSecond >= 30) {
      for (let t = 0; t <= dur; t += 1) {
        if (t % tickInterval === 0) continue
        ticks.push(
          <div
            key={`m-${t}`}
            className="absolute top-3 w-px h-1 bg-slate-700"
            style={{ left: t * pxPerSecond }}
          />
        )
      }
    }
    return ticks
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */

  return (
    <div
      ref={containerRef}
      className="flex flex-col w-full h-screen bg-[#0c0c14] text-slate-200 font-[Plus_Jakarta_Sans] select-none overflow-hidden"
      tabIndex={0}
    >
      {/* ──── TOOLBAR ────────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-4 py-2 bg-[#14141f] border-b border-[#2a2a3d] shrink-0">
        <div className="flex items-center gap-2 mr-4">
          <Film className="w-5 h-5 text-violet-400" />
          <span className="text-sm font-semibold tracking-wide text-slate-100">Video Editor</span>
        </div>

        {/* Undo / Redo */}
        <button
          onClick={() => dispatch({ type: 'UNDO' })}
          disabled={state.past.length === 0}
          className="p-1.5 rounded hover:bg-[#1c1c2a] disabled:opacity-30 transition-colors"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => dispatch({ type: 'REDO' })}
          disabled={state.future.length === 0}
          className="p-1.5 rounded hover:bg-[#1c1c2a] disabled:opacity-30 transition-colors"
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-[#2a2a3d] mx-1" />

        {/* Templates */}
        <div className="relative group">
          <button className="flex items-center gap-1 px-3 py-1.5 text-xs rounded hover:bg-[#1c1c2a] transition-colors">
            <Scissors className="w-3.5 h-3.5" />
            Templates
          </button>
          <div className="absolute left-0 top-full mt-1 w-48 bg-[#14141f] border border-[#2a2a3d] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            {TEMPLATES.map(tpl => (
              <button
                key={tpl.name}
                onClick={() => applyTemplate(tpl)}
                className="block w-full text-left px-3 py-2 text-xs hover:bg-[#1c1c2a] transition-colors first:rounded-t-lg last:rounded-b-lg"
              >
                {tpl.name}
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio */}
        <div className="flex items-center gap-1 ml-1">
          {(['16:9', '9:16', '1:1'] as const).map(r => (
            <button
              key={r}
              onClick={() => dispatch({ type: 'SET_ASPECT_RATIO', ratio: r })}
              className={`px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                aspectRatio === r
                  ? 'bg-violet-600 text-white'
                  : 'bg-[#1c1c2a] text-slate-400 hover:text-slate-200'
              }`}
              aria-pressed={aspectRatio === r}
              aria-label={`Aspect ratio ${r}`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-[#2a2a3d] mx-1" />

        {/* Music */}
        <button
          onClick={() => setShowMusicModal(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded hover:bg-[#1c1c2a] transition-colors"
        >
          <Music className="w-3.5 h-3.5 text-purple-400" />
          Music
        </button>

        <div className="flex-1" />

        {/* Snap toggle */}
        <button
          onClick={() => setSnapEnabled(s => !s)}
          className={`px-2 py-1 text-[11px] rounded transition-colors ${snapEnabled ? 'bg-violet-600/30 text-violet-300' : 'bg-[#1c1c2a] text-slate-500'}`}
          title="Snap to grid (0.5s)"
        >
          ⊞ Snap
        </button>

        {/* Save / Load project */}
        <button
          onClick={saveProject}
          disabled={clips.length === 0}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded hover:bg-[#1c1c2a] transition-colors disabled:opacity-40"
          title="Save project as JSON"
        >
          💾 Save
        </button>
        <button
          onClick={() => projectFileInputRef.current?.click()}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded hover:bg-[#1c1c2a] transition-colors"
          title="Load project from JSON"
        >
          📂 Load
        </button>
        <input
          ref={projectFileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleProjectLoad}
          aria-label="Load project file"
        />

        {/* Keyboard shortcuts help */}
        <button
          onClick={() => setShowShortcutsModal(true)}
          className="px-2 py-1.5 text-xs rounded hover:bg-[#1c1c2a] transition-colors text-slate-500"
          title="Keyboard shortcuts"
        >
          ?
        </button>

        {/* Export */}
        <button
          onClick={() => { setShowExportModal(true); setExportStatus('idle'); setExportProgress(0) }}
          disabled={clips.length === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-40 transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </header>

      {/* Hidden audio element for music preview */}
      <audio ref={audioRef} onEnded={() => setPlayingAudioId(null)} />

      {/* Hidden project file input */}

      {/* ──── MAIN BODY ──────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ─── CLIP PANEL (left sidebar) ───────────────────── */}
        <aside className="w-[250px] shrink-0 bg-[#14141f] border-r border-[#2a2a3d] flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a3d]">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Clips</h2>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 transition-colors"
            >
              <Upload className="w-3 h-3" />
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.mov"
              multiple
              className="hidden"
              onChange={handleFileImport}
              aria-label="Import video clips"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5" role="list" aria-label="Available clips">
            {sourceClips.length === 0 && clips.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <Film className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs text-slate-500">No clips yet</p>
                <p className="text-[11px] text-slate-600 mt-1">Import clips or load from server</p>
              </div>
            )}

            {sourceClips.map(src => (
              <button
                key={src.name}
                onClick={() => addSourceClipToTimeline(src)}
                className="flex items-center gap-2 w-full p-2 rounded-lg bg-[#1c1c2a] hover:bg-[#252536] transition-colors text-left group"
                role="listitem"
              >
                <div className="w-14 h-10 rounded bg-[#2a2a3d] overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {src.thumbnailUrl ? (
                    <img
                      src={`${API_BASE}${src.thumbnailUrl}`}
                      alt={`Thumbnail for ${src.name}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Film className="w-4 h-4 text-slate-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-slate-300 truncate">{src.name}</p>
                  <p className="text-[10px] text-slate-500">{formatTime(src.duration)}</p>
                </div>
                <Plus className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </aside>

        {/* ─── CENTER AREA (Preview + Timeline) ────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Preview Player */}
          <div className="flex-1 flex items-center justify-center bg-[#0c0c14] p-4 min-h-0">
            <div className="relative w-full max-h-full flex items-center justify-center">
              <div
                className="relative bg-black rounded-lg overflow-hidden shadow-2xl max-w-full max-h-full"
                style={{ ...getPreviewStyle(), width: '100%', maxWidth: aspectRatio === '9:16' ? '280px' : '640px' }}
              >
                <video
                  ref={videoRef}
                  className="w-full h-full object-contain"
                  muted
                  playsInline
                  aria-label="Video preview"
                >
                  <track kind="captions" />
                </video>

                {/* Text overlay preview */}
                {currentClipInfo && currentClipInfo.clip.textOverlays.map(overlay => {
                  const clipOffset = playheadTime - clips.slice(0, clips.indexOf(currentClipInfo.clip)).reduce((s, c) => s + getClipDuration(c), 0)
                  if (clipOffset >= overlay.startTime && clipOffset < overlay.startTime + overlay.duration) {
                    return (
                      <div
                        key={overlay.id}
                        className={`absolute left-0 right-0 flex justify-center pointer-events-none px-4 ${
                          overlay.position === 'top' ? 'top-4' : overlay.position === 'bottom' ? 'bottom-4' : 'top-1/2 -translate-y-1/2'
                        }`}
                      >
                        <span
                          style={{ fontSize: `${overlay.fontSize * 0.5}px`, color: overlay.color }}
                          className="font-bold drop-shadow-lg text-center"
                        >
                          {overlay.text}
                        </span>
                      </div>
                    )
                  }
                  return null
                })}

                {clips.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0c0c14]">
                    <Film className="w-12 h-12 text-slate-700 mb-3" />
                    <p className="text-sm text-slate-500">Add clips to get started</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Transport controls */}
          <div className="flex items-center gap-3 px-4 py-2 bg-[#14141f] border-t border-[#2a2a3d]">
            <button
              onClick={togglePlay}
              disabled={clips.length === 0}
              className="p-2 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 transition-colors"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={stopPlayback}
              disabled={clips.length === 0}
              className="p-1.5 rounded hover:bg-[#1c1c2a] disabled:opacity-40 transition-colors"
              aria-label="Stop"
            >
              <Square className="w-4 h-4" />
            </button>

            {/* Scrubber */}
            <input
              type="range"
              min={0}
              max={totalDuration || 1}
              step={0.05}
              value={playheadTime}
              onChange={e => setPlayheadTime(Number(e.target.value))}
              className="flex-1 h-1 accent-violet-500 cursor-pointer"
              aria-label="Playback position"
            />

            <span className="text-xs text-slate-400 tabular-nums min-w-[80px] text-right">
              {formatTime(playheadTime)} / {formatTime(totalDuration)}
            </span>
          </div>

          {/* ─── TIMELINE ──────────────────────────────────── */}
          <div className="h-[200px] shrink-0 bg-[#1a1a2e] border-t border-[#2a2a3d] flex flex-col">
            {/* Timeline toolbar */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a3d] bg-[#14141f]">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Timeline</span>
              <div className="flex-1" />
              {selectedClipId && (
                <button
                  onClick={() => {
                    dispatch({ type: 'REMOVE_CLIP', id: selectedClipId })
                    setSelectedClipId(null)
                  }}
                  className="p-1 rounded hover:bg-red-600/20 text-red-400 transition-colors"
                  title="Delete clip"
                  aria-label="Delete selected clip"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setPxPerSecond(prev => Math.min(prev + 10, 120))}
                className="p-1 rounded hover:bg-[#1c1c2a] transition-colors"
                title="Zoom in"
                aria-label="Zoom in timeline"
              >
                <ZoomIn className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <button
                onClick={() => setPxPerSecond(prev => Math.max(prev - 10, 10))}
                className="p-1 rounded hover:bg-[#1c1c2a] transition-colors"
                title="Zoom out"
                aria-label="Zoom out timeline"
              >
                <ZoomOut className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>

            {/* Scrollable timeline area */}
            <div
              ref={timelineRef}
              className="flex-1 overflow-x-auto overflow-y-hidden relative cursor-pointer"
              onClick={handleTimelineClick}
              role="region"
              aria-label="Video timeline"
            >
              <div
                className="relative min-h-full"
                style={{ width: Math.max(totalDuration, 30) * pxPerSecond + 60 }}
              >
                {/* Time ruler */}
                <div className="h-5 relative border-b border-[#2a2a3d]">
                  {renderTimeRuler()}
                </div>

                {/* Video track */}
                <div className="h-16 relative flex items-center px-1 gap-px">
                  {clips.map((clip, index) => {
                    const clipDur = getClipDuration(clip)
                    const widthPx = clipDur * pxPerSecond
                    const colorClass = CLIP_COLORS[index % CLIP_COLORS.length]
                    const isSelected = clip.id === selectedClipId
                    const isDragOver = dragOverIndex === index

                    return (
                      <div
                        key={clip.id}
                        draggable
                        onDragStart={e => handleTimelineDragStart(e, index)}
                        onDragOver={e => handleTimelineDragOver(e, index)}
                        onDrop={e => handleTimelineDrop(e, index)}
                        onDragEnd={handleTimelineDragEnd}
                        onClick={e => {
                          e.stopPropagation()
                          setSelectedClipId(clip.id)
                        }}
                        className={`relative h-12 rounded-md flex items-center overflow-hidden cursor-grab active:cursor-grabbing transition-all ${colorClass} ${
                          isSelected ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#1a1a2e]' : ''
                        } ${isDragOver ? 'ring-2 ring-violet-400' : ''} ${
                          dragIndex === index ? 'opacity-50' : ''
                        }`}
                        style={{ width: widthPx, minWidth: 40 }}
                        role="button"
                        aria-label={`Clip: ${clip.name}, duration ${formatTime(clipDur)}`}
                        aria-selected={isSelected}
                        tabIndex={0}
                        onKeyDown={(e: ReactKeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedClipId(clip.id)
                          }
                        }}
                        onTouchStart={e => {
                          e.stopPropagation()
                          setSelectedClipId(clip.id)
                          setDragIndex(index)
                        }}
                        onTouchMove={e => {
                          e.preventDefault()
                          const touch = e.touches[0]
                          const el = timelineRef.current
                          if (!el || dragIndex === null) return
                          const rect = el.getBoundingClientRect()
                          const x = touch.clientX - rect.left
                          const newIndex = Math.max(0, Math.min(clips.length - 1, Math.floor(x / (pxPerSecond * 5))))
                          setDragOverIndex(newIndex)
                        }}
                        onTouchEnd={() => {
                          if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
                            dispatch({ type: 'REORDER_CLIPS', from: dragIndex, to: dragOverIndex })
                          }
                          setDragIndex(null)
                          setDragOverIndex(null)
                        }}
                      >
                        {/* Left trim handle */}
                        <div
                          className="absolute left-0 top-0 bottom-0 w-2 bg-white/20 hover:bg-white/40 cursor-col-resize z-10 flex items-center justify-center"
                          onMouseDown={e => {
                            e.stopPropagation()
                            startTrim(clip.id, 'start', e.clientX)
                          }}
                          role="slider"
                          aria-label={`Trim start for ${clip.name}`}
                          aria-valuemin={0}
                          aria-valuemax={clip.trimEnd}
                          aria-valuenow={clip.trimStart}
                          tabIndex={0}
                        >
                          <div className="w-0.5 h-4 bg-white/60 rounded-full" />
                        </div>

                        {/* Clip content */}
                        <div className="flex-1 flex items-center gap-1.5 px-3 min-w-0">
                          <Film className="w-3 h-3 text-white/60 shrink-0" />
                          <span className="text-[10px] text-white/80 font-medium truncate">
                            {clip.name}
                          </span>
                        </div>

                        {/* Text overlay indicators */}
                        {clip.textOverlays.length > 0 && (
                          <div className="absolute bottom-0.5 right-2 flex items-center gap-0.5">
                            <Type className="w-2.5 h-2.5 text-white/50" />
                            <span className="text-[8px] text-white/40">{clip.textOverlays.length}</span>
                          </div>
                        )}

                        {/* Right trim handle */}
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 bg-white/20 hover:bg-white/40 cursor-col-resize z-10 flex items-center justify-center"
                          onMouseDown={e => {
                            e.stopPropagation()
                            startTrim(clip.id, 'end', e.clientX)
                          }}
                          role="slider"
                          aria-label={`Trim end for ${clip.name}`}
                          aria-valuemin={clip.trimStart}
                          aria-valuemax={clip.duration}
                          aria-valuenow={clip.trimEnd}
                          tabIndex={0}
                        >
                          <div className="w-0.5 h-4 bg-white/60 rounded-full" />
                        </div>
                      </div>
                    )
                  })}

                  {clips.length === 0 && (
                    <div className="flex items-center justify-center w-full h-full">
                      <span className="text-xs text-slate-600">Drop clips here to build your timeline</span>
                    </div>
                  )}
                </div>

                {/* Audio track row */}
                <div className="h-10 relative flex items-center px-1 border-t border-[#2a2a3d]/50">
                  <span className="absolute left-2 text-[9px] text-purple-400/60 font-medium uppercase tracking-wide">Audio</span>
                  {musicTrack && (
                    <div
                      className="ml-12 h-7 rounded-md bg-purple-600/40 border border-purple-500/30 flex items-center px-3 gap-1.5 overflow-hidden"
                      style={{ width: Math.min(musicTrack.duration, totalDuration || 30) * pxPerSecond }}
                    >
                      <Music className="w-3 h-3 text-purple-300 shrink-0" />
                      <span className="text-[10px] text-purple-200 truncate shrink-0">{musicTrack.name}</span>
                      {/* Waveform visualization (cosmetic) */}
                      {waveformBars.length > 0 && (
                        <div className="flex items-center gap-px ml-1 h-5 overflow-hidden">
                          {waveformBars.map((h, i) => (
                            <div
                              key={i}
                              className="w-[2px] bg-purple-400/60 rounded-full shrink-0"
                              style={{ height: h * 0.5 }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Playhead */}
                <div
                  className="absolute top-0 bottom-0 pointer-events-none z-20"
                  style={{ left: playheadTime * pxPerSecond }}
                >
                  {/* Triangle marker */}
                  <div className="relative -left-1.5">
                    <div
                      className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-red-500"
                    />
                  </div>
                  <div className="w-px h-full bg-red-500 absolute left-[4px] top-0" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── PROPERTIES PANEL (right sidebar) ────────────── */}
        <aside className="w-[280px] shrink-0 bg-[#14141f] border-l border-[#2a2a3d] flex flex-col overflow-hidden">
          {selectedClip ? (
            <>
              {/* Tabs */}
              <div className="flex border-b border-[#2a2a3d]">
                {([
                  { key: 'clip' as const, label: 'Clip' },
                  { key: 'transitions' as const, label: 'Transitions' },
                  { key: 'text' as const, label: 'Text' },
                ]).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setPropertiesTab(tab.key)}
                    className={`flex-1 px-2 py-2.5 text-[11px] font-medium transition-colors ${
                      propertiesTab === tab.key
                        ? 'text-violet-300 border-b-2 border-violet-500'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                    aria-selected={propertiesTab === tab.key}
                    role="tab"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {/* ── Clip Properties Tab ─────────────────── */}
                {propertiesTab === 'clip' && (
                  <>
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Clip Name
                      </label>
                      <p className="text-sm text-slate-200 truncate">{selectedClip.name}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="trim-start"
                          className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1"
                        >
                          Trim Start (s)
                        </label>
                        <input
                          id="trim-start"
                          type="number"
                          min={0}
                          max={selectedClip.trimEnd - 0.1}
                          step={0.1}
                          value={Number(selectedClip.trimStart.toFixed(2))}
                          onChange={e => dispatch({
                            type: 'UPDATE_CLIP',
                            id: selectedClip.id,
                            updates: { trimStart: clamp(Number(e.target.value), 0, selectedClip.trimEnd - 0.1) },
                          })}
                          className="w-full px-2 py-1.5 text-xs bg-[#1c1c2a] border border-[#2a2a3d] rounded focus:border-violet-500 focus:outline-none text-slate-200 tabular-nums"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="trim-end"
                          className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1"
                        >
                          Trim End (s)
                        </label>
                        <input
                          id="trim-end"
                          type="number"
                          min={selectedClip.trimStart + 0.1}
                          max={selectedClip.duration}
                          step={0.1}
                          value={Number(selectedClip.trimEnd.toFixed(2))}
                          onChange={e => dispatch({
                            type: 'UPDATE_CLIP',
                            id: selectedClip.id,
                            updates: { trimEnd: clamp(Number(e.target.value), selectedClip.trimStart + 0.1, selectedClip.duration) },
                          })}
                          className="w-full px-2 py-1.5 text-xs bg-[#1c1c2a] border border-[#2a2a3d] rounded focus:border-violet-500 focus:outline-none text-slate-200 tabular-nums"
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Duration</p>
                      <p className="text-sm text-slate-300 tabular-nums">
                        {formatTime(getClipDuration(selectedClip))}
                      </p>
                    </div>
                  </>
                )}

                {/* ── Transitions Tab ─────────────────────── */}
                {propertiesTab === 'transitions' && (
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="transition-select" className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Transition Type
                      </label>
                      <select
                        id="transition-select"
                        value={selectedClip.transition}
                        onChange={e => dispatch({ type: 'UPDATE_CLIP', id: selectedClip.id, updates: { transition: e.target.value as VideoClip['transition'] } })}
                        className="w-full px-2 py-1.5 text-xs bg-[#1c1c2a] border border-[#2a2a3d] rounded focus:border-violet-500 focus:outline-none text-slate-200 appearance-none cursor-pointer"
                      >
                        <option value="cut">Cut</option>
                        <option value="crossfade">Crossfade</option>
                        <option value="wipe-left">Wipe Left</option>
                        <option value="wipe-right">Wipe Right</option>
                        <option value="slide">Slide</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Duration: {selectedClip.transitionDuration?.toFixed(1) ?? '0.5'}s
                      </label>
                      <input
                        type="range"
                        min={0.1}
                        max={2.0}
                        step={0.1}
                        value={selectedClip.transitionDuration ?? 0.5}
                        onChange={e => dispatch({ type: 'UPDATE_CLIP', id: selectedClip.id, updates: { transitionDuration: parseFloat(e.target.value) } })}
                        className="w-full accent-violet-500"
                      />
                      <div className="flex justify-between text-[9px] text-slate-600">
                        <span>0.1s</span><span>2.0s</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Easing</label>
                      <select
                        value={selectedClip.easing ?? 'linear'}
                        onChange={e => dispatch({ type: 'UPDATE_CLIP', id: selectedClip.id, updates: { easing: e.target.value as VideoClip['easing'] } })}
                        className="w-full px-2 py-1.5 text-xs bg-[#1c1c2a] border border-[#2a2a3d] rounded focus:border-violet-500 focus:outline-none text-slate-200 appearance-none cursor-pointer"
                      >
                        <option value="linear">Linear</option>
                        <option value="ease-in">Ease In</option>
                        <option value="ease-out">Ease Out</option>
                        <option value="ease-in-out">Ease In-Out</option>
                      </select>
                    </div>
                    <p className="text-[10px] text-slate-600">
                      Applied when transitioning into this clip from the previous one.
                    </p>
                  </div>
                )}

                {/* ── Text Overlay Tab ────────────────────── */}
                {propertiesTab === 'text' && (
                  <>
                    <button
                      onClick={addTextOverlay}
                      className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium rounded-lg bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Text Overlay
                    </button>

                    {selectedClip.textOverlays.length === 0 && (
                      <p className="text-xs text-slate-600 text-center py-4">No text overlays</p>
                    )}

                    {selectedClip.textOverlays.map(overlay => (
                      <div key={overlay.id} className="p-3 bg-[#1c1c2a] rounded-lg space-y-2.5 border border-[#2a2a3d]">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Overlay</span>
                          <button
                            onClick={() => removeTextOverlay(selectedClip.id, overlay.id)}
                            className="p-0.5 rounded hover:bg-red-600/20 text-red-400 transition-colors"
                            aria-label={`Delete overlay: ${overlay.text}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">Text</label>
                          <input
                            type="text"
                            value={overlay.text}
                            onChange={e => updateTextOverlay(selectedClip.id, overlay.id, { text: e.target.value })}
                            className="w-full px-2 py-1.5 text-xs bg-[#14141f] border border-[#2a2a3d] rounded focus:border-violet-500 focus:outline-none text-slate-200"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">Size</label>
                            <input
                              type="number"
                              min={8}
                              max={200}
                              value={overlay.fontSize}
                              onChange={e => updateTextOverlay(selectedClip.id, overlay.id, { fontSize: Number(e.target.value) })}
                              className="w-full px-2 py-1.5 text-xs bg-[#14141f] border border-[#2a2a3d] rounded focus:border-violet-500 focus:outline-none text-slate-200 tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">Color</label>
                            <input
                              type="color"
                              value={overlay.color}
                              onChange={e => updateTextOverlay(selectedClip.id, overlay.id, { color: e.target.value })}
                              className="w-full h-8 bg-transparent border border-[#2a2a3d] rounded cursor-pointer"
                              aria-label="Overlay text color"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">Position</label>
                          <select
                            value={overlay.position}
                            onChange={e => updateTextOverlay(selectedClip.id, overlay.id, { position: e.target.value as TextOverlay['position'] })}
                            className="w-full px-2 py-1.5 text-xs bg-[#14141f] border border-[#2a2a3d] rounded focus:border-violet-500 focus:outline-none text-slate-200 appearance-none cursor-pointer"
                          >
                            <option value="top">Top</option>
                            <option value="center">Center</option>
                            <option value="bottom">Bottom</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">Start (s)</label>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={overlay.startTime}
                              onChange={e => updateTextOverlay(selectedClip.id, overlay.id, { startTime: Number(e.target.value) })}
                              className="w-full px-2 py-1.5 text-xs bg-[#14141f] border border-[#2a2a3d] rounded focus:border-violet-500 focus:outline-none text-slate-200 tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">Duration (s)</label>
                            <input
                              type="number"
                              min={0.1}
                              step={0.1}
                              value={overlay.duration}
                              onChange={e => updateTextOverlay(selectedClip.id, overlay.id, { duration: Number(e.target.value) })}
                              className="w-full px-2 py-1.5 text-xs bg-[#14141f] border border-[#2a2a3d] rounded focus:border-violet-500 focus:outline-none text-slate-200 tabular-nums"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-[#1c1c2a] flex items-center justify-center mb-3">
                <Film className="w-6 h-6 text-slate-600" />
              </div>
              <p className="text-sm text-slate-500 font-medium">No clip selected</p>
              <p className="text-xs text-slate-600 mt-1">Select a clip in the timeline to edit its properties</p>
            </div>
          )}
        </aside>
      </div>

      {/* ══════════════════════════════════════════════════════
         MUSIC LIBRARY MODAL
         ══════════════════════════════════════════════════════ */}
      {showMusicModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowMusicModal(false) }}
          role="dialog"
          aria-modal="true"
          aria-label="Music Library"
        >
          <div className="w-[520px] max-h-[80vh] bg-[#14141f] border border-[#2a2a3d] rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#2a2a3d]">
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-semibold text-slate-200">Music Library</h2>
              </div>
              <button
                onClick={() => setShowMusicModal(false)}
                className="p-1 rounded hover:bg-[#1c1c2a] transition-colors"
                aria-label="Close music library"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Category tabs */}
            <div className="flex gap-1 px-5 py-2 border-b border-[#2a2a3d] overflow-x-auto">
              {MUSIC_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setMusicCategory(cat)}
                  className={`px-3 py-1 text-[11px] rounded-full font-medium whitespace-nowrap transition-colors ${
                    musicCategory === cat
                      ? 'bg-purple-600 text-white'
                      : 'bg-[#1c1c2a] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1" role="list" aria-label="Music tracks">
              {MUSIC_TRACKS.filter(t => t.category === musicCategory).map(track => (
                <div
                  key={track.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                    musicTrack?.id === track.id ? 'bg-purple-600/20 border border-purple-500/30' : 'hover:bg-[#1c1c2a]'
                  }`}
                  onClick={() => {
                    dispatch({ type: 'SET_MUSIC', track })
                    generateWaveformBars()
                    stopMusicPreview()
                    setShowMusicModal(false)
                  }}
                  role="listitem"
                >
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      previewMusicTrack(track)
                      setPreviewAudioId(playingAudioId === track.id ? null : track.id)
                    }}
                    className={`p-1.5 rounded-full transition-colors ${playingAudioId === track.id ? 'bg-purple-600/50 animate-pulse' : 'bg-[#2a2a3d] hover:bg-[#3d3d52]'}`}
                    aria-label={playingAudioId === track.id ? `Stop preview of ${track.name}` : `Preview ${track.name}`}
                  >
                    {playingAudioId === track.id ? (
                      <Square className="w-3 h-3 text-purple-300" />
                    ) : (
                      <Play className="w-3 h-3 text-purple-300" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{track.name}</p>
                    <p className="text-[10px] text-slate-500">{formatTime(track.duration)}</p>
                  </div>
                  {musicTrack?.id === track.id && (
                    <span className="text-[10px] text-purple-400 font-medium">Selected</span>
                  )}
                </div>
              ))}
            </div>

            {musicTrack && (
              <div className="px-5 py-3 border-t border-[#2a2a3d] flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Current: <span className="text-purple-300">{musicTrack.name}</span>
                </span>
                <button
                  onClick={() => dispatch({ type: 'SET_MUSIC', track: null })}
                  className="text-[11px] text-red-400 hover:text-red-300 transition-colors"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          {/* Hidden audio element for previews */}
          {previewAudioId && (
            <audio
              key={previewAudioId}
              autoPlay
              onEnded={() => setPreviewAudioId(null)}
              aria-hidden="true"
            >
              <source
                src={`${API_BASE}${MUSIC_TRACKS.find(t => t.id === previewAudioId)?.path ?? ''}`}
                type="audio/mpeg"
              />
            </audio>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
         EXPORT MODAL
         ══════════════════════════════════════════════════════ */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowExportModal(false) }}
          role="dialog"
          aria-modal="true"
          aria-label="Export Video"
        >
          <div className="w-[480px] bg-[#14141f] border border-[#2a2a3d] rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#2a2a3d]">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-violet-400" />
                <h2 className="text-sm font-semibold text-slate-200">Export Video</h2>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1 rounded hover:bg-[#1c1c2a] transition-colors"
                aria-label="Close export dialog"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label htmlFor="export-name" className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                  Output Name
                </label>
                <input
                  id="export-name"
                  type="text"
                  value={exportOutputName}
                  onChange={e => setExportOutputName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#1c1c2a] border border-[#2a2a3d] rounded-lg focus:border-violet-500 focus:outline-none text-slate-200"
                />
              </div>

              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">FFmpeg Command Preview</p>
                <pre className="p-3 bg-[#0c0c14] border border-[#2a2a3d] rounded-lg text-[10px] text-slate-400 overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap">
{`ffmpeg \\
${clips.map((c) => `  -i "${c.path}" \\`).join('\n')}
${musicTrack ? `  -i "${musicTrack.path}" \\\n` : ''}  -filter_complex "
${clips.map((c, i) => `    [${i}:v]trim=${c.trimStart}:${c.trimEnd},setpts=PTS-STARTPTS[v${i}];`).join('\n')}
    ${clips.map((_, i) => `[v${i}]`).join('')}concat=n=${clips.length}:v=1:a=0[outv]" \\
  -map "[outv]" \\
${musicTrack ? '  -map "[outa]" \\\n' : ''}  -aspect ${aspectRatio.replace(':', '/')} \\
  ${exportOutputName}.mp4`}
                </pre>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>{clips.length} clip{clips.length !== 1 ? 's' : ''}</span>
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                <span>{formatTime(totalDuration)}</span>
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                <span>{aspectRatio}</span>
                {musicTrack && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-slate-600" />
                    <span className="text-purple-400">{musicTrack.name}</span>
                  </>
                )}
              </div>

              {/* Branding Settings */}
              <div className="p-3 bg-[#1c1c2a] rounded-lg border border-[#2a2a3d] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">🎨 Panini Pano Branding (last 4s)</label>
                  <button
                    onClick={() => setBrandingEnabled(b => !b)}
                    className={`w-9 h-5 rounded-full transition-colors ${brandingEnabled ? 'bg-violet-600' : 'bg-slate-700'}`}
                  >
                    <div className={`w-3 h-3 rounded-full bg-white transition-transform mx-1 ${brandingEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
                {brandingEnabled && (
                  <select
                    value={brandingTheme}
                    onChange={e => setBrandingTheme(e.target.value as typeof brandingTheme)}
                    className="w-full px-2 py-1.5 text-xs bg-[#14141f] border border-[#2a2a3d] rounded focus:border-violet-500 focus:outline-none text-slate-200 appearance-none cursor-pointer"
                  >
                    <option value="QuietHours">🌙 The Quiet Hours</option>
                    <option value="GrabABite">🥪 Grab a Bite of Calm</option>
                    <option value="PermissionSlip">✅ Your Permission Slip</option>
                    <option value="ArtOfDoingLess">🎨 Art of Doing Less</option>
                    <option value="ItalyCalled">🇮🇹 Italy Called</option>
                  </select>
                )}
              </div>

              {exportStatus === 'exporting' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Exporting...</span>
                    <span>{exportProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#1c1c2a] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-600 to-purple-500 transition-all duration-300"
                      style={{ width: `${exportProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {exportStatus === 'done' && exportResult && (
                <div className="p-3 bg-emerald-900/20 border border-emerald-500/30 rounded-lg">
                  <p className="text-xs text-emerald-300 font-medium mb-1">Export complete ✅</p>
                  <a
                    href={exportResult.startsWith('http') ? exportResult : `${API_BASE}${exportResult}`}
                    className="text-xs text-emerald-400 underline hover:text-emerald-300 break-all"
                    download
                  >
                    {exportResult}
                  </a>
                </div>
              )}

              {exportStatus === 'error' && (
                <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                  <p className="text-xs text-red-300 font-medium">Export failed. Ensure the server is running.</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#2a2a3d]">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-xs text-slate-400 rounded-lg hover:bg-[#1c1c2a] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemotionExport}
                disabled={exportStatus === 'exporting'}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 transition-all"
              >
                🎬 Remotion (HD)
              </button>
              <button
                onClick={handleExport}
                disabled={exportStatus === 'exporting'}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-50 transition-all"
              >
                {exportStatus === 'exporting' ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Export (ffmpeg)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──── KEYBOARD SHORTCUTS MODAL ─────────────────────── */}
      {showShortcutsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowShortcutsModal(false)}
        >
          <div className="w-[400px] bg-[#14141f] border border-[#2a2a3d] rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#2a2a3d]">
              <h2 className="text-sm font-semibold text-slate-200">⌨️ Keyboard Shortcuts</h2>
              <button onClick={() => setShowShortcutsModal(false)} className="p-1 rounded hover:bg-[#1c1c2a]">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="p-5 space-y-1">
              {[
                ['Space', 'Play / Pause'],
                ['J', 'Jump back 2s'],
                ['K', 'Pause'],
                ['L', 'Play forward'],
                ['← / →', 'Step 1 frame (1/30s)'],
                ['I', 'Set trim-in at playhead'],
                ['O', 'Set trim-out at playhead'],
                ['Delete', 'Remove selected clip'],
                ['Ctrl+Z', 'Undo'],
                ['Ctrl+Y / Ctrl+Shift+Z', 'Redo'],
                ['?', 'Show this dialog'],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between py-1.5 border-b border-[#1c1c2a] last:border-0">
                  <span className="text-xs text-slate-400">{label}</span>
                  <kbd className="px-2 py-0.5 text-[11px] font-mono bg-[#1c1c2a] border border-[#2a2a3d] rounded text-slate-300">{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
