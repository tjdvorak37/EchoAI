import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bandage,
  BoxSelect,
  ChevronRight,
  Circle,
  Crop,
  Eraser,
  LassoSelect,
  Minus,
  MousePointer2,
  Move,
  Paintbrush,
  PaintBucket,
  PanelRightOpen,
  PenTool,
  SmilePlus,
  Square,
  Triangle,
  Type,
  Upload,
  ZoomIn,
  Images,
  Sparkles,
  Wand,
  Eye,
  EyeOff,
  Keyboard,
  SlidersHorizontal,
  Search,
  Home,
  LayoutTemplate,
  Presentation,
  Share2,
  Clapperboard,
  Printer,
  FileText,
  PanelsTopLeft,
  Globe2,
  Mail,
  MoreHorizontal,
  Plus,
  FolderOpen,
  Image as ImageIcon,
  X,
  GraduationCap,
  Check,
  ArrowLeft,
  Download,
  Save,
  RotateCcw,
  Palette,
  Expand,
  Layers3,
  Folder,
  MoreVertical,
} from 'lucide-react'
import { StockLibrary } from './StockLibrary'
import { PhotoHueSaturationDialog } from './PhotoHueSaturationDialog'
import { PhotoShortcutsOverlay } from './PhotoShortcutsOverlay'
import { DesignSchool } from './DesignSchool'
import { EditorFocusToggle } from './EditorFocusMode'
import { useEditorFocusMode } from './useEditorFocusMode'
import { downloadMediaLibraryDataUrl } from '../services/mediaLibraryService'
import { createPhotoProject, parsePhotoProject } from '../services/photoProject'
import { PHOTO_EDITOR_TEMPLATES, PHOTO_TEMPLATE_PLATFORMS } from '../data/templateCatalog'
import {
  combineMasks,
  defaultHueSat,
  featherMask,
  invertMask,
  isNeutralHueSat,
  magicWandMask,
  maskCoverage,
  paintBucket,
  polygonMask,
  rectMask,
  selectSubjectMask,
  sharpen,
} from '../services/photoPixelOps'
import {
  canvasToObjectUrl,
  cloneImageData,
  dataUrlToMask,
  fitContain,
  imageDataToDataUrl,
  loadWorkImage,
  maskToDataUrl,
  renderProcessedBase,
  selectionOverlayUrls,
  transformImageSrc,
} from '../services/photoCanvasOps'
import './PhotoEditor.css'

const ASPECT_RATIOS = {
  '1:1': { label: 'Square', canvasWidth: 1200, canvasHeight: 1200, css: '1 / 1' },
  '4:5': { label: 'Feed', canvasWidth: 1200, canvasHeight: 1500, css: '4 / 5' },
  '16:9': { label: 'Landscape', canvasWidth: 1600, canvasHeight: 900, css: '16 / 9' },
  '9:16': { label: 'Story', canvasWidth: 1080, canvasHeight: 1920, css: '9 / 16' },
}

const normalizeCanvasSize = (value) => {
  const width = Math.round(Number(value?.width))
  const height = Math.round(Number(value?.height))
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 40 || height < 40) return null
  return { width: Math.min(width, 8192), height: Math.min(height, 8192), label: value?.label || 'Custom' }
}

const readPhotoAutosave = () => {
  try {
    const value = localStorage.getItem('echoai-photo-autosave')
    return value ? parsePhotoProject(value) : null
  } catch {
    return null
  }
}

const readPhotoWorkspaceView = () => {
  try {
    const value = localStorage.getItem('echoai-photo-workspace-view')
    return ['home', 'editor', 'projects', 'school'].includes(value) ? value : 'home'
  } catch {
    return 'home'
  }
}

const newProjectId = () => `design_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`

const DATE_FILTER_DAYS = { today: 1, '7': 7, '30': 30, '90': 90 }
const withinDateFilter = (isoDate, filter) => {
  if (filter === 'any' || !isoDate) return true
  const days = DATE_FILTER_DAYS[filter]
  if (!days) return true
  return Date.now() - new Date(isoDate).getTime() <= days * 24 * 60 * 60 * 1000
}

const PHOTO_HOME_FORMATS = [
  { key: 'presentation', label: 'Presentation', icon: Presentation, width: 1920, height: 1080, color: '#ff5a12' },
  { key: 'social', label: 'Social media', icon: Share2, width: 1080, height: 1080, color: '#ff3f5f' },
  { key: 'video', label: 'Video cover', icon: Clapperboard, width: 1920, height: 1080, color: '#dc3fe2' },
  { key: 'print', label: 'Print', icon: Printer, width: 1275, height: 1650, color: '#8b24ee' },
  { key: 'document', label: 'Document', icon: FileText, width: 2550, height: 3300, color: '#10a7b5' },
  { key: 'whiteboard', label: 'Whiteboard', icon: PanelsTopLeft, width: 1920, height: 1080, color: '#08a64e' },
  { key: 'website', label: 'Website', icon: Globe2, width: 1440, height: 900, color: '#4857ef' },
  { key: 'email', label: 'Email', icon: Mail, width: 600, height: 900, color: '#5539ed' },
]

const PHOTO_DESIGN_PRESETS = [
  { key: 'presentation', category: 'Presentations', label: 'Presentation (16:9)', icon: Presentation, width: 1920, height: 1080, color: '#ff5a12' },
  { key: 'presentation-standard', category: 'Presentations', label: 'Presentation (4:3)', icon: Presentation, width: 1600, height: 1200, color: '#f97316' },
  { key: 'instagram-post', category: 'Social media', platform: 'Instagram', label: 'Instagram Post (4:5)', icon: Share2, width: 1080, height: 1350, color: '#ff3f5f' },
  { key: 'instagram-story', category: 'Social media', platform: 'Instagram', label: 'Instagram Story', icon: Share2, width: 1080, height: 1920, color: '#ec4899' },
  { key: 'facebook-landscape', category: 'Social media', platform: 'Facebook', label: 'Facebook Post (Landscape)', icon: Share2, width: 1200, height: 630, color: '#2563eb' },
  { key: 'linkedin-post', category: 'Social media', platform: 'LinkedIn', label: 'LinkedIn Post', icon: Share2, width: 1200, height: 1200, color: '#0284c7' },
  { key: 'youtube-thumbnail', category: 'Social media', platform: 'YouTube', label: 'YouTube Thumbnail', icon: Clapperboard, width: 1280, height: 720, color: '#dc2626' },
  { key: 'instagram-reel', category: 'Social media', platform: 'Instagram', label: 'Instagram Reel', icon: Clapperboard, width: 1080, height: 1920, color: '#c13584' },
  { key: 'facebook-story', category: 'Social media', platform: 'Facebook', label: 'Facebook Story', icon: Share2, width: 1080, height: 1920, color: '#1877f2' },
  { key: 'facebook-cover', category: 'Social media', platform: 'Facebook', label: 'Facebook Cover', icon: Share2, width: 1640, height: 856, color: '#1769d2' },
  { key: 'linkedin-video', category: 'Social media', platform: 'LinkedIn', label: 'LinkedIn Video', icon: Clapperboard, width: 1920, height: 1080, color: '#0a66c2' },
  { key: 'x-post', category: 'Social media', platform: 'X', label: 'X Post', icon: Share2, width: 1600, height: 900, color: '#202124' },
  { key: 'x-header', category: 'Social media', platform: 'X', label: 'X Header', icon: Share2, width: 1500, height: 500, color: '#111827' },
  { key: 'pinterest-pin', category: 'Social media', platform: 'Pinterest', label: 'Pinterest Pin', icon: Share2, width: 1000, height: 1500, color: '#bd081c' },
  { key: 'whatsapp-status', category: 'Social media', platform: 'WhatsApp', label: 'WhatsApp Status', icon: Share2, width: 1080, height: 1920, color: '#16a34a', status: 'Planning only' },
  { key: 'tiktok-video', category: 'Social media', platform: 'TikTok', label: 'TikTok Video', icon: Clapperboard, width: 1080, height: 1920, color: '#111827', status: 'Planning only' },
  { key: 'twitch-banner', category: 'Social media', platform: 'Twitch', label: 'Twitch Banner', icon: Share2, width: 1200, height: 480, color: '#6f42c1', status: 'Planned integration' },
  { key: 'google-business-post', category: 'Social media', platform: 'Google Business Profile', label: 'Google Business Post', icon: Share2, width: 1200, height: 900, color: '#1769d2', status: 'Planned integration' },
  { key: 'youtube-channel-banner', category: 'Social media', platform: 'YouTube', label: 'YouTube Channel Banner', icon: Share2, width: 2560, height: 1440, color: '#b91c1c' },
  { key: 'youtube-shorts', category: 'Social media', platform: 'YouTube', label: 'YouTube Short', icon: Clapperboard, width: 1080, height: 1920, color: '#ef4444' },
  { key: 'photo-portrait', category: 'Photo editor', label: 'Portrait photo', icon: ImageIcon, width: 1200, height: 1500, color: '#ec4899' },
  { key: 'photo-square', category: 'Photo editor', label: 'Square photo', icon: ImageIcon, width: 1200, height: 1200, color: '#8b5cf6' },
  { key: 'photo-landscape', category: 'Photo editor', label: 'Landscape photo', icon: ImageIcon, width: 1600, height: 900, color: '#0ea5e9' },
  { key: 'video-landscape', category: 'Videos', label: 'Landscape Video Cover', icon: Clapperboard, width: 1920, height: 1080, color: '#d946ef' },
  { key: 'video-mobile', category: 'Videos', label: 'Mobile Video Cover', icon: Clapperboard, width: 1080, height: 1920, color: '#a855f7' },
  { key: 'video-square', category: 'Videos', label: 'Square Video Cover', icon: Clapperboard, width: 1080, height: 1080, color: '#7c3aed' },
  { key: 'flyer', category: 'Print', label: 'Flyer (Portrait US)', icon: Printer, width: 1275, height: 1650, color: '#8b24ee' },
  { key: 'invitation', category: 'Print', label: 'Invitation (Portrait)', icon: Printer, width: 1500, height: 2100, color: '#9333ea' },
  { key: 'poster', category: 'Print', label: 'Poster (Portrait 3:4)', icon: Printer, width: 1800, height: 2400, color: '#7e22ce' },
  { key: 'business-card', category: 'Print', label: 'Business Card', icon: Printer, width: 1050, height: 600, color: '#581c87' },
  { key: 'doc-letter', category: 'Docs', label: 'Document (Letter)', icon: FileText, width: 2550, height: 3300, color: '#10a7b5' },
  { key: 'doc-a4', category: 'Docs', label: 'Document (A4)', icon: FileText, width: 2480, height: 3508, color: '#0891b2' },
  { key: 'whiteboard', category: 'Whiteboards', label: 'Whiteboard', icon: PanelsTopLeft, width: 1920, height: 1080, color: '#08a64e' },
  { key: 'website', category: 'Websites', label: 'Website Canvas', icon: Globe2, width: 1440, height: 900, color: '#4857ef' },
  { key: 'email', category: 'Emails', label: 'Email Design', icon: Mail, width: 600, height: 900, color: '#5539ed' },
]

const PHOTO_CREATE_CATEGORIES = ['For you', 'Presentations', 'Social media', 'Photo editor', 'Videos', 'Print', 'Docs', 'Whiteboards', 'Websites', 'Emails']
const PHOTO_SOCIAL_PLATFORMS = [
  { key: 'all', label: 'Popular', color: '#7c3aed' },
  { key: 'Facebook', label: 'Facebook', color: '#2563eb' },
  { key: 'Instagram', label: 'Instagram', color: '#e1306c' },
  { key: 'LinkedIn', label: 'LinkedIn', color: '#0a66c2' },
  { key: 'Pinterest', label: 'Pinterest', color: '#bd081c' },
  { key: 'TikTok', label: 'TikTok', color: '#111827' },
  { key: 'X', label: 'X', color: '#111827' },
  { key: 'WhatsApp', label: 'WhatsApp', color: '#16a34a' },
  { key: 'YouTube', label: 'YouTube', color: '#dc2626' },
  { key: 'Twitch', label: 'Twitch', color: '#6f42c1' },
  { key: 'Google Business Profile', label: 'Google Business', color: '#1769d2' },
]

const LOGO_EDITOR_TEMPLATES = PHOTO_EDITOR_TEMPLATES.filter((template) => template.category === 'Logos')
const LOGO_INDUSTRIES = ['All', ...new Set(LOGO_EDITOR_TEMPLATES.map((template) => template.industry))]
const LOGO_KEYWORDS = ['Circle', 'Leaf', 'Modern', 'House', 'Fire', 'Shield', 'Heart', 'Camera', 'Music', 'Letter', 'Nature', 'Community']
const PHOTO_TEMPLATE_CATEGORIES = ['All', ...new Set(PHOTO_EDITOR_TEMPLATES.filter((template) => template.category !== 'Logos').map((template) => template.category))]

const STYLE_PRESETS = {
  aurora: {
    label: 'Aurora',
    background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.38), rgba(168, 85, 247, 0.28) 52%, rgba(250, 204, 21, 0.16))',
    base: '#081120',
    accent: '#67e8f9',
    secondary: '#f9a8d4',
    headline: 'Neon glow for social-first campaigns',
    subcopy: 'Use this preset for launches, music drops, and anything that needs a luminous punch.',
  },
  editorial: {
    label: 'Editorial',
    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.42), rgba(71, 85, 105, 0.3) 55%, rgba(148, 163, 184, 0.14))',
    base: '#0f172a',
    accent: '#f8fafc',
    secondary: '#cbd5e1',
    headline: 'High-contrast story cover',
    subcopy: 'Best for portraits, product teasers, and clean launch art that feels premium.',
  },
  sunset: {
    label: 'Sunset',
    background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.35), rgba(236, 72, 153, 0.28) 50%, rgba(59, 130, 246, 0.18))',
    base: '#1f130f',
    accent: '#fde68a',
    secondary: '#fecdd3',
    headline: 'Warm, cinematic, and scroll-stopping',
    subcopy: 'Use for lifestyle, travel, food, and anything that benefits from a softer tone.',
  },
  chrome: {
    label: 'Chrome',
    background: 'linear-gradient(135deg, rgba(226, 232, 240, 0.28), rgba(148, 163, 184, 0.18) 45%, rgba(15, 23, 42, 0.18))',
    base: '#0b1220',
    accent: '#f8fafc',
    secondary: '#94a3b8',
    headline: 'Sharp, cool, and metallic',
    subcopy: 'A strong fit for tech, architecture, fashion, and polished brand moments.',
  },
}

const STICKERS = ['✨', '⚡', '📸', '🔥', '💎', '🌙', '🪩']
const TEXT_EFFECTS = {
  none: 'None',
  shadow: 'Shadow',
  outline: 'Outline',
  panel: 'Panel',
  glow: 'Glow',
  gradient: 'Gradient',
}

const MASK_SHAPES = {
  none: 'None',
  rounded: 'Rounded',
  circle: 'Circle',
  frame: 'Frame',
  diagonal: 'Diagonal',
}

const TOOLS = {
  select: 'Move / select',
  move: 'Move',
  heal: 'Healing brush',
  brush: 'Brush',
  eraser: 'Eraser',
  fill: 'Paint bucket',
  remove: 'Remove area',
  crop: 'Crop',
  'rect-select': 'Rectangular marquee',
  lasso: 'Lasso',
  polygon: 'Polygonal lasso',
  'object-select': 'Object selection',
  'magic-wand': 'Magic wand',
}

const SELECTION_TOOLS = new Set(['rect-select', 'lasso', 'polygon', 'object-select', 'magic-wand'])

const SELECTION_MODES = [
  ['new', 'New'],
  ['add', 'Add'],
  ['subtract', 'Subtract'],
  ['intersect', 'Intersect'],
]

const BLEND_MODES = {
  'source-over': 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
  darken: 'Darken',
  lighten: 'Lighten',
  'color-dodge': 'Color dodge',
  'color-burn': 'Color burn',
  'hard-light': 'Hard light',
  'soft-light': 'Soft light',
  difference: 'Difference',
  exclusion: 'Exclusion',
  hue: 'Hue',
  saturation: 'Saturation',
  color: 'Color',
  luminosity: 'Luminosity',
}

const cssBlend = (mode) => (!mode || mode === 'source-over' ? 'normal' : mode)

const KRITA_TOOL_GROUPS = [
  {
    heading: 'Navigation',
    tools: [
      { key: 'select', label: 'Move / select', shortcut: 'V', icon: MousePointer2 },
      { key: 'crop', label: 'Crop', shortcut: 'C', icon: Crop },
      { key: 'move', label: 'Move', icon: Move },
      { key: 'zoom', label: 'Zoom in', shortcut: 'Ctrl +', icon: ZoomIn },
    ],
  },
  {
    heading: 'Painting',
    tools: [
      { key: 'brush', label: 'Brush', shortcut: 'B', icon: Paintbrush },
      { key: 'eraser', label: 'Eraser', shortcut: 'E', icon: Eraser },
      { key: 'heal', label: 'Healing brush', shortcut: 'J', icon: Bandage },
      { key: 'fill', label: 'Paint bucket', shortcut: 'G', icon: PaintBucket },
    ],
  },
  {
    heading: 'Shapes',
    tools: [
      { key: 'line', label: 'Line', icon: Minus },
      { key: 'rectangle', label: 'Rectangle', shortcut: 'U', icon: Square },
      { key: 'ellipse', label: 'Ellipse', icon: Circle },
      { key: 'triangle', label: 'Triangle', icon: Triangle },
    ],
  },
  {
    heading: 'Selection',
    tools: [
      { key: 'object-select', label: 'Object selection', shortcut: 'W', icon: Sparkles },
      { key: 'magic-wand', label: 'Magic wand', shortcut: 'Shift+W', icon: Wand },
      { key: 'rect-select', label: 'Rectangular marquee', shortcut: 'M', icon: BoxSelect },
      { key: 'lasso', label: 'Lasso', shortcut: 'L', icon: LassoSelect },
      { key: 'polygon', label: 'Polygonal lasso', shortcut: 'Shift+L', icon: PenTool },
    ],
  },
]

const SHAPES = {
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  triangle: 'Triangle',
}

const EXPORT_FORMATS = {
  png: { label: 'PNG', mime: 'image/png', extension: 'png', lossy: false },
  jpeg: { label: 'JPEG', mime: 'image/jpeg', extension: 'jpg', lossy: true },
  webp: { label: 'WebP', mime: 'image/webp', extension: 'webp', lossy: true },
}

const PHOTO_FILTER_PRESETS = [
  { key: 'natural', label: 'Natural', patch: {} },
  { key: 'luna', label: 'Luna', patch: { brightness: 108, contrast: 108, saturation: 88, hue: 8 } },
  { key: 'aero', label: 'Aero', patch: { brightness: 112, contrast: 96, saturation: 105, hue: -6 } },
  { key: 'myst', label: 'Myst', patch: { brightness: 94, contrast: 118, saturation: 78, hue: 18 } },
  { key: 'bali', label: 'Bali', patch: { brightness: 108, contrast: 106, saturation: 118, sepia: 18 } },
  { key: 'capri', label: 'Capri', patch: { brightness: 105, contrast: 116, saturation: 132, sepia: 10 } },
  { key: 'latte', label: 'Latte', patch: { brightness: 112, contrast: 92, saturation: 82, sepia: 34 } },
  { key: 'bronze', label: 'Bronze', patch: { brightness: 92, contrast: 124, saturation: 105, sepia: 48 } },
  { key: 'sandi', label: 'Sandi', patch: { brightness: 108, contrast: 102, saturation: 118, hue: -12, sepia: 20 } },
  { key: 'sangri', label: 'Sangri', patch: { brightness: 96, contrast: 116, saturation: 138, hue: -18, sepia: 16 } },
  { key: 'polar', label: 'Polar', patch: { brightness: 108, contrast: 110, saturation: 76, hue: 14 } },
  { key: 'slate', label: 'Slate', patch: { brightness: 90, contrast: 126, saturation: 58, hue: 8 } },
  { key: 'mono', label: 'Mono', patch: { grayscale: 100, contrast: 112 } },
]

const PHOTO_SHADOW_PRESETS = [
  { key: 'none', label: 'None', patch: { shadowX: 0, shadowY: 0, shadowBlur: 0, shadowColor: '#000000' } },
  { key: 'glow', label: 'Glow', patch: { shadowX: 0, shadowY: 0, shadowBlur: 18, shadowColor: '#a855f7' } },
  { key: 'drop', label: 'Drop', patch: { shadowX: 10, shadowY: 12, shadowBlur: 12, shadowColor: '#334155' } },
  { key: 'soft', label: 'Soft', patch: { shadowX: 0, shadowY: 14, shadowBlur: 24, shadowColor: '#64748b' } },
  { key: 'outline', label: 'Lift', patch: { shadowX: 0, shadowY: 5, shadowBlur: 4, shadowColor: '#7c3aed' } },
]

const DEFAULT_FILTERS = {
  brightness: 108,
  contrast: 116,
  saturation: 118,
  exposure: 100,
  blur: 0,
  hue: 0,
  sepia: 0,
  grayscale: 0,
  invert: 0,
  vignette: 38,
  grain: 18,
  shadowX: 0,
  shadowY: 0,
  shadowBlur: 0,
  shadowColor: '#000000',
}

const NEUTRAL_FILTERS = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  exposure: 100,
  blur: 0,
  hue: 0,
  sepia: 0,
  grayscale: 0,
  invert: 0,
  vignette: 0,
  grain: 0,
  shadowX: 0,
  shadowY: 0,
  shadowBlur: 0,
  shadowColor: '#000000',
}

// Preview and export must agree, so both read this one string.
const buildFilterString = (filters) =>
  [
    `brightness(${filters.brightness}%)`,
    `brightness(${filters.exposure ?? 100}%)`,
    `contrast(${filters.contrast}%)`,
    `saturate(${filters.saturation}%)`,
    `hue-rotate(${filters.hue}deg)`,
    `sepia(${filters.sepia ?? 0}%)`,
    `grayscale(${filters.grayscale ?? 0}%)`,
    `invert(${filters.invert ?? 0}%)`,
    `blur(${filters.blur}px)`,
    filters.shadowBlur > 0 ? `drop-shadow(${filters.shadowX}px ${filters.shadowY}px ${filters.shadowBlur}px ${filters.shadowColor})` : '',
  ].filter(Boolean).join(' ')

const DEFAULT_PROMPT = 'Create a bold product teaser for an evening launch post.'

const BASE_IMAGE_LAYER_ID = 'base-image'

const createBaseImageLayer = (src, label = 'Original photo') => ({
  id: BASE_IMAGE_LAYER_ID,
  type: 'image',
  label,
  src,
  value: label,
  x: 50,
  y: 50,
  width: 100,
  opacity: 100,
  rotation: 0,
  blendMode: 'source-over',
  isBaseImage: true,
})

const ensureBaseImageLayer = (layers, src, label = 'Original photo') => {
  const withoutBase = (layers || []).filter((layer) => !layer.isBaseImage && layer.id !== BASE_IMAGE_LAYER_ID)
  return src ? [createBaseImageLayer(src, label), ...withoutBase] : withoutBase
}

const defaultLayers = () => [
  {
    id: 'headline',
    type: 'text',
    label: 'Headline',
    value: 'Launch the next drop',
    x: 16,
    y: 15,
    fontSize: 56,
    weight: 800,
    color: '#f8fafc',
    align: 'left',
    effect: 'shadow',
    outlineWidth: 2,
    outlineColor: '#020617',
    shadowBlur: 24,
    shadowColor: 'rgba(2, 6, 23, 0.72)',
    shadowOffsetX: 0,
    shadowOffsetY: 8,
    panelColor: 'rgba(2, 6, 23, 0.15)',
    panelRadius: 22,
    letterSpacing: 0.5,
  },
  {
    id: 'subcopy',
    type: 'text',
    label: 'Subcopy',
    value: 'Edit, stylize, and export campaign art without leaving EchoAI.',
    x: 16,
    y: 28,
    fontSize: 22,
    weight: 500,
    color: '#e2e8f0',
    align: 'left',
    effect: 'panel',
    outlineWidth: 0,
    outlineColor: '#020617',
    shadowBlur: 12,
    shadowColor: 'rgba(2, 6, 23, 0.55)',
    shadowOffsetX: 0,
    shadowOffsetY: 6,
    panelColor: 'rgba(15, 23, 42, 0.42)',
    panelRadius: 18,
    letterSpacing: 0.1,
  },
  {
    id: 'sticker',
    type: 'sticker',
    label: 'Accent',
    value: '✨',
    x: 78,
    y: 14,
    fontSize: 52,
    weight: 700,
    color: '#67e8f9',
    align: 'center',
    effect: 'glow',
    outlineWidth: 0,
    outlineColor: '#020617',
    shadowBlur: 26,
    shadowColor: 'rgba(103, 232, 249, 0.65)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    panelColor: 'transparent',
    panelRadius: 999,
    letterSpacing: 0,
  },
]

const projectLayers = (project) => defaultLayers().map((layer) => {
  if (!project) return layer
  if (layer.id === 'headline') return { ...layer, value: project.headline || layer.value }
  if (layer.id === 'subcopy') return { ...layer, value: project.caption || layer.value }
  return layer
})

const photoTemplateLayers = (template) => {
  const [headline, subcopy, sticker] = defaultLayers()
  const [background, accent, foreground] = template.colors
  const layout = template.layout
  const landscape = template.width > template.height
  const headingSize = Math.round(Math.min(template.width * (landscape ? .055 : .068), template.height * .095, 96))
  const detailSize = Math.round(Math.min(template.width * .026, template.height * .037, 34))
  const positions = {
    editorial: { title: [9, 38], detail: [9, 68], badge: [83, 15], accent: [78, 57] },
    badge: { title: [50, 49], detail: [50, 69], badge: [50, 23], accent: [50, 49] },
    split: { title: [9, 48], detail: [9, 74], badge: [78, 25], accent: [76, 50] },
    frame: { title: [12, 46], detail: [12, 69], badge: [82, 17], accent: [50, 50] },
    diagonal: { title: [11, 62], detail: [11, 82], badge: [77, 19], accent: [65, 32] },
    minimal: { title: [10, 48], detail: [10, 70], badge: [80, 18], accent: [50, 83] },
  }
  const { title, detail, badge, accent: accentPosition } = positions[layout]
  const shape = (id, shapeType, x, y, width, height, color, rotation = 0, filled = true, strokeWidth = 0) => ({
    id, type: 'shape', label: 'Graphic accent', shape: shapeType === 'circle' ? 'ellipse' : shapeType, value: 'Graphic accent', x, y, width, height,
    color, strokeColor: color, strokeWidth, radius: shapeType === 'rectangle' ? 12 : 0, filled, opacity: 100, rotation,
  })
  if (template.mark) {
    const ring = (id, x, y, width, height, color, rotation = 0) => shape(id, 'ellipse', x, y, width, height, color, rotation, false, 12)
    const marks = {
      orbit: [ring('outer', 50, 34, 30, 30, accent), ring('inner', 50, 34, 16, 16, foreground), shape('satellite', 'ellipse', 64, 21, 7, 7, accent)],
      bloom: [0, 90, 180, 270].map((angle) => shape(`petal-${angle}`, 'ellipse', 50 + Math.sin(angle * Math.PI / 180) * 10, 34 - Math.cos(angle * Math.PI / 180) * 10, 12, 20, accent, angle)),
      arch: [shape('column-left', 'rectangle', 39, 40, 6, 28, accent), shape('column-right', 'rectangle', 61, 40, 6, 28, accent), shape('roof', 'triangle', 50, 22, 34, 16, foreground)],
      flame: [shape('flame-outer', 'triangle', 50, 32, 28, 34, accent), shape('flame-inner', 'ellipse', 50, 42, 12, 14, background)],
      crest: [shape('shield', 'triangle', 50, 39, 36, 33, accent, 180), shape('crest-center', 'rectangle', 50, 35, 10, 18, background, 45)],
      pulse: [ring('pulse-ring', 50, 34, 33, 33, accent), shape('pulse-cross-horizontal', 'rectangle', 50, 34, 21, 5, foreground), shape('pulse-cross-vertical', 'rectangle', 50, 34, 5, 21, foreground)],
      sunrise: [shape('horizon', 'line', 50, 44, 40, 2, foreground), shape('sun', 'ellipse', 50, 34, 24, 24, accent), shape('horizon-front', 'rectangle', 50, 47, 42, 6, background)],
      frame: [shape('outer-frame', 'rectangle', 50, 34, 34, 34, accent, 0, false, 12), ring('lens', 50, 34, 17, 17, foreground), shape('flash', 'ellipse', 62, 22, 4, 4, foreground)],
      note: [ring('record', 50, 34, 34, 34, accent), shape('record-label', 'ellipse', 50, 34, 15, 15, background), shape('record-center', 'ellipse', 50, 34, 5, 5, foreground)],
      sprout: [shape('stem', 'line', 50, 42, 3, 29, foreground, 90), shape('leaf-left', 'ellipse', 40, 29, 14, 24, accent, -45), shape('leaf-right', 'ellipse', 60, 29, 14, 24, accent, 45)],
      column: [shape('cap-top', 'rectangle', 50, 21, 34, 5, accent), shape('column', 'rectangle', 50, 34, 12, 25, foreground), shape('cap-bottom', 'rectangle', 50, 48, 34, 5, accent)],
      link: [ring('link-left', 43, 34, 23, 20, accent, -25), ring('link-right', 57, 34, 23, 20, foreground, -25)],
    }
    return [
      ...marks[template.mark],
      { ...headline, value: template.headline, x: 50, y: 69, fontSize: 88, weight: 800, align: 'center', color: foreground, effect: 'none', outlineWidth: 0, shadowBlur: 0, panelColor: 'transparent' },
      { ...subcopy, value: template.subcopy, x: 50, y: 79, fontSize: 30, weight: 600, align: 'center', color: foreground, effect: 'none', outlineWidth: 0, shadowBlur: 0, panelColor: 'transparent', letterSpacing: 3 },
    ]
  }
  const decorations = {
    editorial: [shape('template-block', 'rectangle', 79, 57, 42, 70, accent, -12), shape('template-rule', 'line', 29, 24, 40, 1, foreground)],
    badge: [shape('template-ring', 'ellipse', 50, 49, 74, 62, accent, 0, false, Math.max(4, Math.round(template.width * .008))), shape('template-bar', 'rectangle', 50, 89, 66, 3, accent)],
    split: [shape('template-panel', 'rectangle', 76, 50, 48, 100, accent), shape('template-disc', 'ellipse', 75, 49, 32, 32, background)],
    frame: [shape('template-frame', 'rectangle', 50, 50, 87, 85, accent, 0, false, Math.max(4, Math.round(template.width * .008))), shape('template-corner', 'ellipse', 84, 18, 18, 18, accent)],
    diagonal: [shape('template-sash', 'rectangle', 65, 32, 115, 22, accent, -24), shape('template-dot', 'ellipse', 82, 68, 12, 12, foreground)],
    minimal: [shape('template-rule', 'line', 50, 83, 78, 1, accent), shape('template-seal', 'ellipse', 84, 18, 13, 13, accent)],
  }
  return [
    ...decorations[layout],
    shape('template-accent', template.accentShape, ...accentPosition, layout === 'badge' ? 20 : 12, layout === 'badge' ? 20 : 12, accent),
    { ...headline, value: template.headline, x: title[0], y: title[1], fontSize: headingSize, align: layout === 'badge' ? 'center' : 'left', color: foreground, effect: 'shadow', outlineWidth: 0, shadowColor: background, shadowBlur: 4 },
    { ...subcopy, value: template.subcopy, x: detail[0], y: detail[1], fontSize: detailSize, align: layout === 'badge' ? 'center' : 'left', color: foreground, effect: 'shadow', panelColor: 'transparent', shadowBlur: 2 },
    { ...sticker, value: template.sticker, x: badge[0], y: badge[1], fontSize: Math.round(headingSize * .85), color: foreground, shadowBlur: 0 },
  ]
}

const PhotoTemplatePreview = ({ template }) => (
  <span className="photo-template-preview" style={{ '--template-base': template.colors[0] }}>
    <span className="photo-template-art" style={{ '--template-ratio': template.width / template.height, background: template.colors[0] }}>
      {photoTemplateLayers(template).map((layer) => (
        <span key={layer.id} className={`photo-template-art-layer ${layer.type}`} style={{
          left: `${layer.x}%`, top: `${layer.y}%`,
          transform: `translate(${layer.type === 'text' && layer.align !== 'center' ? '0' : '-50%'}, -50%) rotate(${layer.rotation || 0}deg)`,
          ...(layer.type === 'shape' ? {
            width: `${layer.width}%`, height: `${layer.height}%`,
            background: layer.filled === false || layer.shape === 'line' ? 'transparent' : layer.color,
            border: layer.filled === false ? `max(1px, .6cqw) solid ${layer.color}` : 'none',
            borderBottom: layer.shape === 'line' ? `max(1px, .6cqw) solid ${layer.color}` : undefined,
            borderRadius: layer.shape === 'ellipse' ? '50%' : layer.radius ? '5%' : 0,
            clipPath: layer.shape === 'triangle' ? 'polygon(50% 0, 100% 100%, 0 100%)' : undefined,
          } : {
            color: layer.color,
            fontSize: `${(layer.fontSize / template.width) * 100}cqw`,
            fontWeight: layer.weight,
            textAlign: layer.align,
            maxWidth: layer.type === 'text' ? '48%' : undefined,
          }),
        }}>
          {layer.type === 'shape' ? null : layer.value}
        </span>
      ))}
    </span>
  </span>
)

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'echoai-photo'

const wrapText = (ctx, text, maxWidth) => {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']

  const lines = []
  let current = words[0]

  for (const word of words.slice(1)) {
    const next = `${current} ${word}`
    if (ctx.measureText(next).width <= maxWidth) {
      current = next
    } else {
      lines.push(current)
      current = word
    }
  }

  lines.push(current)
  return lines
}

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load the selected image.'))
    image.src = src
  })

const normalizeColorInputValue = (value, fallback = '#020617') => {
  if (!value || typeof value !== 'string') {
    return fallback
  }

  if (value.startsWith('#')) {
    return value.slice(0, 7)
  }

  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) {
    return fallback
  }

  const [, red, green, blue] = match
  return `#${[red, green, blue]
    .map((channel) => Number(channel).toString(16).padStart(2, '0'))
    .join('')}`
}

const drawStroke = (ctx, stroke, width, height) => {
  if (!stroke?.points?.length) return

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // The eraser clears previously painted pixels rather than painting over them.
  ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'
  ctx.strokeStyle = stroke.color
  ctx.lineWidth = stroke.size
  ctx.globalAlpha = stroke.opacity
  ctx.beginPath()

  stroke.points.forEach((point, index) => {
    const mapped = {
      x: (point.x / 100) * width,
      y: (point.y / 100) * height,
    }
    if (index === 0) {
      ctx.moveTo(mapped.x, mapped.y)
    } else {
      ctx.lineTo(mapped.x, mapped.y)
    }
  })

  ctx.stroke()
  ctx.restore()
}

// Strokes composite on their own surface first, so an eraser stroke only removes
// paint instead of cutting a hole through the photo underneath.
const renderStrokeLayer = (strokes, width, height) => {
  const layerCanvas = document.createElement('canvas')
  layerCanvas.width = width
  layerCanvas.height = height
  const layerCtx = layerCanvas.getContext('2d')
  if (!layerCtx) return null

  strokes.forEach((stroke) => drawStroke(layerCtx, stroke, width, height))
  return layerCanvas
}

const healImage = async ({ imageSrc, points, brushSize, stageMetrics }) => {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image healing is unavailable in this browser.')

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const softened = document.createElement('canvas')
  softened.width = canvas.width
  softened.height = canvas.height
  const softenedCtx = softened.getContext('2d')
  if (!softenedCtx) throw new Error('Image healing is unavailable in this browser.')

  const imageRatio = canvas.width / canvas.height
  const stageRatio = stageMetrics.width / stageMetrics.height
  let drawWidth = stageMetrics.width
  let drawHeight = stageMetrics.height
  let offsetX = 0
  let offsetY = 0
  if (imageRatio > stageRatio) {
    drawWidth = imageRatio * drawHeight
    offsetX = (stageMetrics.width - drawWidth) / 2
  } else {
    drawHeight = drawWidth / imageRatio
    offsetY = (stageMetrics.height - drawHeight) / 2
  }

  const sourceScale = canvas.width / drawWidth
  const radius = Math.max(4, brushSize * sourceScale * 0.5)
  softenedCtx.filter = `blur(${Math.max(3, radius * 0.42)}px)`
  softenedCtx.drawImage(canvas, 0, 0)

  ctx.save()
  ctx.beginPath()
  points.forEach((point) => {
    const stageX = (point.x / 100) * stageMetrics.width
    const stageY = (point.y / 100) * stageMetrics.height
    const imageX = ((stageX - offsetX) / drawWidth) * canvas.width
    const imageY = ((stageY - offsetY) / drawHeight) * canvas.height
    ctx.moveTo(imageX + radius, imageY)
    ctx.arc(imageX, imageY, radius, 0, Math.PI * 2)
  })
  ctx.clip()
  ctx.drawImage(softened, 0, 0)
  ctx.restore()

  return canvas.toDataURL('image/png')
}

const removeImageArea = async ({ imageSrc, rect, stageMetrics }) => {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Area removal is unavailable in this browser.')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const imageRatio = canvas.width / canvas.height
  const stageRatio = stageMetrics.width / stageMetrics.height
  let drawWidth = stageMetrics.width
  let drawHeight = stageMetrics.height
  let offsetX = 0
  let offsetY = 0
  if (imageRatio > stageRatio) {
    drawWidth = imageRatio * drawHeight
    offsetX = (stageMetrics.width - drawWidth) / 2
  } else {
    drawHeight = drawWidth / imageRatio
    offsetY = (stageMetrics.height - drawHeight) / 2
  }
  const x = ((rect.x / 100) * stageMetrics.width - offsetX) / drawWidth * canvas.width
  const y = ((rect.y / 100) * stageMetrics.height - offsetY) / drawHeight * canvas.height
  const width = (rect.w / 100) * stageMetrics.width / drawWidth * canvas.width
  const height = (rect.h / 100) * stageMetrics.height / drawHeight * canvas.height
  const sample = document.createElement('canvas')
  sample.width = canvas.width
  sample.height = canvas.height
  const sampleCtx = sample.getContext('2d')
  if (!sampleCtx) throw new Error('Area removal is unavailable in this browser.')
  sampleCtx.filter = `blur(${Math.max(8, Math.min(width, height) * 0.08)}px)`
  sampleCtx.drawImage(canvas, 0, 0)
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()
  ctx.drawImage(sample, 0, 0)
  ctx.restore()
  return canvas.toDataURL('image/png')
}

const drawShapeLayer = (ctx, layer, width, height) => {
  const w = (layer.width / 100) * width
  const h = (layer.height / 100) * height
  const x = (layer.x / 100) * width
  const y = (layer.y / 100) * height

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(((layer.rotation || 0) * Math.PI) / 180)
  ctx.globalAlpha = (layer.opacity ?? 100) / 100
  ctx.fillStyle = layer.color
  ctx.strokeStyle = layer.strokeColor || layer.color
  ctx.lineWidth = layer.strokeWidth || 0
  ctx.lineCap = 'round'

  ctx.beginPath()
  if (layer.shape === 'ellipse') {
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2)
  } else if (layer.shape === 'line') {
    ctx.moveTo(-w / 2, 0)
    ctx.lineTo(w / 2, 0)
  } else if (layer.shape === 'triangle') {
    ctx.moveTo(0, -h / 2)
    ctx.lineTo(w / 2, h / 2)
    ctx.lineTo(-w / 2, h / 2)
    ctx.closePath()
  } else {
    ctx.roundRect(-w / 2, -h / 2, w, h, layer.radius || 0)
  }

  if (layer.shape === 'line') {
    ctx.lineWidth = Math.max(2, h)
    ctx.stroke()
  } else {
    if (layer.filled !== false) ctx.fill()
    if (layer.strokeWidth > 0) ctx.stroke()
  }

  ctx.restore()
}

const buildMaskPath = (ctx, maskShape, width, height) => {
  ctx.beginPath()

  if (maskShape === 'circle') {
    ctx.ellipse(width / 2, height / 2, width * 0.44, height * 0.44, 0, 0, Math.PI * 2)
    return
  }

  if (maskShape === 'frame') {
    ctx.roundRect(width * 0.06, height * 0.06, width * 0.88, height * 0.88, 36)
    return
  }

  if (maskShape === 'diagonal') {
    ctx.moveTo(width * 0.08, height * 0.16)
    ctx.lineTo(width * 0.92, height * 0.06)
    ctx.lineTo(width * 0.84, height * 0.84)
    ctx.lineTo(width * 0.12, height * 0.94)
    ctx.closePath()
    return
  }

  ctx.roundRect(0, 0, width, height, 28)
}

const drawTextLayer = (ctx, layer, x, y, maxWidth) => {
  const fontStack = layer.fontFamily
    ? `"${layer.fontFamily}", Inter, system-ui, sans-serif`
    : 'Inter, system-ui, sans-serif'
  ctx.font = `${layer.weight} ${layer.fontSize}px ${fontStack}`
  const lines = wrapText(ctx, layer.value, maxWidth)
  const lineHeight = layer.fontSize * 1.14
  const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), 0)
  const totalHeight = lines.length * lineHeight

  if (layer.effect === 'panel') {
    const paddingX = 18
    const paddingY = 12
    const panelWidth = Math.min(maxWidth + paddingX * 2, Math.max(textWidth + paddingX * 2, 120))
    const panelHeight = totalHeight + paddingY * 2
    ctx.save()
    ctx.fillStyle = layer.panelColor || 'rgba(15, 23, 42, 0.35)'
    ctx.beginPath()
    ctx.roundRect(x - paddingX, y - paddingY, panelWidth, panelHeight, layer.panelRadius || 16)
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  ctx.font = `${layer.weight} ${layer.fontSize}px ${fontStack}`
  ctx.textAlign = layer.align || 'left'
  ctx.textBaseline = 'top'
  ctx.direction = 'ltr'
  ctx.letterSpacing = `${layer.letterSpacing || 0}px`

  if (layer.effect === 'glow') {
    ctx.shadowColor = layer.shadowColor || layer.color
    ctx.shadowBlur = layer.shadowBlur || 18
  } else if (layer.effect === 'shadow' || layer.effect === 'panel') {
    ctx.shadowColor = layer.shadowColor || 'rgba(0, 0, 0, 0.55)'
    ctx.shadowBlur = layer.shadowBlur || 18
    ctx.shadowOffsetX = layer.shadowOffsetX || 0
    ctx.shadowOffsetY = layer.shadowOffsetY || 4
  }

  if (layer.effect === 'gradient') {
    const gradient = ctx.createLinearGradient(x, y, x + maxWidth, y + layer.fontSize)
    gradient.addColorStop(0, layer.color)
    gradient.addColorStop(1, '#f8fafc')
    ctx.fillStyle = gradient
  } else {
    ctx.fillStyle = layer.color
  }

  if (layer.effect === 'outline' && layer.outlineWidth > 0) {
    ctx.lineWidth = layer.outlineWidth
    ctx.strokeStyle = layer.outlineColor || '#000000'
    lines.forEach((line, index) => {
      ctx.strokeText(line, x, y + index * lineHeight)
    })
  }

  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight)
  })

  ctx.restore()
}

const renderComposition = async ({
  canvas,
  imageSrc,
  maskShape,
  filters,
  preset,
  backgroundColor,
  layers,
  brushStrokes,
  imageOpacity = 100,
}) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas export is unavailable in this browser.')
  }

  const width = canvas.width
  const height = canvas.height

  ctx.clearRect(0, 0, width, height)
  if (backgroundColor !== 'transparent') {
    ctx.fillStyle = backgroundColor || preset.base
    ctx.fillRect(0, 0, width, height)
  }

  if (imageSrc) {
    try {
      const image = await loadImage(imageSrc)
      // Same object-fit: contain placement as the on-screen preview.
      const fit = {
        scale: Math.min(width / image.width, height / image.height),
      }
      const drawWidth = image.width * fit.scale
      const drawHeight = image.height * fit.scale
      const offsetX = (width - drawWidth) / 2
      const offsetY = (height - drawHeight) / 2

      ctx.save()
      if (maskShape !== 'none') {
        buildMaskPath(ctx, maskShape, width, height)
        ctx.clip()
      }

      ctx.filter = buildFilterString(filters)
      ctx.globalAlpha = clamp(imageOpacity / 100, 0, 1)
      ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)
      ctx.restore()
    } catch {
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.fillRect(width * 0.12, height * 0.12, width * 0.76, height * 0.72)
    }
  }

  if (brushStrokes.length) {
    const strokeLayer = renderStrokeLayer(brushStrokes, width, height)
    if (strokeLayer) {
      ctx.drawImage(strokeLayer, 0, 0)
    }
  }

  if ((imageSrc || layers.length || brushStrokes.length) && filters.vignette > 0) {
    const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.18, width / 2, height / 2, width * 0.72)
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)')
    vignette.addColorStop(1, `rgba(2, 6, 23, ${(0.62 * Math.min(100, filters.vignette)) / 100})`)
    ctx.save()
    // source-atop keeps transparent areas transparent.
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }

  if ((imageSrc || layers.length || brushStrokes.length) && filters.grain > 0) {
    const dotCount = Math.round((width * height * filters.grain) / 110000)
    ctx.save()
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
    for (let index = 0; index < dotCount; index += 1) {
      ctx.fillRect(Math.random() * width, Math.random() * height, 1, 1)
    }
    ctx.restore()
  }

  // Logo layers need decoding before the synchronous draw pass below.
  const logoImages = new Map()
  await Promise.all(
    layers
      .filter((layer) => layer.type === 'image' && layer.src && !layer.hidden && !layer.isBaseImage)
      .map(async (layer) => {
        try {
          logoImages.set(layer.id, await loadImage(layer.src))
        } catch {
          // A logo that will not decode is skipped rather than failing the export.
        }
      }),
  )

  layers.forEach((layer) => {
    if (layer.hidden || layer.isBaseImage) return

    const x = (layer.x / 100) * width
    const y = (layer.y / 100) * height
    ctx.globalCompositeOperation = layer.blendMode || 'source-over'

    if (layer.type === 'image') {
      const image = logoImages.get(layer.id)
      if (!image) return

      const drawWidth = (layer.width / 100) * width
      const drawHeight = drawWidth * (image.height / image.width)

      ctx.save()
      ctx.globalAlpha = (layer.opacity ?? 100) / 100
      ctx.translate(x, y)
      ctx.rotate(((layer.rotation || 0) * Math.PI) / 180)
      ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
      ctx.restore()
      return
    }

    if (layer.type === 'shape') {
      drawShapeLayer(ctx, layer, width, height)
      return
    }

    if (layer.type === 'sticker') {
      ctx.save()
      ctx.globalAlpha = (layer.opacity ?? 100) / 100
      ctx.translate(x, y)
      ctx.rotate(((layer.rotation || 0) * Math.PI) / 180)
      ctx.font = `${layer.fontSize}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = layer.shadowColor || 'rgba(0, 0, 0, 0.45)'
      ctx.shadowBlur = layer.shadowBlur || 24
      ctx.fillText(layer.value, 0, 0)
      ctx.restore()
      return
    }

    ctx.save()
    ctx.globalAlpha = (layer.opacity ?? 100) / 100
    if (layer.rotation) {
      ctx.translate(x, y)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      ctx.translate(-x, -y)
    }
    drawTextLayer(ctx, layer, x, y, width * 0.48)
    ctx.restore()
  })
  ctx.globalCompositeOperation = 'source-over'

  return canvas.toDataURL('image/png')
}

export function PhotoEditor({
  assets,
  onExport,
  brandKit,
  initialProject,
  folders = [],
  onCreateFolder,
  onUploadFiles,
  onMoveAsset,
  onRenameAsset,
  onRenameFolder,
  onDeleteAsset,
  onDeleteFolder,
  onSaveProject,
}) {
  const imageAssets = useMemo(() => assets.filter((asset) => asset.type === 'image'), [assets])
  const [autosavedProject, setAutosavedProject] = useState(readPhotoAutosave)
  const startingProject = initialProject || autosavedProject
  const [workspaceView, setWorkspaceView] = useState(initialProject ? 'editor' : readPhotoWorkspaceView)
  const [projectsFolderId, setProjectsFolderId] = useState('')
  const [projectsSearch, setProjectsSearch] = useState('')
  const [projectsTypeFilter, setProjectsTypeFilter] = useState('all')
  const [projectsDateFilter, setProjectsDateFilter] = useState('any')
  const [newFolderDraft, setNewFolderDraft] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [projectsMenu, setProjectsMenu] = useState(null)
  const [renamingItem, setRenamingItem] = useState(null)
  const projectIdRef = useRef(startingProject?.projectId || `design_${Date.now()}`)
  const projectsUploadInputRef = useRef(null)
  const [editorPanel, setEditorPanel] = useState('main')
  const [saveStatus, setSaveStatus] = useState(autosavedProject ? 'Autosaved' : 'Autosave on')
  const [schoolPractice, setSchoolPractice] = useState(null)
  const [schoolCourseId, setSchoolCourseId] = useState('')
  const [schoolPracticeCompleted, setSchoolPracticeCompleted] = useState(false)
  const [homeSearch, setHomeSearch] = useState('')
  const [logoSearch, setLogoSearch] = useState('')
  const [logoIndustry, setLogoIndustry] = useState('All')
  const [templateCategory, setTemplateCategory] = useState('All')
  const [templatePlatform, setTemplatePlatform] = useState('All')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createCategory, setCreateCategory] = useState('For you')
  const [createPlatform, setCreatePlatform] = useState('all')
  const [createSearch, setCreateSearch] = useState('')
  const [customWidth, setCustomWidth] = useState(1080)
  const [customHeight, setCustomHeight] = useState(1080)
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [uploadedImage, setUploadedImage] = useState('')
  const [stockLibraryOpen, setStockLibraryOpen] = useState(false)
  const [generatedImageSrc, setGeneratedImageSrc] = useState(startingProject?.imageSrc || '')
  const [prompt, setPrompt] = useState(startingProject?.visualPrompt || startingProject?.prompt || DEFAULT_PROMPT)
  const [presetId, setPresetId] = useState('aurora')
  const [aspectRatio, setAspectRatio] = useState(startingProject?.aspectRatio || (startingProject?.outputType === 'image' ? '1:1' : '4:5'))
  const [customCanvasSize, setCustomCanvasSize] = useState(() => normalizeCanvasSize(startingProject?.canvasSize))
  const [headline, setHeadline] = useState(startingProject?.headline || '')
  const [subcopy, setSubcopy] = useState(startingProject?.caption || startingProject?.subcopy || '')
  const [activeTool, setActiveTool] = useState('select')
  const [maskShape, setMaskShape] = useState('none')
  const [brushColor, setBrushColor] = useState('#ffffff')
  const [brushSize, setBrushSize] = useState(24)
  const [brushOpacity, setBrushOpacity] = useState(0.8)
  const [brushStrokes, setBrushStrokes] = useState([])
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 100, h: 100 })
  const [removeRect, setRemoveRect] = useState(null)
  const [canvasBackground, setCanvasBackground] = useState(startingProject?.canvasBackground || (startingProject ? '#0f172a' : '#ffffff'))
  const [stageMetrics, setStageMetrics] = useState({ width: 1000, height: 1250 })
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_FILTERS, ...startingProject?.filters }))
  const [exportFormat, setExportFormat] = useState('png')
  const [exportQuality, setExportQuality] = useState(92)
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 })
  const [layers, setLayers] = useState(() => startingProject?.layers?.length
    ? ensureBaseImageLayer(startingProject.layers, startingProject.imageSrc)
    : (initialProject ? projectLayers(initialProject) : []))
  const [activeLayerId, setActiveLayerId] = useState(startingProject?.layers?.[0]?.id || (initialProject ? 'headline' : ''))
  const [notice, setNotice] = useState(startingProject ? 'Saved project ready. Every layer remains editable.' : 'Blank workspace ready for upload.')
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(true)
  const [compactMode, setCompactMode] = useState(false)
  const [canvasZoom, setCanvasZoom] = useState(100)
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 })
  const [openMenu, setOpenMenu] = useState(null)
  const [menuHost, setMenuHost] = useState(null)
  useEffect(() => {
    try {
      localStorage.setItem('echoai-photo-workspace-view', workspaceView)
    } catch {
      // The editor still works when browser storage is unavailable.
    }
  }, [workspaceView])
  useEffect(() => {
    if (!openMenu) return undefined
    const dismissOutside = (event) => {
      if (event.target instanceof Element && event.target.closest('.sidebar-menu-bar')) return
      setOpenMenu(null)
    }
    const dismissEscape = (event) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('keydown', dismissEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('keydown', dismissEscape)
    }
  }, [openMenu])
  const stageRef = useRef(null)
  const stageViewportRef = useRef(null)
  const paintCanvasRef = useRef(null)
  const dragRef = useRef(null)
  const cropDragRef = useRef(null)
  const removeDragRef = useRef(null)
  const brushStrokeRef = useRef(null)
  const canvasPanRef = useRef(null)
  const layerIdRef = useRef(0)
  const uploadInputRef = useRef(null)
  const [stageViewportSize, setStageViewportSize] = useState({ width: 900, height: 720 })
  const [hueSat, setHueSat] = useState(defaultHueSat)
  const [hueSatDialog, setHueSatDialog] = useState(null)
  const [layerMask, setLayerMask] = useState(null)
  const [work, setWork] = useState(null)
  const [processed, setProcessed] = useState(null)
  const [selection, setSelection] = useState(null)
  const [selectionMode, setSelectionMode] = useState('new')
  const [selectionFeather, setSelectionFeather] = useState(0)
  const [wandTolerance, setWandTolerance] = useState(32)
  const [wandContiguous, setWandContiguous] = useState(true)
  const [marquee, setMarquee] = useState(null)
  const [lassoPoints, setLassoPoints] = useState([])
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [layerMenu, setLayerMenu] = useState(null)
  const [renamingLayerId, setRenamingLayerId] = useState('')
  const [busy, setBusy] = useState('')
    const [projectFileHandle, setProjectFileHandle] = useState(null)
  const focusMode = useEditorFocusMode()
  const maskIdRef = useRef(0)
  // Handlers declared later in the component, reached from earlier keyboard/menu code.
  const lateActionsRef = useRef({})
  const selectionDragRef = useRef(null)

  const selectedAsset = imageAssets.find((asset) => asset.id === selectedAssetId) ?? null
  const baseImageLayer = layers.find((layer) => layer.isBaseImage) ?? null
  const selectedImageSrc = generatedImageSrc || uploadedImage || selectedAsset?.previewUrl || baseImageLayer?.src || ''
  const preset = STYLE_PRESETS[presetId] ?? STYLE_PRESETS.aurora
  const aspect = useMemo(() => aspectRatio === 'custom' && customCanvasSize
    ? {
        label: customCanvasSize.label,
        canvasWidth: customCanvasSize.width,
        canvasHeight: customCanvasSize.height,
        css: `${customCanvasSize.width} / ${customCanvasSize.height}`,
      }
    : (ASPECT_RATIOS[aspectRatio] ?? ASPECT_RATIOS['4:5']), [aspectRatio, customCanvasSize])
  const resolvedActiveLayerId = layers.some((layer) => layer.id === activeLayerId)
    ? activeLayerId
    : (layers[0]?.id ?? '')
  const activeTextLayer = layers.find((layer) => layer.id === resolvedActiveLayerId && layer.type === 'text') ?? null
  const activeLayer = layers.find((layer) => layer.id === resolvedActiveLayerId) ?? null
  const stageClipPath =
    maskShape === 'circle'
      ? 'circle(44% at 50% 50%)'
      : maskShape === 'frame'
        ? 'inset(6% round 30px)'
        : maskShape === 'diagonal'
          ? 'polygon(8% 16%, 92% 6%, 84% 84%, 12% 94%)'
          : maskShape === 'rounded'
            ? 'inset(0 round 28px)'
            : 'none'

  const stageDisplaySize = useMemo(() => {
    const ratio = aspect.canvasWidth / aspect.canvasHeight
    const availableWidth = Math.max(240, stageViewportSize.width - (compactMode ? 20 : 36))
    const availableHeight = Math.max(220, stageViewportSize.height - (compactMode ? 20 : 36))

    let width = availableWidth
    let height = width / ratio

    if (height > availableHeight) {
      height = availableHeight
      width = height * ratio
    }

    return {
      width: Math.round(width),
      height: Math.round(height),
    }
  }, [aspect, compactMode, stageViewportSize])

  const updateLayer = (layerId, patch) => {
    setLayers((prev) => prev.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer)))
  }

  const syncBaseImageLayer = (src, label = 'Original photo') => {
    setLayers((prev) => ensureBaseImageLayer(prev, src, label))
  }

  // --- History -------------------------------------------------------------
  // Snapshots everything a user can undo. Sliders call commitHistory on
  // pointerdown so one drag produces one undo step, not one per pixel.
  const historyRef = useRef({ past: [], future: [] })

  const buildSnapshot = () => ({
    layers,
    filters,
    brushStrokes,
    selection,
    maskShape,
    cropRect,
    presetId,
    aspectRatio,
    customCanvasSize,
    generatedImageSrc,
    uploadedImage,
    selectedAssetId,
    canvasBackground,
    hueSat,
    layerMask,
  })

  const applySnapshot = (snapshot) => {
    setLayers(snapshot.layers)
    setFilters(snapshot.filters)
    setBrushStrokes(snapshot.brushStrokes)
    setSelection(snapshot.selection ?? null)
    setMaskShape(snapshot.maskShape)
    setCropRect(snapshot.cropRect)
    setPresetId(snapshot.presetId)
    setAspectRatio(snapshot.aspectRatio)
    setCustomCanvasSize(snapshot.customCanvasSize ?? null)
    setGeneratedImageSrc(snapshot.generatedImageSrc)
    setUploadedImage(snapshot.uploadedImage)
    setSelectedAssetId(snapshot.selectedAssetId)
    setCanvasBackground(snapshot.canvasBackground || '#ffffff')
    setHueSat(snapshot.hueSat ?? defaultHueSat())
    setLayerMask(snapshot.layerMask ?? null)
  }

  const syncHistoryCounts = () => {
    setHistoryCounts({
      past: historyRef.current.past.length,
      future: historyRef.current.future.length,
    })
  }

  const commitHistory = () => {
    historyRef.current.past.push(buildSnapshot())
    if (historyRef.current.past.length > 60) {
      historyRef.current.past.shift()
    }
    historyRef.current.future = []
    syncHistoryCounts()
  }

  const undo = () => {
    const previous = historyRef.current.past.pop()
    if (!previous) return
    historyRef.current.future.push(buildSnapshot())
    applySnapshot(previous)
    syncHistoryCounts()
    setNotice('Undid the last change.')
  }

  const redo = () => {
    const next = historyRef.current.future.pop()
    if (!next) return
    historyRef.current.past.push(buildSnapshot())
    applySnapshot(next)
    syncHistoryCounts()
    setNotice('Redid the last change.')
  }

  // --- Layer operations ----------------------------------------------------
  const nextLayerId = (kind) => {
    layerIdRef.current += 1
    return `${kind}-${layerIdRef.current}`
  }

  const addLayer = (layer) => {
    commitHistory()
    setLayers((prev) => [...prev, layer])
    setActiveLayerId(layer.id)
  }

  const addTextLayer = () => {
    addLayer({
      id: nextLayerId('text'),
      type: 'text',
      label: 'Text',
      value: 'New text layer',
      x: 20,
      y: 50,
      fontSize: 34,
      weight: 700,
      // White with a shadow reads on photos; on a blank light canvas it would vanish.
      color: selectedImageSrc ? '#f8fafc' : '#0f172a',
      align: 'left',
      effect: selectedImageSrc ? 'shadow' : 'none',
      outlineWidth: 0,
      outlineColor: '#020617',
      shadowBlur: 18,
      shadowColor: 'rgba(2, 6, 23, 0.6)',
      shadowOffsetX: 0,
      shadowOffsetY: 6,
      panelColor: 'rgba(15, 23, 42, 0.42)',
      panelRadius: 18,
      letterSpacing: 0,
      opacity: 100,
      rotation: 0,
    })
    setNotice('Added a text layer.')
  }

  const addShapeLayer = (shape) => {
    addLayer({
      id: nextLayerId('shape'),
      type: 'shape',
      label: SHAPES[shape] ?? 'Shape',
      shape,
      value: SHAPES[shape] ?? 'Shape',
      x: 50,
      y: 50,
      width: 30,
      height: shape === 'line' ? 1 : 20,
      color: preset.accent,
      strokeColor: preset.secondary,
      strokeWidth: 0,
      radius: shape === 'rectangle' ? 18 : 0,
      filled: true,
      opacity: 90,
      rotation: 0,
    })
    setNotice(`Added a ${SHAPES[shape] ?? 'shape'} layer.`)
  }

  const duplicateLayer = (layerId) => {
    const source = layers.find((layer) => layer.id === layerId)
    if (!source) return
    const copy = {
      ...source,
      id: nextLayerId(source.type),
      label: `${source.label} copy`,
      x: clamp(source.x + 4, 0, 100),
      y: clamp(source.y + 4, 0, 100),
      isBaseImage: false,
    }
    commitHistory()
    setLayers((prev) => [...prev, copy])
    setActiveLayerId(copy.id)
    setNotice('Duplicated the layer.')
  }

  const deleteLayer = (layerId) => {
    const layer = layers.find((item) => item.id === layerId)
    if (layer?.isBaseImage) {
      commitHistory()
      setGeneratedImageSrc('')
      setUploadedImage('')
      setSelectedAssetId('')
      syncBaseImageLayer('')
      setActiveLayerId('')
      setNotice('Original image removed. The canvas is ready for a new upload.')
      return
    }
    if (layers.filter((item) => !item.isBaseImage).length <= 1 && !layers.some((item) => item.isBaseImage)) {
      setNotice('Keep at least one layer on the canvas.')
      return
    }
    commitHistory()
    setLayers((prev) => prev.filter((layer) => layer.id !== layerId))
    setNotice('Deleted the layer.')
  }

  const moveLayerOrder = (layerId, direction) => {
    const index = layers.findIndex((layer) => layer.id === layerId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= layers.length) return

    commitHistory()
    setLayers((prev) => {
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  const toggleLayerVisibility = (layerId) => {
    commitHistory()
    setLayers((prev) =>
      prev.map((layer) => (layer.id === layerId ? { ...layer, hidden: !layer.hidden } : layer)),
    )
  }

  const resetFilters = () => {
    commitHistory()
    setFilters(DEFAULT_FILTERS)
    setNotice('Adjustments reset.')
  }

  // --- Pro editing: pixel pipeline, selections, layer mask ----------------
  useEffect(() => {
    if (!selectedImageSrc) return undefined
    let cancelled = false
    loadWorkImage(selectedImageSrc)
      .then((next) => {
        if (!cancelled) setWork(next)
      })
      .catch(() => {
        if (!cancelled) setNotice('That image could not be read for pixel editing.')
      })
    return () => {
      cancelled = true
    }
  }, [selectedImageSrc])

  const activeWork = work?.src === selectedImageSrc ? work : null
  const maskActive = Boolean(layerMask?.src && layerMask.enabled !== false)
  const needsProcessing = Boolean(activeWork && (maskActive || !isNeutralHueSat(hueSat)))
  const processKey = needsProcessing ? `${JSON.stringify(hueSat)}|${maskActive ? layerMask.id : 'none'}` : ''

  useEffect(() => {
    if (!needsProcessing || !activeWork) return undefined
    let cancelled = false
    const timer = setTimeout(() => {
      renderProcessedBase({ work: activeWork, hueSat, layerMask: maskActive ? layerMask : null })
        .then(canvasToObjectUrl)
        .then((url) => {
          if (cancelled) {
            URL.revokeObjectURL(url)
            return
          }
          setProcessed((previous) => {
            if (previous?.url && previous.url !== url) setTimeout(() => URL.revokeObjectURL(previous.url), 1500)
            return { key: processKey, src: activeWork.src, url }
          })
        })
        .catch(() => {})
    }, 40)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [activeWork, hueSat, layerMask, maskActive, needsProcessing, processKey])

  // While a new render is in flight keep showing the last one, never the unmasked original.
  const displayImageSrc = !needsProcessing
    ? selectedImageSrc
    : processed?.src === selectedImageSrc
      ? processed.url
      : maskActive ? '' : selectedImageSrc
  const renderedImageSrc = baseImageLayer?.hidden ? '' : displayImageSrc

  const imageFit = activeWork ? fitContain(activeWork.width, activeWork.height, stageDisplaySize.width, stageDisplaySize.height) : null
  const stageToWork = (point) => ({
    x: (((point.x / 100) * stageDisplaySize.width - imageFit.x) / imageFit.width) * activeWork.width,
    y: (((point.y / 100) * stageDisplaySize.height - imageFit.y) / imageFit.height) * activeWork.height,
  })
  const isInsideWork = (point) => point.x >= 0 && point.y >= 0 && point.x < activeWork.width && point.y < activeWork.height

  const withBusy = (label, task) => {
    setBusy(label)
    // Let the busy indicator paint before the synchronous pixel work blocks the thread.
    setTimeout(async () => {
      try {
        await task()
      } catch (error) {
        setNotice(error.message || 'That operation failed.')
      } finally {
        setBusy('')
      }
    }, 30)
  }

  const requireWork = () => {
    if (activeWork) return true
    setNotice(selectedImageSrc ? 'Still reading the image, try again in a moment.' : 'Add a photo first. Selections and masks work on the photo.')
    return false
  }

  const selectTool = (key) => {
    setActiveTool(key)
    setLassoPoints([])
    setMarquee(null)
    if (SELECTION_TOOLS.has(key)) {
      setNotice(`${TOOLS[key]}: ${{
        'object-select': 'click the photo to select the main subject.',
        'magic-wand': 'click a color to select similar pixels.',
        'rect-select': 'drag a box.',
        lasso: 'drag around an area.',
        polygon: 'click corner points, then click the first point or press Enter.',
      }[key]} Shift adds, Alt subtracts.`)
    } else if (TOOLS[key]) {
      setNotice(`${TOOLS[key]} tool selected.`)
    }
  }

  const commitSelection = (mask, mode, label) => {
    if (!activeWork) return
    const { width, height } = activeWork
    const current = selection?.width === width && selection?.height === height ? selection.mask : null
    let next = combineMasks(current, mask, mode)
    if (selectionFeather > 0) next = featherMask(next, width, height, selectionFeather)
    const coverage = maskCoverage(next)
    if (coverage < 0.0005) {
      setSelection(null)
      setNotice('Nothing is selected.')
      return
    }
    commitHistory()
    setSelection({ mask: next, width, height, ...selectionOverlayUrls(next, width, height) })
    setNotice(`${label}: ${Math.max(1, Math.round(coverage * 100))}% of the photo selected.`)
  }

  const modeFromEvent = (event) => {
    if (event.shiftKey && event.altKey) return 'intersect'
    if (event.shiftKey) return 'add'
    if (event.altKey) return 'subtract'
    return selectionMode
  }

  const runSelectSubject = (mode) => {
    const result = selectSubjectMask(activeWork.imageData)
    if (result.confidence === 'low') {
      setNotice('No clear subject found. Try the Magic wand (Shift+W) on the background, then Select → Inverse.')
      return
    }
    commitSelection(result.mask, mode, 'Subject selected')
    if (result.confidence === 'medium') {
      setNotice('Subject selected. The background is busy, so check the edges and refine with Shift/Alt + Lasso.')
    }
  }

  const selectSubject = () => {
    if (!requireWork()) return
    withBusy('Finding the subject…', () => runSelectSubject(selectionMode))
  }

  const selectAll = () => {
    if (!requireWork()) return
    commitSelection(new Uint8Array(activeWork.width * activeWork.height).fill(255), 'new', 'Select all')
  }

  const deselect = () => {
    if (selection) commitHistory()
    setSelection(null)
    setLassoPoints([])
    setMarquee(null)
  }

  const invertSelection = () => {
    if (!selection) {
      setNotice('Make a selection first.')
      return
    }
    commitSelection(invertMask(selection.mask), 'new', 'Inverse')
  }

  const closePolygon = (mode, points = lassoPoints) => {
    if (points.length >= 3 && activeWork) {
      commitSelection(polygonMask(activeWork.width, activeWork.height, points.map(stageToWork)), mode, 'Polygonal lasso')
    }
    setLassoPoints([])
  }

  const startSelection = (event) => {
    if (!requireWork()) return
    event.preventDefault()
    event.stopPropagation()
    const mode = modeFromEvent(event)
    const point = getStagePoint(event)

    if (activeTool === 'object-select') {
      withBusy('Finding the subject…', () => runSelectSubject(mode))
      return
    }
    if (activeTool === 'magic-wand') {
      const seed = stageToWork(point)
      if (!isInsideWork(seed)) {
        setNotice('Click on the photo to pick a color.')
        return
      }
      withBusy('Selecting…', () => commitSelection(magicWandMask(activeWork.imageData, seed.x, seed.y, { tolerance: wandTolerance, contiguous: wandContiguous }), mode, 'Magic wand'))
      return
    }
    if (activeTool === 'polygon') {
      const first = lassoPoints[0]
      if (lassoPoints.length >= 3 && (event.detail >= 2 || Math.hypot(first.x - point.x, first.y - point.y) < 1.5)) {
        closePolygon(mode)
      } else {
        setLassoPoints((current) => [...current, point])
      }
      return
    }

    const tool = activeTool
    selectionDragRef.current = { mode, start: point, last: point, points: [point] }
    if (tool === 'rect-select') setMarquee({ x: point.x, y: point.y, w: 0, h: 0 })
    else setLassoPoints([point])

    const move = (moveEvent) => {
      const drag = selectionDragRef.current
      if (!drag) return
      const next = getStagePoint(moveEvent)
      drag.last = next
      if (tool === 'rect-select') {
        setMarquee({ x: Math.min(drag.start.x, next.x), y: Math.min(drag.start.y, next.y), w: Math.abs(next.x - drag.start.x), h: Math.abs(next.y - drag.start.y) })
      } else {
        drag.points.push(next)
        setLassoPoints([...drag.points])
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      const drag = selectionDragRef.current
      selectionDragRef.current = null
      if (!drag) return
      if (tool === 'rect-select') {
        setMarquee(null)
        if (Math.abs(drag.last.x - drag.start.x) < 0.4 && Math.abs(drag.last.y - drag.start.y) < 0.4) {
          if (drag.mode === 'new') deselect()
          return
        }
        const a = stageToWork(drag.start)
        const b = stageToWork(drag.last)
        commitSelection(rectMask(activeWork.width, activeWork.height, { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }), drag.mode, 'Rectangle')
      } else {
        setLassoPoints([])
        if (drag.points.length >= 3) {
          commitSelection(polygonMask(activeWork.width, activeWork.height, drag.points.map(stageToWork)), drag.mode, 'Lasso')
        }
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const saveLayerMask = (mask, message) => {
    commitHistory()
    maskIdRef.current += 1
    setLayerMask({ id: maskIdRef.current, src: maskToDataUrl(mask, activeWork.width, activeWork.height), enabled: true })
    setRightSidebarCollapsed(false)
    setNotice(message)
  }

  const currentMaskPixels = async () => (layerMask?.src && activeWork
    ? dataUrlToMask(layerMask.src, activeWork.width, activeWork.height)
    : new Uint8Array(activeWork.width * activeWork.height).fill(255))

  const addLayerMaskFromSelection = () => {
    if (!requireWork()) return
    if (!selection) {
      setNotice('Make a selection first (W selects the subject), then add the mask.')
      return
    }
    saveLayerMask(selection.mask, 'Layer mask added. Everything outside the selection is hidden. Pick a Fill in the Layers panel.')
    setSelection(null)
  }

  const removeBackground = () => {
    if (!requireWork()) return
    withBusy('Removing background…', () => {
      const result = selectSubjectMask(activeWork.imageData)
      if (result.confidence === 'low') {
        setNotice('No clear subject found. Select the subject by hand (Lasso or Magic wand) and use Add mask.')
        return
      }
      saveLayerMask(
        featherMask(result.mask, activeWork.width, activeWork.height, 1),
        result.confidence === 'medium'
          ? 'Background removed. The scene is busy, so check the edges; refine with a selection and Add mask.'
          : 'Background removed. Choose a Fill color in the Layers panel, or keep it transparent for PNG.',
      )
      setSelection(null)
    })
  }

  const deleteSelectedArea = async () => {
    const current = await currentMaskPixels()
    saveLayerMask(combineMasks(current, selection.mask, 'subtract'), 'Deleted the selected area. It is hidden by the layer mask, so you can bring it back by deleting the mask.')
    setSelection(null)
  }

  const toggleLayerMask = () => {
    if (!layerMask) return
    commitHistory()
    setLayerMask({ ...layerMask, enabled: layerMask.enabled === false })
    setNotice(layerMask.enabled === false ? 'Layer mask enabled.' : 'Layer mask disabled. The full photo is showing.')
  }

  const invertLayerMask = async () => {
    if (!layerMask || !requireWork()) return
    saveLayerMask(invertMask(await currentMaskPixels()), 'Layer mask inverted.')
  }

  const deleteLayerMask = () => {
    if (!layerMask) return
    commitHistory()
    setLayerMask(null)
    setNotice('Layer mask deleted. The full photo is back.')
  }

  const replaceBaseImage = (src, message) => {
    commitHistory()
    setGeneratedImageSrc(src)
    setUploadedImage('')
    setSelectedAssetId('')
    syncBaseImageLayer(src)
    setNotice(message)
  }

  const hexToRgb = (hex) => {
    const value = normalizeColorInputValue(hex, '#000000').slice(1)
    return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16))
  }

  const applyPaintBucket = (event) => {
    event.preventDefault()
    if (!selectedImageSrc) {
      commitHistory()
      setCanvasBackground(brushColor)
      setNotice('Filled the canvas background.')
      return
    }
    if (!requireWork()) return
    const seed = stageToWork(getStagePoint(event))
    if (!isInsideWork(seed)) {
      commitHistory()
      setCanvasBackground(brushColor)
      setNotice('Filled the canvas background around the photo.')
      return
    }
    withBusy('Filling…', () => {
      const pixels = cloneImageData(activeWork.imageData)
      const count = paintBucket(pixels, seed.x, seed.y, hexToRgb(brushColor), { tolerance: wandTolerance, contiguous: wandContiguous })
      replaceBaseImage(imageDataToDataUrl(pixels), `Filled ${count.toLocaleString()} pixels.`)
    })
  }

  const sharpenBase = () => {
    if (!requireWork()) return
    withBusy('Sharpening…', () => {
      const pixels = cloneImageData(activeWork.imageData)
      sharpen(pixels, 0.5)
      replaceBaseImage(imageDataToDataUrl(pixels), 'Sharpened the photo.')
    })
    setOpenMenu(null)
  }

  const transformBase = (kind, message) => {
    setOpenMenu(null)
    if (!selectedImageSrc) {
      setNotice('Add a photo first.')
      return
    }
    withBusy('Transforming…', async () => {
      const src = await transformImageSrc(selectedImageSrc, kind)
      const maskSrc = layerMask?.src ? await transformImageSrc(layerMask.src, kind) : null
      replaceBaseImage(src, message)
      if (maskSrc) {
        maskIdRef.current += 1
        setLayerMask({ ...layerMask, id: maskIdRef.current, src: maskSrc })
      }
      setSelection(null)
    })
  }

  const flattenImage = () => {
    setOpenMenu(null)
    withBusy('Flattening…', async () => {
      const canvas = document.createElement('canvas')
      canvas.width = stageMetrics.width
      canvas.height = stageMetrics.height
      const src = await renderComposition({ canvas, imageSrc: renderedImageSrc, maskShape, filters, preset, backgroundColor: canvasBackground, layers, brushStrokes, stageMetrics, imageOpacity: baseImageLayer?.opacity })
      replaceBaseImage(src, 'Flattened everything into a single photo.')
      setLayers([])
      setBrushStrokes([])
      setHueSat(defaultHueSat())
      setLayerMask(null)
      setFilters(NEUTRAL_FILTERS)
      setMaskShape('none')
      setSelection(null)
    })
  }

  const quickExportLayer = async (layer) => {
    setLayerMenu(null)
    const canvas = document.createElement('canvas')
    canvas.width = stageMetrics.width
    canvas.height = stageMetrics.height
    const src = await renderComposition({ canvas, imageSrc: layer.isBaseImage ? renderedImageSrc : '', maskShape: 'none', filters: NEUTRAL_FILTERS, preset, backgroundColor: 'transparent', layers: [{ ...layer, hidden: false }], brushStrokes: [], stageMetrics, imageOpacity: layer.isBaseImage ? baseImageLayer?.opacity : undefined })
    const link = document.createElement('a')
    link.href = src
    link.download = `${slugify(layer.label || 'layer')}.png`
    link.click()
    setNotice(`Exported ${layer.label} as a transparent PNG.`)
  }

  const openHueSat = () => {
    setOpenMenu(null)
    setLayerMenu(null)
    if (!selectedImageSrc) {
      setNotice('Add a photo first. Hue/Saturation adjusts the photo.')
      return
    }
    setHueSatDialog({ initial: hueSat })
  }

  const applyHueSat = (next) => {
    historyRef.current.past.push({ ...buildSnapshot(), hueSat: hueSatDialog.initial })
    if (historyRef.current.past.length > 60) historyRef.current.past.shift()
    historyRef.current.future = []
    syncHistoryCounts()
    setHueSat(next)
    setHueSatDialog(null)
    setNotice(isNeutralHueSat(next) ? 'Hue/Saturation cleared.' : 'Hue/Saturation applied. Press Ctrl+U to adjust it again.')
  }

  const cancelHueSat = () => {
    setHueSat(hueSatDialog.initial)
    setHueSatDialog(null)
  }

  const setBackgroundFill = (value) => {
    commitHistory()
    setCanvasBackground(value)
  }

  // --- Menu Handlers -------------------------------------------------------
  
  // FILE MENU
  const handleFileNew = () => {
    if (confirm('Create a new canvas? Unsaved project changes will be cleared.')) resetDocument('New canvas created.')
    setOpenMenu(null)
  }

  const resetDocument = (message) => {
    commitHistory()
    projectIdRef.current = newProjectId()
    setUploadedImage('')
    setGeneratedImageSrc('')
    setSelectedAssetId('')
    setLayers([])
    setActiveLayerId('')
    setActiveTool('select')
    setPrompt(DEFAULT_PROMPT)
    setHeadline('')
    setSubcopy('')
    setPresetId('aurora')
    setAspectRatio('4:5')
    setCustomCanvasSize(null)
    setFilters(DEFAULT_FILTERS)
    setBrushStrokes([])
    setMaskShape('none')
    setCropRect({ x: 0, y: 0, w: 100, h: 100 })
    setCanvasBackground('#ffffff')
    setHueSat(defaultHueSat())
    setLayerMask(null)
    setSelection(null)
    setSelectionMode('new')
    setSelectionFeather(0)
    setProjectFileHandle(null)
    setCanvasPan({ x: 0, y: 0 })
    setCanvasZoom(100)
    setNotice(message)
  }

  const handleFileClose = () => {
    const hasDocument = Boolean(selectedImageSrc || layers.length || brushStrokes.length || layerMask)
    if (!hasDocument || confirm('Close this document? Save any project changes before closing.')) {
      resetDocument('Document closed.')
    }
    setOpenMenu(null)
  }

  const importImageFile = (file) => {
    if (!file?.type?.startsWith('image/')) {
      setNotice('Choose an image file to import.')
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      commitHistory()
      const src = event.target?.result || ''
      setUploadedImage(src)
      setGeneratedImageSrc('')
      setSelectedAssetId('')
      syncBaseImageLayer(src, file.name || 'Original photo')
      setNotice('Image imported successfully.')
      setCreateDialogOpen(false)
      setWorkspaceView('editor')
    }
    reader.readAsDataURL(file)
  }

  const handleFileOpen = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      importImageFile(e.target.files?.[0])
    }
    input.click()
    setOpenMenu(null)
  }

  const handleExport = (format = exportFormat) => {
    setExportFormat(format)
    lateActionsRef.current.exportCanvas?.(format)
    setOpenMenu(null)
  }

  // EDIT MENU
  const handleEditCut = () => {
    if (resolvedActiveLayerId) {
      navigator.clipboard.writeText(JSON.stringify(layers.find((l) => l.id === resolvedActiveLayerId)))
      deleteLayer(resolvedActiveLayerId)
      setNotice('Layer cut to clipboard.')
    }
    setOpenMenu(null)
  }

  const handleEditCopy = () => {
    if (resolvedActiveLayerId) {
      navigator.clipboard.writeText(JSON.stringify(layers.find((l) => l.id === resolvedActiveLayerId)))
      setNotice('Layer copied to clipboard.')
    }
    setOpenMenu(null)
  }

  const handleEditPaste = () => {
    navigator.clipboard.readText().then((text) => {
      try {
        const layer = JSON.parse(text)
        if (layer.id && layer.type) {
          commitHistory()
          layer.id = nextLayerId(layer.type)
          setLayers((prev) => [...prev, layer])
          setActiveLayerId(layer.id)
          setNotice('Layer pasted.')
        }
      } catch {
        setNotice('Could not paste. Clipboard does not contain a valid layer.')
      }
    })
    setOpenMenu(null)
  }

  const handleEditClear = () => {
    if (resolvedActiveLayerId) {
      commitHistory()
      deleteLayer(resolvedActiveLayerId)
      setNotice('Layer cleared.')
    }
    setOpenMenu(null)
  }

  const handleEditSelectAll = () => {
    selectAll()
    setOpenMenu(null)
  }

  // VIEW MENU
  const handleViewZoomIn = () => {
    setCanvasZoom((v) => clamp(v + 10, 50, 200))
    setOpenMenu(null)
  }

  const handleViewZoomOut = () => {
    setCanvasZoom((v) => clamp(v - 10, 50, 200))
    setOpenMenu(null)
  }

  const handleViewFit = () => {
    setCanvasZoom(100)
    setOpenMenu(null)
  }

  const handleViewResetView = () => {
    setCanvasZoom(100)
    setNotice('View reset.')
    setOpenMenu(null)
  }

  // IMAGE MENU
  const handleImageRotate = () => transformBase('rotate-cw', 'Rotated the photo 90° clockwise.')

  const handleImageFlip = () => transformBase('flip-h', 'Flipped the photo horizontally.')

  const handleImageFlatten = () => flattenImage()

  // LAYER MENU
  const handleLayerNew = () => {
    addTextLayer()
    setOpenMenu(null)
  }

  const handleLayerDuplicate = () => {
    if (resolvedActiveLayerId) {
      duplicateLayer(resolvedActiveLayerId)
    }
    setOpenMenu(null)
  }

  const handleLayerDelete = () => {
    if (resolvedActiveLayerId) {
      deleteLayer(resolvedActiveLayerId)
    }
    setOpenMenu(null)
  }

  const handleLayerMergeDown = () => {
    const index = layers.findIndex((layer) => layer.id === resolvedActiveLayerId)
    if (index <= 0) {
      setNotice('Select a layer with another layer beneath it to merge down.')
      setOpenMenu(null)
      return
    }
    const lower = layers[index - 1]
    const upper = layers[index]
    withBusy('Merging layers…', async () => {
      const canvas = document.createElement('canvas')
      canvas.width = aspect.canvasWidth
      canvas.height = aspect.canvasHeight
      const mergeMetrics = { width: canvas.width, height: canvas.height }
      const mergedSrc = await renderComposition({
        canvas,
        imageSrc: lower.isBaseImage ? renderedImageSrc : '',
        maskShape: 'none',
        filters: NEUTRAL_FILTERS,
        preset,
        backgroundColor: 'transparent',
        layers: lower.isBaseImage ? [upper] : [lower, upper],
        brushStrokes: [],
        stageMetrics: mergeMetrics,
      })
      const merged = {
        id: nextLayerId('merged'),
        type: 'image',
        label: `${lower.label} + ${upper.label}`,
        src: mergedSrc,
        x: 50,
        y: 50,
        width: 100,
        opacity: 100,
        rotation: 0,
        blendMode: 'source-over',
      }
      commitHistory()
      setLayers((current) => {
        const next = [...current]
        next.splice(index - 1, 2, merged)
        return next
      })
      setActiveLayerId(merged.id)
      setNotice(`Merged ${upper.label} down into ${lower.label}.`)
    })
    setOpenMenu(null)
  }

  // FILTER MENU
  const handleFilterBlur = () => {
    commitHistory()
    setFilters((prev) => ({ ...prev, blur: Math.min(prev.blur + 5, 20) }))
    setNotice('Blur increased.')
    setOpenMenu(null)
  }

  const handleFilterSharpen = () => sharpenBase()

  const handleFilterGrayscale = () => {
    commitHistory()
    setFilters((prev) => ({ ...prev, grayscale: prev.grayscale === 0 ? 100 : 0 }))
    setNotice('Grayscale toggled.')
    setOpenMenu(null)
  }

  // TOOLS MENU
  const handleToolSelect = (tool) => {
    selectTool(tool)
    setOpenMenu(null)
  }

  // EXPANDED FILE MENU
  const embedProjectImage = async (src) => {
    if (!src || src.startsWith('data:')) return src || ''
    const image = await loadImage(src)
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not embed the project image.')
    context.drawImage(image, 0, 0)
    return canvas.toDataURL('image/png')
  }

  const buildProjectFile = async () => {
    const [imageSrc, savedLayers] = await Promise.all([
      embedProjectImage(selectedImageSrc),
      Promise.all(layers.map(async (layer) => layer.type === 'image' && layer.src
        ? { ...layer, src: await embedProjectImage(layer.src) }
        : { ...layer })),
    ])
    return JSON.stringify(createPhotoProject({
      imageSrc,
      prompt,
      headline,
      subcopy,
      presetId,
      aspectRatio,
      canvasSize: customCanvasSize,
      canvasBackground,
      maskShape,
      cropRect,
      filters,
      hueSat,
      layerMask,
      brushStrokes,
      layers: savedLayers,
      selection: selection ? { src: maskToDataUrl(selection.mask, selection.width, selection.height), width: selection.width, height: selection.height } : null,
      exportFormat,
      exportQuality,
    }))
  }

  const handleFileSave = async (saveAs = false) => {
    setOpenMenu(null)
    try {
      const suggestedName = `${slugify(headline || 'echoai-photo-project')}.echoai`
      let handle = !saveAs ? projectFileHandle : null
      if (!handle && window.showSaveFilePicker) {
        try {
          handle = await window.showSaveFilePicker({
            suggestedName,
            types: [{ description: 'EchoAI Photo Project', accept: { 'application/json': ['.echoai'] } }],
          })
        } catch (error) {
          if (error.name === 'AbortError') return
          throw error
        }
      }
      const contents = await buildProjectFile()
      if (handle) {
        const writable = await handle.createWritable()
        await writable.write(contents)
        await writable.close()
        setProjectFileHandle(handle)
        setNotice(`Saved ${handle.name}.`)
        return
      }
      const link = document.createElement('a')
      link.href = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
      link.download = suggestedName
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
      setNotice('Downloaded a complete EchoAI project copy.')
    } catch (error) {
      if (error.name === 'AbortError') return
      setNotice(`Could not save project: ${error.message}`)
    }
  }

  const loadProjectFile = (file, handle = null) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      void (async () => {
        try {
          const project = parsePhotoProject(event.target?.result || '{}')
          let restoredSelection = null
          if (project.selection?.src) {
            const mask = await dataUrlToMask(project.selection.src, project.selection.width, project.selection.height)
            restoredSelection = { mask, width: project.selection.width, height: project.selection.height, ...selectionOverlayUrls(mask, project.selection.width, project.selection.height) }
          }
          commitHistory()
          setLayers(ensureBaseImageLayer(project.layers, project.imageSrc))
          setActiveLayerId(project.imageSrc ? BASE_IMAGE_LAYER_ID : project.layers[0]?.id ?? '')
          setFilters({ ...DEFAULT_FILTERS, ...project.filters })
          setPresetId(project.presetId)
          setAspectRatio(project.aspectRatio)
          setCustomCanvasSize(normalizeCanvasSize(project.canvasSize))
          setGeneratedImageSrc(project.imageSrc)
          setUploadedImage('')
          setSelectedAssetId('')
          syncBaseImageLayer(project.imageSrc)
          setPrompt(project.prompt)
          setHeadline(project.headline)
          setSubcopy(project.subcopy)
          setCanvasBackground(project.canvasBackground)
          setMaskShape(project.maskShape)
          setCropRect(project.cropRect)
          setHueSat(project.hueSat ?? defaultHueSat())
          setLayerMask(project.layerMask)
          setBrushStrokes(project.brushStrokes)
          setSelection(restoredSelection)
          setExportFormat(project.exportFormat)
          setExportQuality(project.exportQuality)
          setProjectFileHandle(handle)
          setNotice('Project opened with editable layers, image, masks, and adjustments.')
          setCreateDialogOpen(false)
          setWorkspaceView('editor')
        } catch (error) {
          setNotice(`Could not open project: ${error.message}`)
        }
      })()
    }
    reader.onerror = () => setNotice('Could not read that project file.')
    reader.readAsText(file)
  }

  const handleFileOpenProject = async () => {
    setOpenMenu(null)
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [{ description: 'EchoAI Photo Project', accept: { 'application/json': ['.echoai', '.json'] } }],
        })
        loadProjectFile(await handle.getFile(), handle)
      } catch (error) {
        if (error.name !== 'AbortError') setNotice(`Could not open project: ${error.message}`)
      }
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.echoai,application/json'
    input.onchange = (event) => {
      const file = event.target.files?.[0]
      if (file) loadProjectFile(file)
    }
    input.click()
  }

  // EXPANDED EDIT MENU
  const handleEditFillForeground = () => {
    if (resolvedActiveLayerId) {
      commitHistory()
      updateLayer(resolvedActiveLayerId, { color: brushColor })
      setNotice('Filled with brush color.')
    }
    setOpenMenu(null)
  }

  const handleEditFillBackground = () => {
    if (resolvedActiveLayerId) {
      commitHistory()
      updateLayer(resolvedActiveLayerId, { color: canvasBackground })
      setNotice('Filled with background color.')
    }
    setOpenMenu(null)
  }

  // EXPANDED VIEW MENU
  const [showGrid, setShowGrid] = useState(false)
  const [showGuides, setShowGuides] = useState(false)
  const [showRulers, setShowRulers] = useState(false)

  const handleViewToggleGrid = () => {
    setShowGrid((v) => !v)
    setNotice(`Grid ${!showGrid ? 'shown' : 'hidden'}.`)
    setOpenMenu(null)
  }

  const handleViewToggleGuides = () => {
    setShowGuides((v) => !v)
    setNotice(`Guides ${!showGuides ? 'shown' : 'hidden'}.`)
    setOpenMenu(null)
  }

  const handleViewToggleRulers = () => {
    setShowRulers((v) => !v)
    setNotice(`Rulers ${!showRulers ? 'shown' : 'hidden'}.`)
    setOpenMenu(null)
  }

  const handleViewFullScreen = () => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen()
    }
    setOpenMenu(null)
  }

  const handleViewCanvasOnly = () => {
    setLeftSidebarCollapsed(true)
    setRightSidebarCollapsed(true)
    setNotice('Canvas-only mode activated.')
    setOpenMenu(null)
  }

  // EXPANDED IMAGE MENU
  const handleImageCrop = () => {
    setActiveTool('crop')
    setNotice('Crop tool activated. Drag on canvas to define crop area.')
    setOpenMenu(null)
  }

  const handleLayerRenameActive = () => {
    if (resolvedActiveLayerId) {
      const newName = prompt('Enter new layer name:')
      if (newName) {
        commitHistory()
        updateLayer(resolvedActiveLayerId, { label: newName })
        setNotice(`Layer renamed to "${newName}".`)
      }
    }
    setOpenMenu(null)
  }

  // EXPANDED FILTERS MENU
  const handleFilterInvert = () => {
    commitHistory()
    setFilters((prev) => ({ ...prev, invert: prev.invert === 0 ? 100 : 0 }))
    setNotice('Inverted colors.')
    setOpenMenu(null)
  }

  const handleFilterSepia = () => {
    commitHistory()
    setFilters((prev) => ({ ...prev, sepia: prev.sepia === 0 ? 100 : 0 }))
    setNotice('Sepia filter toggled.')
    setOpenMenu(null)
  }

  const handleFilterBrightness = () => {
    commitHistory()
    setFilters((prev) => ({ ...prev, brightness: Math.min(prev.brightness + 20, 150) }))
    setNotice('Brightness increased.')
    setOpenMenu(null)
  }

  const handleFilterContrast = () => {
    commitHistory()
    setFilters((prev) => ({ ...prev, contrast: Math.min(prev.contrast + 20, 150) }))
    setNotice('Contrast increased.')
    setOpenMenu(null)
  }

  const handleFilterSaturation = () => {
    commitHistory()
    setFilters((prev) => ({ ...prev, saturation: Math.min(prev.saturation + 20, 150) }))
    setNotice('Saturation increased.')
    setOpenMenu(null)
  }

  // EXPANDED TOOLS MENU
  const handleToolCrop = () => {
    setActiveTool('crop')
    setNotice('Crop tool selected.')
    setOpenMenu(null)
  }

  const handleToolText = () => {
    addTextLayer()
    setOpenMenu(null)
  }

  const handleToolShape = (shape) => {
    addShapeLayer(shape)
    setOpenMenu(null)
  }

  useEffect(() => {
    if (!stageRef.current) return undefined

    const updateMetrics = () => {
      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect) return
      setStageMetrics((prev) => {
        const next = { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) }
        if (prev.width === next.width && prev.height === next.height) {
          return prev
        }
        return next
      })
    }

    updateMetrics()
    const observer = new ResizeObserver(updateMetrics)
    observer.observe(stageRef.current)
    window.addEventListener('resize', updateMetrics)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateMetrics)
    }
  }, [])

  useEffect(() => {
    if (!stageViewportRef.current) return undefined

    const updateViewport = () => {
      const rect = stageViewportRef.current?.getBoundingClientRect()
      if (!rect) return

      setStageViewportSize((prev) => {
        const next = {
          width: Math.max(260, Math.round(rect.width)),
          height: Math.max(260, Math.round(rect.height)),
        }

        if (prev.width === next.width && prev.height === next.height) {
          return prev
        }

        return next
      })
    }

    updateViewport()
    const observer = new ResizeObserver(updateViewport)
    observer.observe(stageViewportRef.current)
    window.addEventListener('resize', updateViewport)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateViewport)
    }
  }, [])

  useEffect(() => {
    const canvas = paintCanvasRef.current
    if (!canvas) return

    canvas.width = stageMetrics.width
    canvas.height = stageMetrics.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    brushStrokes.forEach((stroke) => drawStroke(ctx, stroke, canvas.width, canvas.height))
  }, [brushStrokes, cropRect, stageMetrics])

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
          return
        }
      }

      if (hueSatDialog || stockLibraryOpen || shortcutsOpen) return

      const mod = event.metaKey || event.ctrlKey
      const code = event.code
      const run = (action) => {
        event.preventDefault()
        action()
      }

      if (mod) {
        if (code === 'KeyZ') return run(() => (event.shiftKey ? redo() : undo()))
        if (code === 'KeyY') return run(redo)
        if (code === 'KeyJ') return run(() => resolvedActiveLayerId && duplicateLayer(resolvedActiveLayerId))
        if (code === 'KeyD') return run(deselect)
        if (code === 'KeyA') return run(selectAll)
        if (code === 'KeyI' && event.shiftKey) return run(invertSelection)
        if (code === 'KeyU') return run(openHueSat)
        if (code === 'KeyE' && event.shiftKey) return run(flattenImage)
        if (code === 'KeyW' && event.shiftKey && event.altKey) return run(() => lateActionsRef.current.exportCanvas?.())
        if (code === 'Equal' || code === 'NumpadAdd') return run(() => setCanvasZoom((value) => clamp(value + 10, 25, 400)))
        if (code === 'Minus' || code === 'NumpadSubtract') return run(() => setCanvasZoom((value) => clamp(value - 10, 25, 400)))
        if (code === 'Digit0' || code === 'Numpad0') return run(() => lateActionsRef.current.resetCanvasView?.())
        return
      }

      if (event.key === '?') return run(() => setShortcutsOpen(true))
      if (event.key === 'Escape') {
        setLassoPoints([])
        setMarquee(null)
        setLayerMenu(null)
        return
      }
      if (event.key === 'Enter' && activeTool === 'polygon' && lassoPoints.length >= 3) return run(() => closePolygon(selectionMode))
      if (event.key === '[') return run(() => setBrushSize((value) => clamp(value - 4, 4, 96)))
      if (event.key === ']') return run(() => setBrushSize((value) => clamp(value + 4, 4, 96)))

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selection && activeWork) return run(deleteSelectedArea)
        if (resolvedActiveLayerId) return run(() => deleteLayer(resolvedActiveLayerId))
        return
      }

      if (event.altKey) return
      const toolKeys = {
        KeyV: 'select',
        KeyM: 'rect-select',
        KeyL: event.shiftKey ? 'polygon' : 'lasso',
        KeyW: event.shiftKey ? 'magic-wand' : 'object-select',
        KeyC: 'crop',
        KeyB: 'brush',
        KeyE: 'eraser',
        KeyJ: 'heal',
        KeyG: 'fill',
      }
      if (toolKeys[code]) return run(() => selectTool(toolKeys[code]))
      if (code === 'KeyT') return run(addTextLayer)
      if (code === 'KeyU') return run(() => addShapeLayer('rectangle'))
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  })

  const getStagePoint = (event) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }

    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    }
  }

  const beginDrag = (layer, event) => {
    if (activeTool !== 'select' && activeTool !== 'move') return
    if (!stageRef.current) return
    event.preventDefault()
    commitHistory()
    const stageRect = stageRef.current.getBoundingClientRect()
    const currentX = (layer.x / 100) * stageRect.width
    const currentY = (layer.y / 100) * stageRect.height

    dragRef.current = {
      layerId: layer.id,
      offsetX: event.clientX - stageRect.left - currentX,
      offsetY: event.clientY - stageRect.top - currentY,
    }

    const handleMove = (moveEvent) => {
      const drag = dragRef.current
      if (!drag || !stageRef.current) return
      const rect = stageRef.current.getBoundingClientRect()
      const nextX = ((moveEvent.clientX - rect.left - drag.offsetX) / rect.width) * 100
      const nextY = ((moveEvent.clientY - rect.top - drag.offsetY) / rect.height) * 100
      setLayers((prev) =>
        prev.map((item) =>
          item.id === drag.layerId
            ? { ...item, x: clamp(nextX, 4, 92), y: clamp(nextY, 6, 88) }
            : item,
        ),
      )
    }

    const handleUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }

  const startBrushStroke = (event) => {
    const painting = activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'heal'
    if (!painting || !paintCanvasRef.current || !stageRef.current) return
    event.preventDefault()
    event.stopPropagation()
    const erase = activeTool === 'eraser'
    const healing = activeTool === 'heal'
    const point = getStagePoint(event)
    const stroke = {
      id: nextLayerId('stroke'),
      erase,
      healing,
      color: brushColor,
      size: brushSize,
      opacity: brushOpacity,
      points: [point],
    }

    brushStrokeRef.current = stroke

    const canvas = paintCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = brushColor
    ctx.lineWidth = brushSize
    ctx.globalAlpha = brushOpacity
    ctx.beginPath()
    const mapped = {
      x: (point.x / 100) * canvas.width,
      y: (point.y / 100) * canvas.height,
    }
    ctx.moveTo(mapped.x, mapped.y)
    ctx.restore()

    const moveStroke = (moveEvent) => {
      if (!brushStrokeRef.current || !paintCanvasRef.current) return
      const nextPoint = getStagePoint(moveEvent)
      const currentStroke = brushStrokeRef.current
      const lastPoint = currentStroke.points[currentStroke.points.length - 1]
      currentStroke.points.push(nextPoint)

      if (currentStroke.healing) return
      const moveCanvas = paintCanvasRef.current
      const moveCtx = moveCanvas.getContext('2d')
      if (!moveCtx) return
      moveCtx.save()
      moveCtx.globalCompositeOperation = currentStroke.erase ? 'destination-out' : 'source-over'
      moveCtx.lineCap = 'round'
      moveCtx.lineJoin = 'round'
      moveCtx.strokeStyle = currentStroke.color
      moveCtx.lineWidth = currentStroke.size
      moveCtx.globalAlpha = currentStroke.opacity
      moveCtx.beginPath()
      const from = {
        x: (lastPoint.x / 100) * moveCanvas.width,
        y: (lastPoint.y / 100) * moveCanvas.height,
      }
      const to = {
        x: (nextPoint.x / 100) * moveCanvas.width,
        y: (nextPoint.y / 100) * moveCanvas.height,
      }
      moveCtx.moveTo(from.x, from.y)
      moveCtx.lineTo(to.x, to.y)
      moveCtx.stroke()
      moveCtx.restore()
    }

    const finishStroke = async () => {
      const completedStroke = brushStrokeRef.current
      if (completedStroke) {
        commitHistory()
        if (completedStroke.healing) {
          if (!selectedImageSrc) {
            setNotice('Load an image before using Heal.')
          } else {
            try {
              const healedSrc = await healImage({
                imageSrc: selectedImageSrc,
                points: completedStroke.points,
                brushSize,
                stageMetrics,
              })
              setGeneratedImageSrc(healedSrc)
              syncBaseImageLayer(healedSrc)
              setUploadedImage('')
              setSelectedAssetId('')
              setNotice('Healed the selected area in the image pixels.')
            } catch (error) {
              setNotice(error.message)
            }
          }
        } else if (completedStroke.erase) {
          if (!activeWork) {
            setNotice('Load an image before using Eraser.')
          } else {
            const canvas = document.createElement('canvas')
            canvas.width = activeWork.width
            canvas.height = activeWork.height
            const ctx = canvas.getContext('2d')
            if (!ctx) {
              setNotice('The eraser is unavailable in this browser.')
            } else {
              ctx.putImageData(cloneImageData(activeWork.imageData), 0, 0)
              ctx.globalCompositeOperation = 'destination-out'
              ctx.lineCap = 'round'
              ctx.lineJoin = 'round'
              ctx.lineWidth = brushSize * ((activeWork.width / stageMetrics.width + activeWork.height / stageMetrics.height) / 2)
              ctx.beginPath()
              completedStroke.points.forEach((point, index) => {
                const x = (point.x / 100) * activeWork.width
                const y = (point.y / 100) * activeWork.height
                if (index === 0) ctx.moveTo(x, y)
                else ctx.lineTo(x, y)
              })
              if (completedStroke.points.length === 1) {
                const point = completedStroke.points[0]
                const x = (point.x / 100) * activeWork.width
                const y = (point.y / 100) * activeWork.height
                ctx.moveTo(x + 0.01, y)
                ctx.lineTo(x, y)
              }
              ctx.stroke()
              const erasedSrc = imageDataToDataUrl(ctx.getImageData(0, 0, activeWork.width, activeWork.height))
              setGeneratedImageSrc(erasedSrc)
              syncBaseImageLayer(erasedSrc)
              setUploadedImage('')
              setSelectedAssetId('')
              setNotice('Erased pixels from the original image.')
            }
          }
        } else {
          setBrushStrokes((prev) => [...prev, completedStroke])
        }
      }
      brushStrokeRef.current = null
      window.removeEventListener('pointermove', moveStroke)
      window.removeEventListener('pointerup', finishStroke)
      window.removeEventListener('pointercancel', finishStroke)
    }

    window.addEventListener('pointermove', moveStroke)
    window.addEventListener('pointerup', finishStroke)
    window.addEventListener('pointercancel', finishStroke)
  }

  const handleCanvasWheel = (event) => {
    if (!event.ctrlKey || !stageViewportRef.current) return
    event.preventDefault()

    const viewportRect = stageViewportRef.current.getBoundingClientRect()
    const cursor = {
      x: event.clientX - viewportRect.left - viewportRect.width / 2,
      y: event.clientY - viewportRect.top - viewportRect.height / 2,
    }
    const currentScale = canvasZoom / 100
    const nextZoom = clamp(canvasZoom + (event.deltaY < 0 ? 10 : -10), 25, 400)
    const nextScale = nextZoom / 100

    setCanvasPan((currentPan) => ({
      x: cursor.x - ((cursor.x - currentPan.x) / currentScale) * nextScale,
      y: cursor.y - ((cursor.y - currentPan.y) / currentScale) * nextScale,
    }))
    setCanvasZoom(nextZoom)
  }

  const startCanvasPan = (event) => {
    if (!event.ctrlKey || event.button !== 2) return
    event.preventDefault()
    event.stopPropagation()
    canvasPanRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: canvasPan.x,
      originY: canvasPan.y,
    }

    const moveCanvas = (moveEvent) => {
      if (!canvasPanRef.current) return
      setCanvasPan({
        x: canvasPanRef.current.originX + moveEvent.clientX - canvasPanRef.current.startX,
        y: canvasPanRef.current.originY + moveEvent.clientY - canvasPanRef.current.startY,
      })
    }

    const finishCanvasPan = () => {
      canvasPanRef.current = null
      window.removeEventListener('pointermove', moveCanvas)
      window.removeEventListener('pointerup', finishCanvasPan)
      window.removeEventListener('pointercancel', finishCanvasPan)
    }

    window.addEventListener('pointermove', moveCanvas)
    window.addEventListener('pointerup', finishCanvasPan)
    window.addEventListener('pointercancel', finishCanvasPan)
  }

  const resetCanvasView = () => {
    setCanvasZoom(100)
    setCanvasPan({ x: 0, y: 0 })
  }

  useEffect(() => {
    const viewport = stageViewportRef.current
    if (!viewport) return undefined

    const handleWheel = (event) => handleCanvasWheel(event)
    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  })

  const startRemoveArea = (event) => {
    if (activeTool !== 'remove' || !stageRef.current || !selectedImageSrc) return
    event.preventDefault()
    event.stopPropagation()
    const start = getStagePoint(event)
    removeDragRef.current = { start }
    const move = (moveEvent) => {
      const end = getStagePoint(moveEvent)
      const x = Math.min(start.x, end.x)
      const y = Math.min(start.y, end.y)
      const nextRect = { x, y, w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) }
      removeDragRef.current.rect = nextRect
      setRemoveRect(nextRect)
    }
    const finish = async () => {
      const rect = removeDragRef.current?.rect
      removeDragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      if (!rect || rect.w < 1 || rect.h < 1) return
      commitHistory()
      try {
        const removedSrc = await removeImageArea({ imageSrc: selectedImageSrc, rect, stageMetrics })
        setGeneratedImageSrc(removedSrc)
        syncBaseImageLayer(removedSrc)
        setUploadedImage('')
        setSelectedAssetId('')
        setRemoveRect(null)
        setNotice('Removed the selected area from the image. Use Undo if you need the original back.')
      } catch (error) {
        setNotice(error.message)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
  }

  const updateCropRect = (nextRect) => {
    setCropRect((prev) => {
      const merged = { ...prev, ...nextRect }
      const width = clamp(merged.w, 20, 100)
      const height = clamp(merged.h, 20, 100)
      const x = clamp(merged.x, 0, 100 - width)
      const y = clamp(merged.y, 0, 100 - height)
      return { x, y, w: width, h: height }
    })
  }

  const startCropDrag = (event, mode = 'move') => {
    if (activeTool !== 'crop') return
    event.preventDefault()
    event.stopPropagation()
    commitHistory()
    cropDragRef.current = {
      mode,
      startPoint: getStagePoint(event),
      startRect: cropRect,
    }

    const moveCrop = (moveEvent) => {
      if (!cropDragRef.current) return
      const currentPoint = getStagePoint(moveEvent)
      const deltaX = currentPoint.x - cropDragRef.current.startPoint.x
      const deltaY = currentPoint.y - cropDragRef.current.startPoint.y
      const { startRect: rect, mode: dragMode } = cropDragRef.current

      if (dragMode === 'move') {
        updateCropRect({ x: rect.x + deltaX, y: rect.y + deltaY })
        return
      }

      const resizeMap = {
        nw: { x: rect.x + deltaX, y: rect.y + deltaY, w: rect.w - deltaX, h: rect.h - deltaY },
        ne: { y: rect.y + deltaY, w: rect.w + deltaX, h: rect.h - deltaY },
        sw: { x: rect.x + deltaX, w: rect.w - deltaX, h: rect.h + deltaY },
        se: { w: rect.w + deltaX, h: rect.h + deltaY },
      }

      updateCropRect(resizeMap[dragMode] ?? rect)
    }

    const endCropDrag = () => {
      cropDragRef.current = null
      window.removeEventListener('pointermove', moveCrop)
      window.removeEventListener('pointerup', endCropDrag)
      window.removeEventListener('pointercancel', endCropDrag)
    }

    window.addEventListener('pointermove', moveCrop)
    window.addEventListener('pointerup', endCropDrag)
    window.addEventListener('pointercancel', endCropDrag)
  }

  const clearBaseImage = () => {
    setGeneratedImageSrc('')
    setUploadedImage('')
    setSelectedAssetId('')
    syncBaseImageLayer('')
    setActiveTool('select')
    setNotice('Base image cleared. The canvas is ready for a new upload.')
  }

  const useLibraryImage = () => {
    const firstImage = imageAssets[0]
    if (!firstImage) {
      setNotice('Your workspace has no image assets yet.')
      return
    }
    setSelectedAssetId(firstImage.id)
    setUploadedImage('')
    setGeneratedImageSrc('')
    syncBaseImageLayer(firstImage.previewUrl, firstImage.name || 'Original photo')
    setNotice(`Using ${firstImage.name} as the base image.`)
  }

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    importImageFile(file)
    setActiveTool('heal')
    event.target.value = ''
  }

  const resetEditor = () => {
    commitHistory()
    setPrompt('')
    setPresetId('editorial')
    setAspectRatio('4:5')
    setCustomCanvasSize(null)
    setHeadline('')
    setSubcopy('')
    setGeneratedImageSrc('')
    setUploadedImage('')
    setSelectedAssetId('')
    setFilters(DEFAULT_FILTERS)
    setCanvasBackground('#ffffff')
    setBrushStrokes([])
    setCropRect({ x: 0, y: 0, w: 100, h: 100 })
    setLayers([])
    setActiveLayerId('')
    setCanvasZoom(100)
    setCanvasPan({ x: 0, y: 0 })
    setActiveTool('select')
    setNotice('New blank workspace ready for upload.')
  }

  const addFromStockLibrary = async (item, placement) => {
    const extension = item.url.split('?')[0].split('.').pop().toLowerCase()
    const dataUrl = await downloadMediaLibraryDataUrl(item.url, extension === 'png' ? 'image/png' : 'image/jpeg')
    const label = item.title.split(',')[0].trim() || 'Stock image'
    if (placement === 'background') {
      commitHistory()
      setUploadedImage(dataUrl)
      setGeneratedImageSrc('')
      setSelectedAssetId('')
      syncBaseImageLayer(dataUrl, label)
      setNotice(`Using "${label}" from Pixabay as the background.`)
    } else {
      addLayer({
        id: nextLayerId('stock'),
        type: 'image',
        label,
        src: dataUrl,
        value: label,
        x: 50,
        y: 50,
        width: 50,
        opacity: 100,
        rotation: 0,
      })
      setNotice(`Added "${label}" as a layer. Drag it to position and resize it in the layer panel.`)
    }
    setCreateDialogOpen(false)
    setWorkspaceView('editor')
    setStockLibraryOpen(false)
  }

  const addLogoLayer = (logo) => {
    addLayer({
      id: nextLayerId('logo'),
      type: 'image',
      label: logo.label || 'Logo',
      src: logo.dataUrl,
      value: logo.label || 'Logo',
      x: 82,
      y: 88,
      width: 18,
      opacity: 100,
      rotation: 0,
    })
    setNotice(`Added the ${logo.label} logo.`)
  }

  const applyBrandColor = (value) => {
    if (!resolvedActiveLayerId) return
    commitHistory()
    updateLayer(resolvedActiveLayerId, { color: value })
    setNotice('Applied a brand colour to the selected layer.')
  }

  const applyBrandFont = (family) => {
    if (!resolvedActiveLayerId) return
    commitHistory()
    updateLayer(resolvedActiveLayerId, { fontFamily: family })
    setNotice(family ? `Set the layer font to ${family}.` : 'Reset the layer font.')
  }

  const addStickerLayer = (sticker) => {
    addLayer({
      id: nextLayerId('sticker'),
      type: 'sticker',
      label: 'Sticker',
      value: sticker,
      x: 82,
      y: 72,
      fontSize: 56,
      weight: 700,
      color: preset.accent,
      align: 'center',
      opacity: 100,
      rotation: 0,
    })
    setNotice('Sticker added to the layout.')
  }

  const updateTextEffect = (patch) => {
    if (!activeTextLayer) return
    commitHistory()
    updateLayer(activeTextLayer.id, patch)
  }

  const exportCanvas = async (formatKey) => {
    // Canvas silently falls back to a default face if a brand font is still
    // loading, so wait for the font set to settle first.
    if (document.fonts?.ready) {
      await document.fonts.ready
    }

    const stageCanvas = document.createElement('canvas')
    stageCanvas.width = stageMetrics.width
    stageCanvas.height = stageMetrics.height
    const stageDataUrl = await renderComposition({
      canvas: stageCanvas,
      imageSrc: renderedImageSrc,
      maskShape,
      filters,
      preset,
      backgroundColor: canvasBackground,
      layers,
      brushStrokes,
      stageMetrics,
      imageOpacity: baseImageLayer?.opacity,
    })

    const exportCanvasEl = document.createElement('canvas')
    exportCanvasEl.width = aspect.canvasWidth
    exportCanvasEl.height = aspect.canvasHeight
    const exportCtx = exportCanvasEl.getContext('2d')

    if (!exportCtx) {
      setNotice('Canvas export is unavailable in this browser.')
      return
    }

    exportCtx.fillStyle = canvasBackground || preset.base
    if (canvasBackground !== 'transparent') exportCtx.fillRect(0, 0, exportCanvasEl.width, exportCanvasEl.height)

    const stageImage = await loadImage(stageDataUrl)
    const sourceX = (cropRect.x / 100) * stageMetrics.width
    const sourceY = (cropRect.y / 100) * stageMetrics.height
    const sourceWidth = (cropRect.w / 100) * stageMetrics.width
    const sourceHeight = (cropRect.h / 100) * stageMetrics.height
    exportCtx.drawImage(stageImage, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, exportCanvasEl.width, exportCanvasEl.height)

    const format = EXPORT_FORMATS[typeof formatKey === 'string' ? formatKey : exportFormat] ?? EXPORT_FORMATS.png

    // JPEG has no alpha, so anything transparent would render black without this.
    if (format.mime === 'image/jpeg') {
      exportCtx.globalCompositeOperation = 'destination-over'
      exportCtx.fillStyle = canvasBackground === 'transparent' ? '#ffffff' : preset.base
      exportCtx.fillRect(0, 0, exportCanvasEl.width, exportCanvasEl.height)
      exportCtx.globalCompositeOperation = 'source-over'
    }

    const exportName = `${slugify(headline || prompt)}-${aspectRatio.replace(':', 'x')}.${format.extension}`
    const dataUrl = format.lossy
      ? exportCanvasEl.toDataURL(format.mime, clamp(exportQuality, 10, 100) / 100)
      : exportCanvasEl.toDataURL(format.mime)

    onExport?.({
      exportName,
      dataUrl,
      prompt,
      caption: subcopy,
      headline,
      palette: preset.label,
      aspectRatio,
      sizeBytes: Math.max(300000, Math.round(dataUrl.length * 0.72)),
      summary: `Photo design exported from the ${preset.label} preset.`,
    })

    const link = document.createElement('a')
    link.href = dataUrl
    link.download = exportName
    link.click()
    setNotice(`Exported ${exportName} and sent it to your workspace.`)
  }

  const handlePrint = () => {
    setOpenMenu(null)
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      setNotice('Allow pop-ups for this site to print your artwork.')
      return
    }
    void (async () => {
      try {
        if (document.fonts?.ready) await document.fonts.ready
        const stageCanvas = document.createElement('canvas')
        stageCanvas.width = stageMetrics.width
        stageCanvas.height = stageMetrics.height
        const stageDataUrl = await renderComposition({
          canvas: stageCanvas,
          imageSrc: renderedImageSrc,
          maskShape,
          filters,
          preset,
          backgroundColor: canvasBackground,
          layers,
          brushStrokes,
          stageMetrics,
          imageOpacity: baseImageLayer?.opacity,
        })
        const output = document.createElement('canvas')
        output.width = aspect.canvasWidth
        output.height = aspect.canvasHeight
        const context = output.getContext('2d')
        if (!context) throw new Error('Print rendering is unavailable in this browser.')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, output.width, output.height)
        const image = await loadImage(stageDataUrl)
        context.drawImage(
          image,
          (cropRect.x / 100) * stageMetrics.width,
          (cropRect.y / 100) * stageMetrics.height,
          (cropRect.w / 100) * stageMetrics.width,
          (cropRect.h / 100) * stageMetrics.height,
          0,
          0,
          output.width,
          output.height,
        )
        printWindow.document.title = headline || 'EchoAI Photo Editor'
        printWindow.document.body.replaceChildren()
        printWindow.document.body.style.cssText = 'margin:0;display:grid;place-items:center;min-height:100vh;background:#fff'
        const printImage = printWindow.document.createElement('img')
        printImage.alt = headline || 'Photo Editor artwork'
        printImage.style.cssText = 'display:block;max-width:100vw;max-height:100vh;object-fit:contain'
        printImage.onload = () => {
          printWindow.focus()
          printWindow.print()
          printWindow.onafterprint = () => printWindow.close()
        }
        printImage.src = output.toDataURL('image/png')
        printWindow.document.body.append(printImage)
      } catch (error) {
        printWindow.close()
        setNotice(`Could not prepare print: ${error.message}`)
      }
    })()
  }

  useEffect(() => {
    lateActionsRef.current = { exportCanvas, resetCanvasView }
  })

  const runMenuAction = (action) => {
    setLayerMenu(null)
    action()
  }
  const menuLayer = layerMenu && layerMenu.layerId !== '__photo' ? layers.find((item) => item.id === layerMenu.layerId) ?? null : null

  const startHomeDesign = (design = '4:5') => {
    resetDocument('New canvas ready. Choose a tool to begin.')
    if (typeof design === 'string') {
      setAspectRatio(design)
      setCustomCanvasSize(null)
    } else {
      const size = normalizeCanvasSize({ width: design.width, height: design.height, label: design.label })
      if (!size) return
      setCustomCanvasSize(size)
      setAspectRatio('custom')
      setNotice(`${size.label} canvas created at ${size.width} × ${size.height} px.`)
    }
    setCreateDialogOpen(false)
    setWorkspaceView('editor')
  }

  const openWorkspaceAsset = (asset) => {
    if (asset.type === 'design' && asset.projectMetadata) {
      openSavedDesign(asset)
      return
    }
    projectIdRef.current = newProjectId()
    setSelectedAssetId(asset.id)
    setUploadedImage('')
    setGeneratedImageSrc('')
    syncBaseImageLayer(asset.previewUrl, asset.name || 'Original photo')
    setNotice(`Opened ${asset.name} from your workspace.`)
    setWorkspaceView('editor')
  }

  const openSavedDesign = (asset) => {
    const project = asset.projectMetadata
    if (!project) return
    resetDocument(`${asset.name} loaded. Every layer remains editable.`)
    projectIdRef.current = project.projectId || asset.id
    setLayers(ensureBaseImageLayer(project.layers, project.imageSrc))
    setActiveLayerId(project.imageSrc ? BASE_IMAGE_LAYER_ID : project.layers?.[0]?.id || '')
    setFilters({ ...DEFAULT_FILTERS, ...project.filters })
    setPresetId(project.presetId || 'aurora')
    setAspectRatio(project.aspectRatio || '4:5')
    setCustomCanvasSize(normalizeCanvasSize(project.canvasSize))
    setGeneratedImageSrc(project.imageSrc || '')
    setPrompt(project.prompt || DEFAULT_PROMPT)
    setHeadline(project.headline || '')
    setSubcopy(project.subcopy || '')
    setCanvasBackground(project.canvasBackground || '#ffffff')
    setMaskShape(project.maskShape || 'none')
    setCropRect(project.cropRect || { x: 0, y: 0, w: 100, h: 100 })
    setHueSat(project.hueSat ?? defaultHueSat())
    setLayerMask(project.layerMask ?? null)
    setBrushStrokes(project.brushStrokes || [])
    setExportFormat(project.exportFormat || 'png')
    setExportQuality(project.exportQuality ?? 92)
    setWorkspaceView('editor')
  }

  const normalizedHomeSearch = homeSearch.trim().toLowerCase()
  const visibleHomeFormats = PHOTO_HOME_FORMATS.filter((item) => item.label.toLowerCase().includes(normalizedHomeSearch))
  const visibleHomeAssets = imageAssets.filter((asset) => asset.name.toLowerCase().includes(normalizedHomeSearch)).slice(0, 6)
  const visibleStarters = PHOTO_EDITOR_TEMPLATES.filter((item) => {
    if (item.category === 'Logos') return false
    const matchesSearch = `${item.title} ${item.category} ${item.platform || ''} ${item.headline} ${item.subcopy}`.toLowerCase().includes(normalizedHomeSearch)
    const matchesCategory = templateCategory === 'All' || item.category === templateCategory
    const matchesPlatform = templatePlatform === 'All' || item.platform === templatePlatform
    return matchesSearch && matchesCategory && matchesPlatform
  })
  const normalizedLogoSearch = logoSearch.trim().toLowerCase()
  const visibleLogos = LOGO_EDITOR_TEMPLATES.filter((item) => (
    (logoIndustry === 'All' || item.industry === logoIndustry)
    && `${item.title} ${item.industry} ${item.keywords.join(' ')}`.toLowerCase().includes(normalizedLogoSearch)
  ))
  const normalizedCreateSearch = createSearch.trim().toLowerCase()
  const visibleCreateFormats = PHOTO_DESIGN_PRESETS.filter((item) => {
    const matchesSearch = item.label.toLowerCase().includes(normalizedCreateSearch)
      || item.category.toLowerCase().includes(normalizedCreateSearch)
    if (!matchesSearch) return false
    const matchesPlatform = createCategory !== 'Social media' || createPlatform === 'all' || item.platform === createPlatform
    return matchesPlatform && (normalizedCreateSearch || createCategory === 'For you' || item.category === createCategory)
  }).slice(0, createCategory === 'For you' && !normalizedCreateSearch ? 12 : undefined)
  const createCustomDesign = () => startHomeDesign({ width: customWidth, height: customHeight, label: 'Custom' })

  const applyPhotoTemplate = (template) => {
    resetDocument(`${template.title} template loaded.`)
    setCustomCanvasSize({ width: template.width, height: template.height, label: template.title })
    setAspectRatio('custom')
    setCanvasBackground(template.colors[0])
    setLayers(photoTemplateLayers(template))
    setActiveLayerId('headline')
    setHeadline(template.headline)
    setSubcopy(template.subcopy)
    setPrompt(template.title)
    setNotice(`${template.title} loaded. Every layer is editable · ${template.license.shortName}.`)
    setWorkspaceView('editor')
  }

  const startSchoolPractice = (course) => {
    const template = PHOTO_EDITOR_TEMPLATES.find((item) => item.key === course?.practice?.templateKey)
    if (!template) {
      setWorkspaceView('home')
      return
    }
    applyPhotoTemplate(template)
    setSchoolPractice(course)
    setSchoolCourseId(course.id)
    setSchoolPracticeCompleted(false)
    setRightSidebarCollapsed(false)
    setActiveTool(course.practice.tool)
    setActiveLayerId(course.practice.activeLayerId)
    setBrushColor(template.colors[1])
    setNotice(`${course.title} practice is ready. Follow the checklist in the inspector.`)
    if (course.practice.openStock) setStockLibraryOpen(true)
  }

  const completeSchoolPractice = () => {
    if (!schoolPractice) return
    let completed
    try {
      completed = JSON.parse(localStorage.getItem('echoai-design-school-progress') || '[]')
    } catch {
      completed = []
    }
    localStorage.setItem('echoai-design-school-progress', JSON.stringify([...new Set([...completed, schoolPractice.id])]))
    setSchoolPracticeCompleted(true)
    setNotice(`${schoolPractice.title} practice completed.`)
  }

  const openEditorPanel = (panel, tool = null) => {
    setEditorPanel(panel)
    if (tool) setActiveTool(tool)
  }

  const setCropAspect = (targetWidth, targetHeight) => {
    commitHistory()
    const canvasRatio = aspect.canvasWidth / aspect.canvasHeight
    const targetRatio = targetWidth / targetHeight
    let width = 90
    let height = 90
    if (targetRatio > canvasRatio) height = width * canvasRatio / targetRatio
    else width = height * targetRatio / canvasRatio
    setCropRect({ x: (100 - width) / 2, y: (100 - height) / 2, w: width, h: height })
    setActiveTool('crop')
  }

  const smartCrop = () => {
    if (!activeWork || !imageFit) {
      setNotice('Add a photo before using Smart crop.')
      return
    }
    withBusy('Finding the subject…', () => {
      const result = selectSubjectMask(activeWork.imageData)
      if (result.confidence === 'low') {
        setNotice('No clear subject found. Use Freeform crop to frame the image manually.')
        return
      }
      let minX = activeWork.width
      let minY = activeWork.height
      let maxX = 0
      let maxY = 0
      for (let index = 0; index < result.mask.length; index += 1) {
        if (result.mask[index] < 128) continue
        const x = index % activeWork.width
        const y = Math.floor(index / activeWork.width)
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
      const padding = 4
      const x = ((imageFit.x + (minX / activeWork.width) * imageFit.width) / stageDisplaySize.width) * 100
      const y = ((imageFit.y + (minY / activeWork.height) * imageFit.height) / stageDisplaySize.height) * 100
      const width = (((maxX - minX) / activeWork.width) * imageFit.width / stageDisplaySize.width) * 100
      const height = (((maxY - minY) / activeWork.height) * imageFit.height / stageDisplaySize.height) * 100
      commitHistory()
      setCropRect({ x: clamp(x - padding, 0, 96), y: clamp(y - padding, 0, 96), w: clamp(width + padding * 2, 4, 100), h: clamp(height + padding * 2, 4, 100) })
      setActiveTool('crop')
      setNotice('Smart crop framed the detected subject. Drag the crop handles to refine it.')
    })
  }

  const applyFilterPreset = (name, patch) => {
    commitHistory()
    setFilters({ ...NEUTRAL_FILTERS, ...patch })
    setNotice(`${name} filter applied.`)
  }

  const applyShadowPreset = (preset) => {
    commitHistory()
    setFilters((current) => ({ ...current, ...preset.patch }))
    setNotice(`${preset.label} shadow applied.`)
  }

  const buildProjectPayload = () => ({
    imageSrc: selectedImageSrc,
    prompt,
    headline,
    subcopy,
    presetId,
    aspectRatio,
    canvasSize: customCanvasSize,
    canvasBackground,
    maskShape,
    cropRect,
    filters,
    hueSat,
    layerMask,
    brushStrokes,
    layers,
    selection: null,
    exportFormat,
    exportQuality,
  })

  const persistLocalProject = () => {
    const serialized = JSON.stringify(createPhotoProject(buildProjectPayload()))
    try {
      localStorage.setItem('echoai-photo-autosave', serialized)
      setAutosavedProject(parsePhotoProject(serialized))
      setSaveStatus('Autosaved')
    } catch {
      setSaveStatus('Save locally')
      setNotice('This project is too large for browser autosave. Use Advanced → File → Save Project to keep a complete copy.')
    }
  }

  const saveToProjectsLibrary = async () => {
    if (!onSaveProject) return
    const hasDocument = Boolean(selectedImageSrc || layers.length || brushStrokes.length)
    if (!hasDocument) return
    try {
      const canvas = document.createElement('canvas')
      const thumbWidth = 480
      const thumbHeight = Math.max(1, Math.round(thumbWidth * (aspect.canvasHeight / aspect.canvasWidth)))
      canvas.width = thumbWidth
      canvas.height = thumbHeight
      const previewUrl = await renderComposition({
        canvas,
        imageSrc: renderedImageSrc,
        maskShape,
        filters,
        preset,
        backgroundColor: canvasBackground,
        layers,
        brushStrokes,
        stageMetrics: { width: thumbWidth, height: thumbHeight },
      })
      onSaveProject({
        ...buildProjectPayload(),
        projectId: projectIdRef.current,
        name: headline?.trim() || prompt?.trim() || 'Untitled design',
        previewUrl,
        folderId: projectsFolderId || null,
        sizeBytes: Math.round(previewUrl.length * 0.72),
      })
    } catch {
      // A thumbnail failure should not block the local autosave from succeeding.
    }
  }

  const commitSave = () => {
    persistLocalProject()
    saveToProjectsLibrary()
  }

  useEffect(() => {
    if (workspaceView !== 'editor') return undefined
    const timer = window.setTimeout(() => {
      const serialized = JSON.stringify(createPhotoProject(buildProjectPayload()))
      try {
        localStorage.setItem('echoai-photo-autosave', serialized)
        setAutosavedProject(parsePhotoProject(serialized))
        setSaveStatus('Autosaved')
      } catch {
        setSaveStatus('Save locally')
      }
    }, 700)
    return () => window.clearTimeout(timer)
  // The payload helper reads the same editor state already listed below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspectRatio, brushStrokes, canvasBackground, cropRect, customCanvasSize, exportFormat, exportQuality, filters, headline, hueSat, layerMask, layers, maskShape, presetId, prompt, selectedImageSrc, subcopy, workspaceView])

  const modernToolPanel = (
    <div className="photo-modern-tools">
      {editorPanel === 'main' ? (
        <>
          <div className="modern-tools-heading"><div><span>Edit image</span><strong>Tools</strong></div><button type="button" onClick={() => { commitSave(); setWorkspaceView('home') }} aria-label="Return to Photo home"><X size={18} /></button></div>
          <div className="modern-select-group"><span>Select</span><div><button type="button" onClick={() => { selectAll(); setActiveTool('rect-select') }}><Images size={15} /> All</button><button type="button" onClick={() => openEditorPanel('select', 'object-select')}><Sparkles size={15} /> Element</button><button type="button" onClick={() => openEditorPanel('select', 'rect-select')}><Wand size={15} /> Area</button></div></div>
          <div className="modern-media-actions" aria-label="Add image">
            <button type="button" onClick={() => uploadInputRef.current?.click()}><Upload size={16} /><span><strong>Upload image</strong><small>Use a file from your device</small></span></button>
            <button type="button" onClick={() => setStockLibraryOpen(true)}><Images size={16} /><span><strong>Add image</strong><small>Browse photos, illustrations, or vectors</small></span></button>
          </div>
          <div className="modern-tool-rows">
            <button type="button" onClick={() => openEditorPanel('crop', 'crop')}><Crop size={18} /><span><strong>Crop</strong><small>Frame, rotate, and resize</small></span><ChevronRight size={16} /></button>
            <button type="button" onClick={() => openEditorPanel('erase', 'eraser')}><Eraser size={18} /><span><strong>Pixel eraser</strong><small>Erase or heal image areas</small></span><ChevronRight size={16} /></button>
          </div>
          <div className="modern-tool-section"><div className="modern-section-heading"><strong>Tools</strong><button type="button" onClick={() => setEditorPanel('advanced')}>See all</button></div><div className="modern-tool-grid">
            <button type="button" onClick={() => openEditorPanel('adjust')}><span className="modern-tool-art adjust"><SlidersHorizontal size={23} /></span><small>Adjust</small></button>
            <button type="button" onClick={() => openEditorPanel('select', 'object-select')}><span className="modern-tool-art magic"><Sparkles size={23} /></span><small>Magic select</small></button>
            <button type="button" onClick={sharpenBase}><span className="modern-tool-art upscale"><Expand size={23} /></span><small>Sharpen</small></button>
            <button type="button" onClick={removeBackground}><span className="modern-tool-art remove"><Images size={23} /></span><small>BG remover</small></button>
            <button type="button" onClick={() => openEditorPanel('erase', 'eraser')}><span className="modern-tool-art erase"><Eraser size={23} /></span><small>Magic eraser</small></button>
            <button type="button" onClick={() => setStockLibraryOpen(true)}><span className="modern-tool-art stock"><ImageIcon size={23} /></span><small>Stock image</small></button>
            <button type="button" onClick={() => openEditorPanel('create')}><span className="modern-tool-art create"><Type size={23} /></span><small>Text & shapes</small></button>
            <button type="button" onClick={() => openEditorPanel('draw', 'brush')}><span className="modern-tool-art draw"><Paintbrush size={23} /></span><small>Draw</small></button>
          </div></div>
          <div className="modern-tool-section"><div className="modern-section-heading"><strong>Filters</strong><button type="button" onClick={() => openEditorPanel('filters')}>See all</button></div><div className="modern-filter-strip">
            {PHOTO_FILTER_PRESETS.slice(0, 3).map((preset) => <button key={preset.key} type="button" onClick={() => applyFilterPreset(preset.label, preset.patch)}><span style={{ backgroundImage: selectedImageSrc ? `url(${selectedImageSrc})` : undefined, filter: buildFilterString({ ...NEUTRAL_FILTERS, ...preset.patch }) }} />{preset.label}</button>)}
            <button type="button" className="modern-strip-next" onClick={() => openEditorPanel('filters')} aria-label="See all filters"><ChevronRight size={18} /></button>
          </div></div>
          <div className="modern-tool-section"><div className="modern-section-heading"><strong>Shadows</strong><button type="button" onClick={() => openEditorPanel('shadows')}>See all</button></div><div className="modern-shadow-strip">
            {PHOTO_SHADOW_PRESETS.slice(0, 3).map((preset) => <button key={preset.key} type="button" onClick={() => applyShadowPreset(preset)}><span style={{ filter: preset.patch.shadowBlur ? `drop-shadow(${preset.patch.shadowX}px ${preset.patch.shadowY}px ${preset.patch.shadowBlur}px ${preset.patch.shadowColor})` : 'none' }} />{preset.label}</button>)}
            <button type="button" className="modern-strip-next" onClick={() => openEditorPanel('shadows')} aria-label="See all shadows"><ChevronRight size={18} /></button>
          </div></div>
          <div className="modern-panel-footer"><button type="button" onClick={() => { setRightSidebarCollapsed(false); setEditorPanel('layers') }}><Layers3 size={16} /> Layers</button><button type="button" onClick={() => setEditorPanel('advanced')}><Keyboard size={16} /> Advanced</button></div>
        </>
      ) : (
        <>
          <div className="modern-context-heading"><button type="button" onClick={() => setEditorPanel('main')} aria-label="Back to all tools"><ArrowLeft size={18} /></button><strong>{{ crop: 'Crop', adjust: 'Adjust', filters: 'Filters', shadows: 'Shadows', erase: 'Erase & heal', select: 'Select', draw: 'Draw & fill', create: 'Text & shapes', layers: 'Layers' }[editorPanel] || 'Tools'}</strong></div>
          {editorPanel === 'crop' && <div className="modern-context-body"><button type="button" className="modern-smart-action" onClick={smartCrop}><Sparkles size={17} /> Smart crop</button><label className="modern-context-label">Aspect ratio</label><div className="modern-aspect-grid"><button type="button" onClick={() => setActiveTool('crop')}><Crop size={20} />Freeform</button><button type="button" onClick={() => { commitHistory(); setCropRect({ x: 0, y: 0, w: 100, h: 100 }); setActiveTool('crop') }}><ImageIcon size={20} />Original</button><button type="button" onClick={() => setCropAspect(1, 1)}><Square size={20} />1:1</button><button type="button" onClick={() => setCropAspect(4, 5)}><PanelsTopLeft size={20} />4:5</button></div><label className="modern-context-label">Rotate</label><div className="modern-action-pair"><button type="button" onClick={() => transformBase('rotate-ccw', 'Rotated 90° counter-clockwise.')}><RotateCcw size={16} /> Left</button><button type="button" onClick={() => transformBase('rotate-cw', 'Rotated 90° clockwise.')}><RotateCcw size={16} className="rotate-right" /> Right</button></div><label className="modern-context-label">Flip</label><div className="modern-action-pair"><button type="button" onClick={() => transformBase('flip-h', 'Flipped horizontally.')}>Horizontal</button><button type="button" onClick={() => transformBase('flip-v', 'Flipped vertically.')}>Vertical</button></div><div className="modern-context-footer"><button type="button" onClick={() => setCropRect({ x: 0, y: 0, w: 100, h: 100 })}>Reset</button><button type="button" onClick={() => { setActiveTool('select'); setEditorPanel('main'); setNotice('Crop applied to preview and export.') }}>Done</button></div></div>}
          {editorPanel === 'adjust' && <div className="modern-context-body"><div className="modern-adjust-hero"><Palette size={28} /><span><strong>Color adjustments</strong><small>Preview and export stay in sync</small></span></div>{[['Brightness', 'brightness', 0, 200], ['Contrast', 'contrast', 0, 200], ['Saturation', 'saturation', 0, 200], ['Exposure', 'exposure', 50, 150], ['Hue', 'hue', -180, 180], ['Blur', 'blur', 0, 20]].map(([label, key, min, max]) => <label key={key} className="modern-slider"><span>{label}<b>{filters[key]}</b></span><input type="range" min={min} max={max} value={filters[key]} onPointerDown={commitHistory} onChange={(event) => setFilters((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}<div className="modern-context-footer"><button type="button" onClick={resetFilters}>Reset</button><button type="button" onClick={() => setEditorPanel('main')}>Done</button></div></div>}
          {editorPanel === 'filters' && <div className="modern-context-body modern-gallery-body"><div className="modern-filter-gallery">{PHOTO_FILTER_PRESETS.map((preset) => <button key={preset.key} type="button" onClick={() => applyFilterPreset(preset.label, preset.patch)}><span style={{ backgroundImage: selectedImageSrc ? `url(${selectedImageSrc})` : undefined, filter: buildFilterString({ ...NEUTRAL_FILTERS, ...preset.patch }) }} /><strong>{preset.label}</strong></button>)}</div><button type="button" className="modern-remove-effect" onClick={resetFilters}>Remove filter</button></div>}
          {editorPanel === 'shadows' && <div className="modern-context-body modern-gallery-body"><div className="modern-shadow-gallery">{PHOTO_SHADOW_PRESETS.map((preset) => <button key={preset.key} type="button" onClick={() => applyShadowPreset(preset)}><span style={{ filter: preset.patch.shadowBlur ? `drop-shadow(${preset.patch.shadowX}px ${preset.patch.shadowY}px ${preset.patch.shadowBlur}px ${preset.patch.shadowColor})` : 'none' }} /><strong>{preset.label}</strong></button>)}</div><label className="modern-slider"><span>Blur<b>{filters.shadowBlur}px</b></span><input type="range" min="0" max="40" value={filters.shadowBlur} onPointerDown={commitHistory} onChange={(event) => setFilters((current) => ({ ...current, shadowBlur: Number(event.target.value) }))} /></label><label className="modern-color-control"><span>Shadow color</span><input type="color" value={filters.shadowColor} onChange={(event) => setFilters((current) => ({ ...current, shadowColor: event.target.value }))} /></label></div>}
          {editorPanel === 'erase' && <div className="modern-context-body"><div className="modern-mode-switch"><button type="button" className={activeTool === 'eraser' ? 'active' : ''} onClick={() => setActiveTool('eraser')}><Eraser size={16} /> Erase</button><button type="button" className={activeTool === 'heal' ? 'active' : ''} onClick={() => setActiveTool('heal')}><Bandage size={16} /> Heal</button></div><label className="modern-slider"><span>Brush size<b>{brushSize}px</b></span><input type="range" min="4" max="96" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label><label className="modern-slider"><span>Opacity<b>{Math.round(brushOpacity * 100)}%</b></span><input type="range" min="0.1" max="1" step="0.05" value={brushOpacity} onChange={(event) => setBrushOpacity(Number(event.target.value))} /></label><button type="button" className="modern-smart-action" onClick={() => { setActiveTool('remove'); setNotice('Drag over the area you want to remove.') }}><Sparkles size={17} /> Remove an area</button><div className="modern-context-footer"><button type="button" onClick={undo} disabled={!historyCounts.past}>Undo</button><button type="button" onClick={() => setEditorPanel('main')}>Done</button></div></div>}
          {editorPanel === 'select' && <div className="modern-context-body"><div className="modern-selection-list"><button type="button" onClick={() => setActiveTool('object-select')}><Sparkles size={18} /><span><strong>Element</strong><small>Find the main subject</small></span></button><button type="button" onClick={() => setActiveTool('magic-wand')}><Wand size={18} /><span><strong>Magic wand</strong><small>Select matching colors</small></span></button><button type="button" onClick={() => setActiveTool('rect-select')}><BoxSelect size={18} /><span><strong>Area</strong><small>Drag a rectangular selection</small></span></button><button type="button" onClick={() => setActiveTool('lasso')}><LassoSelect size={18} /><span><strong>Lasso</strong><small>Draw around an area</small></span></button></div><button type="button" className="modern-smart-action" onClick={selectSubject}>Select subject</button>{selection && <><button type="button" className="modern-wide-action" onClick={invertSelection}>Invert selection</button><button type="button" className="modern-wide-action" onClick={addLayerMaskFromSelection}>Add layer mask</button><button type="button" className="modern-wide-action" onClick={deselect}>Deselect</button></>}</div>}
          {editorPanel === 'draw' && <div className="modern-context-body"><div className="modern-mode-switch"><button type="button" className={activeTool === 'brush' ? 'active' : ''} onClick={() => setActiveTool('brush')}><Paintbrush size={16} /> Brush</button><button type="button" className={activeTool === 'fill' ? 'active' : ''} onClick={() => setActiveTool('fill')}><PaintBucket size={16} /> Fill</button></div><label className="modern-color-control"><span>Color</span><input type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} /></label><label className="modern-slider"><span>Size<b>{brushSize}px</b></span><input type="range" min="4" max="96" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label><label className="modern-slider"><span>Opacity<b>{Math.round(brushOpacity * 100)}%</b></span><input type="range" min="0.1" max="1" step="0.05" value={brushOpacity} onChange={(event) => setBrushOpacity(Number(event.target.value))} /></label></div>}
          {editorPanel === 'create' && <div className="modern-context-body"><button type="button" className="modern-create-action" onClick={addTextLayer}><Type size={22} /><span><strong>Add text</strong><small>Create an editable text layer</small></span></button><div className="modern-shape-grid">{Object.entries(SHAPES).map(([shape, label]) => <button key={shape} type="button" onClick={() => addShapeLayer(shape)}>{shape === 'rectangle' ? <Square /> : shape === 'ellipse' ? <Circle /> : shape === 'triangle' ? <Triangle /> : <Minus />}<span>{label}</span></button>)}</div><label className="modern-context-label">Stickers</label><div className="modern-sticker-grid">{STICKERS.map((sticker) => <button key={sticker} type="button" onClick={() => addStickerLayer(sticker)}>{sticker}</button>)}</div></div>}
          {editorPanel === 'layers' && <div className="modern-context-body"><p className="modern-context-note">The layer inspector is open on the right. Select a layer there to edit content, color, size, blend mode, and order.</p><button type="button" className="modern-smart-action" onClick={addTextLayer}><Type size={17} /> Add text layer</button><button type="button" className="modern-wide-action" onClick={() => setRightSidebarCollapsed((value) => !value)}>{rightSidebarCollapsed ? 'Open layer inspector' : 'Hide layer inspector'}</button></div>}
        </>
      )}
    </div>
  )

  const hasCurrentDocument = Boolean(selectedImageSrc || layers.length || brushStrokes.length || autosavedProject)

  const createDialog = createDialogOpen && createPortal(
    <div className="photo-create-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setCreateDialogOpen(false)
    }}>
      <section className="photo-create-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-create-title">
        <header>
          <h2 id="photo-create-title">Create a design</h2>
          <label><Search size={19} aria-hidden="true" /><input autoFocus value={createSearch} onChange={(event) => setCreateSearch(event.target.value)} placeholder="What would you like to create?" /></label>
          <button type="button" className="photo-create-close" onClick={() => setCreateDialogOpen(false)} aria-label="Close"><X size={22} /></button>
        </header>
        <div className="photo-create-body">
          <nav aria-label="Design categories">
            {PHOTO_CREATE_CATEGORIES.map((category) => (
              <button key={category} type="button" className={createCategory === category ? 'active' : ''} onClick={() => { setCreateCategory(category); if (category !== 'Social media') setCreatePlatform('all') }}>
                <LayoutTemplate size={16} aria-hidden="true" /><span>{category}</span>
              </button>
            ))}
            <button type="button" className={createCategory === 'Custom size' ? 'active' : ''} onClick={() => setCreateCategory('Custom size')}><PanelsTopLeft size={16} /><span>Custom size</span></button>
            <button type="button" className={createCategory === 'Upload' ? 'active' : ''} onClick={() => setCreateCategory('Upload')}><Upload size={16} /><span>Upload</span></button>
          </nav>
          <div className="photo-create-results">
            {createCategory === 'Social media' && (
              <div className="photo-platform-organizer" aria-label="Filter social designs by platform">
                {PHOTO_SOCIAL_PLATFORMS.map((platform) => (
                  <button key={platform.key} type="button" className={createPlatform === platform.key ? 'active' : ''} onClick={() => setCreatePlatform(platform.key)} style={{ '--platform-color': platform.color }}>
                    <span>{platform.key === 'all' ? '✦' : platform.label.slice(0, 1)}</span>{platform.label}
                  </button>
                ))}
              </div>
            )}
            {createCategory === 'Custom size' ? (
              <div className="photo-create-custom">
                <h3>Custom size</h3>
                <div className="photo-create-size-fields">
                  <label>Width<input type="number" min="40" max="8192" value={customWidth} onChange={(event) => setCustomWidth(event.target.value)} /></label>
                  <label>Height<input type="number" min="40" max="8192" value={customHeight} onChange={(event) => setCustomHeight(event.target.value)} /></label>
                  <label>Units<select disabled><option>px</option></select></label>
                  <button type="button" onClick={createCustomDesign} disabled={!normalizeCanvasSize({ width: customWidth, height: customHeight })}>Create new design</button>
                </div>
                <h3>Popular layouts</h3>
                <div className="photo-create-presets">
                  {PHOTO_DESIGN_PRESETS.filter((item) => ['doc-a4', 'presentation', 'instagram-post', 'business-card'].includes(item.key)).map((item) => {
                    const FormatIcon = item.icon
                    return <button key={item.key} type="button" className={`photo-create-preset-card preset-${item.key}`} onClick={() => startHomeDesign(item)}><span className="photo-create-preset-art" style={{ '--format-color': item.color }}><FormatIcon size={42} /></span><strong>{item.label}</strong><small>{item.width} × {item.height} px{item.status ? ` · ${item.status}` : ''}</small></button>
                  })}
                </div>
              </div>
            ) : createCategory === 'Upload' ? (
              <div className="photo-create-upload" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                event.preventDefault()
                importImageFile(event.dataTransfer.files?.[0])
              }}>
                <Upload size={64} aria-hidden="true" /><h3>Drop your image here</h3><p>Import a PNG, JPEG, WebP, GIF, or SVG into the full Photo Editor.</p><button type="button" onClick={() => uploadInputRef.current?.click()}>Upload files</button>
              </div>
            ) : (
              <>
                {(createCategory === 'For you' || createCategory === 'Photo editor') && (
                  <><h3>Quick actions</h3><div className="photo-create-quick">
                    <button type="button" onClick={() => startHomeDesign(PHOTO_DESIGN_PRESETS.find((item) => item.key === 'photo-portrait'))}><span><ImageIcon size={22} /></span>Photo editor</button>
                    <button type="button" onClick={() => setStockLibraryOpen(true)}><span><Images size={22} /></span>Stock images</button>
                    <button type="button" onClick={handleFileOpenProject}><span><FolderOpen size={22} /></span>Open project</button>
                    <button type="button" onClick={() => setCreateCategory('Upload')}><span><Upload size={22} /></span>Upload image</button>
                  </div></>
                )}
                <h3>{createCategory === 'For you' ? 'Popular in EchoAI' : createCategory}</h3>
                <div className="photo-create-presets">
                  {visibleCreateFormats.map((item) => {
                    const FormatIcon = item.icon
                    return (
                      <button key={item.key} type="button" className={`photo-create-preset-card preset-${item.key}`} onClick={() => startHomeDesign(item)}>
                        <span className="photo-create-preset-art" style={{ '--format-color': item.color }}><FormatIcon size={42} /></span>
                        <strong>{item.label}</strong><small>{item.width} × {item.height} px{item.status ? ` · ${item.status}` : ''}</small>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )

  if (workspaceView === 'school') {
    return <DesignSchool initialCourseId={schoolCourseId} onHome={() => setWorkspaceView('home')} onTemplates={() => setWorkspaceView('home')} onStartPractice={startSchoolPractice} />
  }

  if (workspaceView === 'projects') {
    const rootFolders = folders.filter((folder) => !folder.parentId)
    const childFolders = folders.filter((folder) => (folder.parentId || '') === (projectsFolderId || ''))
    const currentFolder = folders.find((folder) => folder.id === projectsFolderId) || null
    const breadcrumb = []
    for (let cursor = currentFolder; cursor; cursor = folders.find((folder) => folder.id === cursor.parentId) || null) {
      breadcrumb.unshift(cursor)
    }
    const normalizedSearch = projectsSearch.trim().toLowerCase()
    const matchesSearch = (name) => !normalizedSearch || name.toLowerCase().includes(normalizedSearch)
    const byRecency = (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
    const passesFilters = (asset) => {
      if (projectsTypeFilter === 'designs' && asset.type !== 'design') return false
      if (projectsTypeFilter === 'images' && asset.type !== 'image') return false
      if (projectsTypeFilter === 'videos' && asset.type !== 'video') return false
      if (!withinDateFilter(asset.updatedAt || asset.createdAt, projectsDateFilter)) return false
      return matchesSearch(asset.name)
    }
    const showFoldersSection = projectsTypeFilter === 'all' || projectsTypeFilter === 'folders'
    const inRoot = !projectsFolderId
    const scopedAssets = assets.filter((asset) => (asset.folderId || '') === (projectsFolderId || '')).filter(passesFilters).sort(byRecency)
    const scopedFolders = showFoldersSection ? childFolders.filter((folder) => matchesSearch(folder.name)) : []
    const recentItems = inRoot ? [...assets].filter(passesFilters).sort(byRecency).slice(0, 8) : []
    const allDesigns = inRoot ? assets.filter((asset) => asset.type === 'design').filter(passesFilters).sort(byRecency) : []
    const allImages = inRoot ? assets.filter((asset) => asset.type === 'image').filter(passesFilters).sort(byRecency) : []

    const startNewFolder = () => {
      setNewFolderDraft(true)
      setNewFolderName('')
    }
    const confirmNewFolder = () => {
      const name = newFolderName.trim()
      if (name) onCreateFolder?.(name, projectsFolderId || null)
      setNewFolderDraft(false)
      setNewFolderName('')
    }
    const handleProjectsUpload = (event) => {
      if (event.target.files?.length) onUploadFiles?.(event.target.files, projectsFolderId || null)
      event.target.value = ''
    }
    const itemMenu = (kind, item) => (event) => {
      event.preventDefault()
      event.stopPropagation()
      setProjectsMenu({ x: event.clientX, y: event.clientY, kind, item })
    }

    const renderAssetCard = (asset) => (
      <div key={asset.id} className="photo-project-card">
        <button type="button" className="photo-project-card-body" onClick={() => openWorkspaceAsset(asset)} onContextMenu={itemMenu('asset', asset)}>
          <span className="photo-project-thumb">{asset.previewUrl ? <img src={asset.previewUrl} alt="" /> : asset.type === 'design' ? <LayoutTemplate size={26} /> : <ImageIcon size={26} />}</span>
        </button>
        {renamingItem?.id === asset.id ? (
          <input autoFocus defaultValue={asset.name} onBlur={(event) => { onRenameAsset?.(asset.id, event.target.value); setRenamingItem(null) }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenamingItem(null) }} />
        ) : (
          <strong title={asset.name}>{asset.name}</strong>
        )}
        <small>{asset.type === 'design' ? 'Design' : asset.type === 'video' ? 'Video' : 'Image'} · {new Date(asset.updatedAt || asset.createdAt).toLocaleDateString()}</small>
        <button type="button" className="photo-project-card-menu" aria-label={`More actions for ${asset.name}`} onClick={itemMenu('asset', asset)}><MoreVertical size={15} /></button>
      </div>
    )

    const renderFolderCard = (folder) => (
      <button key={folder.id} type="button" className="photo-project-folder" onClick={() => setProjectsFolderId(folder.id)} onContextMenu={itemMenu('folder', folder)}>
        <Folder size={22} />
        {renamingItem?.id === folder.id ? (
          <input autoFocus defaultValue={folder.name} onClick={(event) => event.stopPropagation()} onBlur={(event) => { onRenameFolder?.(folder.id, event.target.value); setRenamingItem(null) }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenamingItem(null) }} />
        ) : (
          <span>{folder.name}</span>
        )}
        <span type="button" className="photo-project-folder-menu" role="button" tabIndex={0} aria-label={`More actions for ${folder.name}`} onClick={itemMenu('folder', folder)}><MoreVertical size={14} /></span>
      </button>
    )

    return (
      <section className="photo-home photo-projects-shell" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        event.preventDefault()
        if (event.dataTransfer.files?.length) onUploadFiles?.(event.dataTransfer.files, projectsFolderId || null)
      }}>
        <aside className="photo-home-rail" aria-label="Photo editor navigation">
          <div className="photo-home-mark" aria-label="EchoAI Photo Editor"><ImageIcon size={21} /></div>
          <button type="button" className="photo-home-create" onClick={() => setCreateDialogOpen(true)} aria-label="Create"><Plus size={20} /><span>Create</span></button>
          <nav>
            <button type="button" aria-label="Home" onClick={() => setWorkspaceView('home')}><Home size={19} /><span>Home</span></button>
            <button type="button" aria-label="Templates" onClick={() => setWorkspaceView('home')}><LayoutTemplate size={19} /><span>Templates</span></button>
            <button type="button" aria-label="Design School" onClick={() => setWorkspaceView('school')}><GraduationCap size={19} /><span>School</span></button>
            <button type="button" className="active" aria-label="Projects"><FolderOpen size={19} /><span>Projects</span></button>
            <button type="button" aria-label="Stock images" onClick={() => setStockLibraryOpen(true)}><Images size={19} /><span>Stock</span></button>
          </nav>
        </aside>
        <main className="photo-projects-main">
          <div className="photo-projects-toolbar">
            <div>
              <h1>{inRoot ? 'All projects' : currentFolder?.name}</h1>
              {!inRoot && (
                <nav className="photo-projects-crumb" aria-label="Breadcrumb">
                  <button type="button" onClick={() => setProjectsFolderId('')}>Projects</button>
                  {breadcrumb.map((folder) => (
                    <span key={folder.id}>/ <button type="button" onClick={() => setProjectsFolderId(folder.id)}>{folder.name}</button></span>
                  ))}
                </nav>
              )}
            </div>
            <label className="photo-home-search photo-projects-search"><Search size={18} /><input value={projectsSearch} onChange={(event) => setProjectsSearch(event.target.value)} placeholder="Search designs, folders, and uploads" /></label>
          </div>

          <div className="photo-projects-filters">
            <select value={projectsTypeFilter} onChange={(event) => setProjectsTypeFilter(event.target.value)} aria-label="Filter by type">
              <option value="all">Any type</option>
              <option value="folders">Folders</option>
              <option value="designs">Designs</option>
              <option value="images">Images</option>
              <option value="videos">Videos</option>
            </select>
            <select value={projectsDateFilter} onChange={(event) => setProjectsDateFilter(event.target.value)} aria-label="Filter by date modified">
              <option value="any">Any time</option>
              <option value="today">Today</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
            <div className="photo-projects-actions">
              {newFolderDraft ? (
                <span className="photo-projects-new-folder"><input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') confirmNewFolder(); if (event.key === 'Escape') setNewFolderDraft(false) }} placeholder="Folder name" /><button type="button" onClick={confirmNewFolder}>Create</button></span>
              ) : (
                <button type="button" onClick={startNewFolder}><Folder size={16} /> New folder</button>
              )}
              <button type="button" onClick={() => projectsUploadInputRef.current?.click()}><Upload size={16} /> Upload</button>
              <button type="button" onClick={handleFileOpenProject}><FileText size={16} /> Import file</button>
              <input ref={projectsUploadInputRef} type="file" multiple accept="image/*,video/*" className="photo-home-file-input" onChange={handleProjectsUpload} />
            </div>
          </div>

          {inRoot ? (
            <>
              {recentItems.length > 0 && (
                <section className="photo-projects-section">
                  <h2>Recents</h2>
                  <div className="photo-project-grid">{recentItems.map(renderAssetCard)}</div>
                </section>
              )}
              {showFoldersSection && (
                <section className="photo-projects-section">
                  <div className="photo-projects-section-heading"><h2>Folders</h2></div>
                  <div className="photo-project-folder-grid">
                    {rootFolders.filter((folder) => matchesSearch(folder.name)).map(renderFolderCard)}
                    {rootFolders.length === 0 && <p className="muted">No folders yet. Use New folder to start organizing your work.</p>}
                  </div>
                </section>
              )}
              {(projectsTypeFilter === 'all' || projectsTypeFilter === 'designs') && (
                <section className="photo-projects-section">
                  <h2>Designs</h2>
                  <div className="photo-project-grid">{allDesigns.length ? allDesigns.map(renderAssetCard) : <p className="muted">Designs you save from the editor will appear here.</p>}</div>
                </section>
              )}
              {(projectsTypeFilter === 'all' || projectsTypeFilter === 'images') && (
                <section className="photo-projects-section">
                  <h2>Images</h2>
                  <div className="photo-project-grid">{allImages.length ? allImages.map(renderAssetCard) : <p className="muted">Photos you upload will appear here.</p>}</div>
                </section>
              )}
            </>
          ) : (
            <section className="photo-projects-section">
              <div className="photo-project-folder-grid">{scopedFolders.map(renderFolderCard)}</div>
              <div className="photo-project-grid">{scopedAssets.map(renderAssetCard)}</div>
              {scopedFolders.length === 0 && scopedAssets.length === 0 && <p className="muted">This folder is empty. Upload files or create a design to fill it.</p>}
            </section>
          )}
        </main>
        {projectsMenu && createPortal(
          <div className="photo-context-backdrop" onClick={() => setProjectsMenu(null)} onContextMenu={(event) => { event.preventDefault(); setProjectsMenu(null) }}>
            <div className="photo-context-menu" role="menu" style={{ left: Math.min(projectsMenu.x, window.innerWidth - 220), top: Math.min(projectsMenu.y, window.innerHeight - 220) }} onClick={(event) => event.stopPropagation()}>
              {projectsMenu.kind === 'asset' ? (
                <>
                  <button type="button" role="menuitem" onClick={() => { openWorkspaceAsset(projectsMenu.item); setProjectsMenu(null) }}>Open</button>
                  <button type="button" role="menuitem" onClick={() => { setRenamingItem(projectsMenu.item); setProjectsMenu(null) }}>Rename</button>
                  {projectsMenu.item.folderId && <button type="button" role="menuitem" onClick={() => { onMoveAsset?.(projectsMenu.item.id, null); setProjectsMenu(null) }}>Remove from folder</button>}
                  <hr />
                  <button type="button" role="menuitem" className="danger" onClick={() => { if (confirm(`Delete "${projectsMenu.item.name}"? This cannot be undone.`)) onDeleteAsset?.(projectsMenu.item.id); setProjectsMenu(null) }}>Delete</button>
                </>
              ) : (
                <>
                  <button type="button" role="menuitem" onClick={() => { setProjectsFolderId(projectsMenu.item.id); setProjectsMenu(null) }}>Open</button>
                  <button type="button" role="menuitem" onClick={() => { setRenamingItem(projectsMenu.item); setProjectsMenu(null) }}>Rename</button>
                  <hr />
                  <button type="button" role="menuitem" className="danger" onClick={() => { if (confirm(`Delete "${projectsMenu.item.name}" folder? Items inside will move to Projects.`)) onDeleteFolder?.(projectsMenu.item.id); setProjectsMenu(null) }}>Delete folder</button>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
        {createDialog}
        {stockLibraryOpen && createPortal(<StockLibrary initialKind="image" kinds={['image']} onClose={() => setStockLibraryOpen(false)} onAdd={addFromStockLibrary} />, document.body)}
      </section>
    )
  }

  if (workspaceView === 'home') {
    return (
      <section className="photo-home" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        event.preventDefault()
        importImageFile(event.dataTransfer.files?.[0])
      }}>
        <aside className="photo-home-rail" aria-label="Photo editor navigation">
          <div className="photo-home-mark" aria-label="EchoAI Photo Editor"><ImageIcon size={21} /></div>
          <button type="button" className="photo-home-create" onClick={() => setCreateDialogOpen(true)} aria-label="Create"><Plus size={20} /><span>Create</span></button>
          <nav>
            <button type="button" className="active" aria-label="Home"><Home size={19} /><span>Home</span></button>
            <button type="button" aria-label="Templates" onClick={() => document.querySelector('.photo-home-templates')?.scrollIntoView({ behavior: 'smooth' })}><LayoutTemplate size={19} /><span>Templates</span></button>
            <button type="button" aria-label="Logos" onClick={() => document.querySelector('.photo-home-logos')?.scrollIntoView({ behavior: 'smooth' })}><PenTool size={19} /><span>Logos</span></button>
            <button type="button" aria-label="Design School" onClick={() => setWorkspaceView('school')}><GraduationCap size={19} /><span>School</span></button>
            <button type="button" aria-label="Projects" onClick={() => setWorkspaceView('projects')}><FolderOpen size={19} /><span>Projects</span></button>
            <button type="button" aria-label="Stock images" onClick={() => setStockLibraryOpen(true)}><Images size={19} /><span>Stock</span></button>
          </nav>
        </aside>
        <main className="photo-home-main">
          <div className="photo-home-hero">
            <div className="photo-home-tabs"><button type="button" className="active"><Home size={14} /> Home</button><button type="button" onClick={() => document.querySelector('.photo-home-templates')?.scrollIntoView({ behavior: 'smooth' })}><LayoutTemplate size={14} /> Templates</button></div>
            <h1>What will you create today?</h1>
            <label className="photo-home-search"><Search size={20} /><input value={homeSearch} onChange={(event) => setHomeSearch(event.target.value)} placeholder="Search formats, templates, and projects" /></label>
          </div>
          <div className="photo-home-content">
            <section className="photo-home-formats" aria-label="Create a design">
              <button type="button" className="photo-format-item photo-format-templates" onClick={() => document.querySelector('.photo-home-templates')?.scrollIntoView({ behavior: 'smooth' })}><span className="photo-format-icon"><LayoutTemplate size={24} /></span><span>Templates</span></button>
              <button type="button" className="photo-format-item photo-format-templates" onClick={() => document.querySelector('.photo-home-logos')?.scrollIntoView({ behavior: 'smooth' })}><span className="photo-format-icon"><PenTool size={24} /></span><span>Logos</span></button>
              {visibleHomeFormats.map((item) => {
                const FormatIcon = item.icon
                return <button key={item.key} type="button" className="photo-format-item" onClick={() => startHomeDesign(item)}><span className="photo-format-icon" style={{ '--format-color': item.color }}><FormatIcon size={24} /></span><span>{item.label}</span></button>
              })}
              <button type="button" className="photo-format-item" onClick={() => uploadInputRef.current?.click()}><span className="photo-format-icon photo-format-neutral"><Upload size={24} /></span><span>Upload</span></button>
              <button type="button" className="photo-format-item" onClick={() => setCreateDialogOpen(true)}><span className="photo-format-icon photo-format-neutral"><MoreHorizontal size={24} /></span><span>More</span></button>
            </section>
            <input ref={uploadInputRef} className="photo-home-file-input" type="file" accept="image/*" onChange={handleUpload} />
            <section className="photo-home-section" aria-labelledby="photo-recent-heading">
              <div className="photo-home-section-heading"><h2 id="photo-recent-heading">Continue designing</h2><span>{imageAssets.length} workspace images</span></div>
              <div className="photo-recent-grid">
                {hasCurrentDocument && <button type="button" className="photo-recent-item" onClick={() => setWorkspaceView('editor')}><span className="photo-recent-preview photo-current-preview" style={{ background: canvasBackground === 'transparent' ? '#f8fafc' : canvasBackground }}>{selectedImageSrc ? <img src={selectedImageSrc} alt="" /> : <><strong>{headline || 'Untitled design'}</strong><small>{aspect.canvasWidth} × {aspect.canvasHeight}</small></>}</span><strong>{headline || 'Autosaved design'}</strong><small>Autosaved Photo Editor project</small></button>}
                {visibleHomeAssets.map((asset) => (
                  <button key={asset.id} type="button" className="photo-recent-item" onClick={() => openWorkspaceAsset(asset)}><span className="photo-recent-preview">{asset.previewUrl ? <img src={asset.previewUrl} alt="" /> : <ImageIcon size={28} />}</span><strong>{asset.name}</strong><small>Photo Editor project</small></button>
                ))}
                {!hasCurrentDocument && visibleHomeAssets.length === 0 && <button type="button" className="photo-recent-empty" onClick={() => uploadInputRef.current?.click()}><Upload size={24} /><strong>Upload your first image</strong><span>PNG, JPEG, or WebP</span></button>}
              </div>
            </section>
            <section className="photo-home-section photo-home-logos" aria-labelledby="photo-logo-heading">
              <div className="photo-home-section-heading"><div><h2 id="photo-logo-heading">Logo starters</h2><span>{LOGO_EDITOR_TEMPLATES.length} original, editable marks</span></div><button type="button" className="photo-template-stock-link" onClick={() => { startHomeDesign({ width: 1200, height: 1200, label: 'Logo' }); setStockLibraryOpen('logo') }}><Images size={16} aria-hidden="true" /> Browse free vectors</button></div>
              <label className="photo-logo-search"><Search size={18} aria-hidden="true" /><input value={logoSearch} onChange={(event) => setLogoSearch(event.target.value)} placeholder="Search logos, industries, or keywords" aria-label="Search logo starters" /></label>
              <div className="photo-logo-filters" aria-label="Filter logos by industry">
                {LOGO_INDUSTRIES.map((industry) => <button key={industry} type="button" className={logoIndustry === industry ? 'active' : ''} onClick={() => setLogoIndustry(industry)}>{industry}</button>)}
              </div>
              <div className="photo-logo-keywords"><strong>Popular keywords</strong><div>{LOGO_KEYWORDS.map((keyword) => <button key={keyword} type="button" className={logoSearch.toLowerCase() === keyword.toLowerCase() ? 'active' : ''} onClick={() => { setLogoSearch(keyword); setLogoIndustry('All') }}>{keyword}</button>)}</div></div>
              <div className="photo-template-grid photo-logo-grid">
                {visibleLogos.map((logo) => <button key={logo.key} type="button" className="photo-template-item" onClick={() => applyPhotoTemplate(logo)}><PhotoTemplatePreview template={logo} /><strong>{logo.title}</strong><small className="photo-template-license">{logo.industry} · {logo.width} × {logo.height}</small></button>)}
                {visibleLogos.length === 0 && <p className="photo-template-empty">No logos match. Try another keyword or industry.</p>}
              </div>
              <p className="photo-logo-usage">Starter marks are nonexclusive. Stock artwork adds as an image layer, not a trademark-cleared logo. Check availability before registering a mark.</p>
            </section>
            <section className="photo-home-section photo-home-templates" aria-labelledby="photo-template-heading">
              <div className="photo-home-section-heading"><div><h2 id="photo-template-heading">Templates</h2><span>{PHOTO_EDITOR_TEMPLATES.length - LOGO_EDITOR_TEMPLATES.length} editable designs</span></div><button type="button" className="photo-template-stock-link" onClick={() => setStockLibraryOpen(true)}><Images size={16} aria-hidden="true" /> Browse free photos</button></div>
              <div className="photo-template-categories" aria-label="Explore template formats">
                {PHOTO_TEMPLATE_CATEGORIES.map((category) => {
                  const sample = PHOTO_EDITOR_TEMPLATES.find((template) => template.category === category) || PHOTO_EDITOR_TEMPLATES[0]
                  return <button key={category} type="button" className={templateCategory === category ? 'active' : ''} style={{ '--tile-base': sample.colors[0], '--tile-accent': sample.colors[1] }} onClick={() => { setTemplateCategory(category); setTemplatePlatform('All') }}><strong>{category}</strong><small>{category === 'All' ? PHOTO_EDITOR_TEMPLATES.length - LOGO_EDITOR_TEMPLATES.length : PHOTO_EDITOR_TEMPLATES.filter((template) => template.category === category).length} designs</small><span aria-hidden="true" /></button>
                })}
              </div>
              <div className="photo-template-filters" aria-label="Filter templates">
                <label>Format<select value={templateCategory} onChange={(event) => { setTemplateCategory(event.target.value); if (event.target.value !== 'Social media') setTemplatePlatform('All') }}><option>All</option>{PHOTO_TEMPLATE_CATEGORIES.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label>
                <label>Platform<select value={templatePlatform} onChange={(event) => { setTemplatePlatform(event.target.value); if (event.target.value !== 'All') setTemplateCategory('Social media') }}><option>All</option>{PHOTO_TEMPLATE_PLATFORMS.map((platform) => <option key={platform}>{platform}</option>)}</select></label>
                <span>{visibleStarters.length} template{visibleStarters.length === 1 ? '' : 's'}</span>
              </div>
              <div className="photo-template-grid">
                {visibleStarters.map((starter) => (
                  <div key={starter.key} className="photo-template-choice">
                    <button type="button" className="photo-template-item" onClick={() => applyPhotoTemplate(starter)}>
                      <PhotoTemplatePreview template={starter} />
                      <strong>{starter.title}</strong><small className="photo-template-license">{starter.license.shortName} · {starter.width} × {starter.height}</small>
                    </button>
                    <button type="button" className="photo-template-add-photo" title={`Use a free photo with ${starter.title}`} aria-label={`Use a free photo with ${starter.title}`} onClick={() => { applyPhotoTemplate(starter); setStockLibraryOpen(true) }}><Images size={15} aria-hidden="true" /> Add photo</button>
                  </div>
                ))}
                {visibleStarters.length === 0 && <p className="photo-template-empty">No templates match these filters.</p>}
              </div>
            </section>
          </div>
        </main>
        {createDialog}
        {stockLibraryOpen && createPortal(<StockLibrary initialKind="image" initialQuery={stockLibraryOpen === 'logo' ? '' : undefined} initialImageType={stockLibraryOpen === 'logo' ? 'vector' : 'all'} kinds={['image']} onClose={() => setStockLibraryOpen(false)} onAdd={addFromStockLibrary} />, document.body)}
      </section>
    )
  }

  return (
    <section
      className={`photo-creator-shell photo-modern-editor-shell ${compactMode ? 'compact' : ''} ${focusMode.focused ? 'editor-focus' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        importImageFile(event.dataTransfer.files?.[0])
      }}
    >
      <header className="photo-creator-header photo-editor-topbar">
        <div className="photo-topbar-left">
          <button type="button" className="photo-topbar-text" onClick={() => { commitSave(); setWorkspaceView('home') }}>Cancel</button>
          <span className="photo-topbar-divider" />
          <button type="button" className="photo-topbar-icon" onClick={undo} disabled={historyCounts.past === 0} title="Undo (Ctrl+Z)" aria-label="Undo"><RotateCcw size={18} /></button>
          <button type="button" className="photo-topbar-icon" onClick={redo} disabled={historyCounts.future === 0} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><RotateCcw size={18} className="rotate-right" /></button>
          <EditorFocusToggle focused={focusMode.focused} onToggle={focusMode.toggle} fullscreen={focusMode.fullscreen} onToggleFullscreen={focusMode.toggleFullscreen} label="photo editor" />
        </div>
        <div className="photo-topbar-title"><strong>{headline || prompt || 'Untitled design'}</strong><span>{aspect.canvasWidth} × {aspect.canvasHeight}px</span></div>
        <div className="photo-topbar-actions">
          <span className={`photo-save-status ${saveStatus.toLowerCase()}`}>{saveStatus}</span>
          <button type="button" className="photo-topbar-icon" onClick={exportCanvas} title={`Download ${EXPORT_FORMATS[exportFormat]?.label ?? 'PNG'}`} aria-label="Download design"><Download size={19} /></button>
          <button type="button" className="photo-create-design-button" onClick={() => { setWorkspaceView('home'); setCreateDialogOpen(true) }}><Plus size={17} /> Create design</button>
          <button type="button" className="photo-save-button" onClick={commitSave}><Save size={17} /> Save</button>
          <button type="button" className="photo-topbar-close" onClick={() => { commitSave(); setWorkspaceView('home') }} aria-label="Close editor"><X size={20} /></button>
        </div>
      </header>

      <div ref={setMenuHost} className={`editor-menu-host ${editorPanel === 'advanced' ? 'legacy-menu-visible' : ''}`} />

      <div className="editor-options-bar" aria-label="Tool options">
        <div className="option-group">
          <span className="option-group-title">{TOOLS[activeTool] || 'Tool'}</span>
          {SELECTION_TOOLS.has(activeTool) ? (
            <>
              <div className="option-segmented" role="radiogroup" aria-label="Selection mode">
                {SELECTION_MODES.map(([key, label]) => (
                  <button key={key} type="button" role="radio" aria-checked={selectionMode === key} className={selectionMode === key ? 'active' : ''} onClick={() => setSelectionMode(key)} title={`${label} selection${key === 'add' ? ' (hold Shift)' : key === 'subtract' ? ' (hold Alt)' : ''}`}>{label}</button>
                ))}
              </div>
              <label title="Softens the selection edge">
                <span>Feather {selectionFeather}px</span>
                <input type="range" min="0" max="40" value={selectionFeather} onChange={(event) => setSelectionFeather(Number(event.target.value))} />
              </label>
              {activeTool === 'magic-wand' && (
                <>
                  <label>
                    <span>Tolerance {wandTolerance}</span>
                    <input type="range" min="0" max="150" value={wandTolerance} onChange={(event) => setWandTolerance(Number(event.target.value))} />
                  </label>
                  <label className="option-check">
                    <input type="checkbox" checked={wandContiguous} onChange={(event) => setWandContiguous(event.target.checked)} />
                    <span>Contiguous</span>
                  </label>
                </>
              )}
              <button type="button" className="option-action" onClick={selectSubject}>Select subject</button>
              {selection && (
                <>
                  <button type="button" className="option-action" onClick={invertSelection}>Invert</button>
                  <button type="button" className="option-action" onClick={deselect}>Deselect</button>
                  <button type="button" className="option-action primary" onClick={addLayerMaskFromSelection}>Add mask</button>
                </>
              )}
            </>
          ) : activeTool === 'fill' ? (
            <>
              <label title="Fill color">
                <span>Color</span>
                <input type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} />
              </label>
              <label>
                <span>Tolerance {wandTolerance}</span>
                <input type="range" min="0" max="150" value={wandTolerance} onChange={(event) => setWandTolerance(Number(event.target.value))} />
              </label>
              <label className="option-check">
                <input type="checkbox" checked={wandContiguous} onChange={(event) => setWandContiguous(event.target.checked)} />
                <span>Contiguous</span>
              </label>
            </>
          ) : (
            <>
              <label title="Brush color">
                <span>Color</span>
                <input type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} />
              </label>
              <label title="[ and ] change the size">
                <span>Size {brushSize}</span>
                <input type="range" min="4" max="96" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
              </label>
              <label>
                <span>Opacity {Math.round(brushOpacity * 100)}%</span>
                <input type="range" min="0.1" max="1" step="0.05" value={brushOpacity} onChange={(event) => setBrushOpacity(Number(event.target.value))} />
              </label>
              <label title="Crop the whole design to a shape">
                <span>Frame</span>
                <select value={maskShape} onChange={(event) => setMaskShape(event.target.value)}>
                  {Object.entries(MASK_SHAPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
            </>
          )}
        </div>

        <div className="option-group editor-actions">
          <button type="button" onClick={removeBackground} title="Select the subject and hide the background with a layer mask">Remove background</button>
          <button type="button" onClick={openHueSat} title="Hue/Saturation (Ctrl+U)"><SlidersHorizontal size={13} aria-hidden="true" /> Hue/Sat</button>
          <button type="button" onClick={useLibraryImage}>Library</button>
          <button type="button" onClick={clearBaseImage}>Clear image</button>
          <button type="button" onClick={resetEditor}>New canvas</button>
          <button type="button" onClick={() => setCompactMode((value) => !value)} aria-pressed={compactMode}>
            {compactMode ? 'Comfortable' : 'Compact'}
          </button>
          <button type="button" onClick={() => setShortcutsOpen(true)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts"><Keyboard size={14} aria-hidden="true" /></button>
        </div>
      </div>

      <div className={`photo-creator-grid modern-editor ${compactMode ? 'compact' : ''} ${leftSidebarCollapsed ? 'left-collapsed' : ''} ${rightSidebarCollapsed ? 'right-collapsed' : ''}`}>
        <aside className={`photo-sidebar photo-sidebar-left ${leftSidebarCollapsed ? 'collapsed' : ''} ${editorPanel === 'advanced' ? 'legacy-tools-active' : 'modern-tools-active'}`}>
          {modernToolPanel}
          {editorPanel === 'advanced' && <button type="button" className="modern-return-button" onClick={() => { setEditorPanel('main'); setLeftSidebarCollapsed(false) }}><ArrowLeft size={16} /> Back to easy tools</button>}
          {/* Compact Menu Bar in Sidebar */}
          {menuHost && createPortal(<div className="sidebar-menu-bar" aria-label="Main menu">
            {/* FILE MENU */}
            <div className="menu-container">
              <button type="button" className="menu-item-compact" title="File" onClick={() => setOpenMenu(openMenu === 'File' ? null : 'File')}>
                File
              </button>
              {openMenu === 'File' && (
                <div className="menu-dropdown menu-dropdown-compact">
                  <button onClick={handleFileNew}>New</button>
                  <button onClick={handleFileOpen}>Open Image</button>
                  <button onClick={handleFileOpenProject}>Open Project</button>
                  <button onClick={() => handleFileSave(false)}>Save Project</button>
                  <button onClick={() => handleFileSave(true)}>Save Project As…</button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={() => handleExport('png')}>Export PNG</button>
                  <button onClick={() => handleExport('jpeg')}>Export JPEG</button>
                  <button onClick={() => handleExport('webp')}>Export WebP</button>
                  <button onClick={handlePrint}>Print…</button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={handleFileClose}>Close document</button>
                </div>
              )}
            </div>

            {/* EDIT MENU */}
            <div className="menu-container">
              <button type="button" className="menu-item-compact" title="Edit" onClick={() => setOpenMenu(openMenu === 'Edit' ? null : 'Edit')}>
                Edit
              </button>
              {openMenu === 'Edit' && (
                <div className="menu-dropdown menu-dropdown-compact">
                  <button onClick={undo} disabled={historyCounts.past === 0}>Undo</button>
                  <button onClick={redo} disabled={historyCounts.future === 0}>Redo</button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={handleEditCut}>Cut</button>
                  <button onClick={handleEditCopy}>Copy</button>
                  <button onClick={handleEditPaste}>Paste</button>
                  <button onClick={handleEditClear}>Clear</button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={handleEditSelectAll}>Select All</button>
                  <button onClick={handleEditFillForeground}>Fill with Brush</button>
                  <button onClick={handleEditFillBackground}>Fill with BG</button>
                </div>
              )}
            </div>

            {/* VIEW MENU */}
            <div className="menu-container">
              <button type="button" className="menu-item-compact" title="View" onClick={() => setOpenMenu(openMenu === 'View' ? null : 'View')}>
                View
              </button>
              {openMenu === 'View' && (
                <div className="menu-dropdown menu-dropdown-compact">
                  <button onClick={handleViewCanvasOnly}>Canvas Only</button>
                  <button onClick={handleViewFullScreen}>Full Screen</button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={handleViewZoomIn}>Zoom In</button>
                  <button onClick={handleViewZoomOut}>Zoom Out</button>
                  <button onClick={handleViewFit}>Fit</button>
                  <button onClick={handleViewResetView}>Reset</button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={handleViewToggleRulers}>{showRulers ? '✓' : ' '} Rulers</button>
                  <button onClick={handleViewToggleGuides}>{showGuides ? '✓' : ' '} Guides</button>
                  <button onClick={handleViewToggleGrid}>{showGrid ? '✓' : ' '} Grid</button>
                </div>
              )}
            </div>

            {/* IMAGE MENU */}
            <div className="menu-container">
              <button type="button" className="menu-item-compact" title="Image" onClick={() => setOpenMenu(openMenu === 'Image' ? null : 'Image')}>
                Image
              </button>
              {openMenu === 'Image' && (
                <div className="menu-dropdown menu-dropdown-compact">
                  <button onClick={openHueSat}>Hue/Saturation… <kbd>Ctrl+U</kbd></button>
                  <button onClick={sharpenBase}>Sharpen</button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={handleImageCrop}>Crop</button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={handleImageRotate}>Rotate 90° clockwise</button>
                  <button onClick={() => transformBase('rotate-ccw', 'Rotated the photo 90° counter-clockwise.')}>Rotate 90° counter-clockwise</button>
                  <button onClick={handleImageFlip}>Flip horizontal</button>
                  <button onClick={() => transformBase('flip-v', 'Flipped the photo vertically.')}>Flip vertical</button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={handleImageFlatten}>Flatten image <kbd>Ctrl+Shift+E</kbd></button>
                </div>
              )}
            </div>

            {/* SELECT MENU */}
            <div className="menu-container">
              <button type="button" className="menu-item-compact" title="Select" onClick={() => setOpenMenu(openMenu === 'Select' ? null : 'Select')}>
                Select
              </button>
              {openMenu === 'Select' && (
                <div className="menu-dropdown menu-dropdown-compact">
                  <button onClick={() => { selectAll(); setOpenMenu(null) }}>All <kbd>Ctrl+A</kbd></button>
                  <button onClick={() => { deselect(); setOpenMenu(null) }} disabled={!selection}>Deselect <kbd>Ctrl+D</kbd></button>
                  <button onClick={() => { invertSelection(); setOpenMenu(null) }} disabled={!selection}>Inverse <kbd>Ctrl+Shift+I</kbd></button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={() => { selectSubject(); setOpenMenu(null) }}>Subject</button>
                  <button onClick={() => { removeBackground(); setOpenMenu(null) }}>Remove background</button>
                  <button onClick={() => { addLayerMaskFromSelection(); setOpenMenu(null) }} disabled={!selection}>Add layer mask from selection</button>
                </div>
              )}
            </div>

            {/* LAYER MENU */}
            <div className="menu-container">
              <button type="button" className="menu-item-compact" title="Layer" onClick={() => setOpenMenu(openMenu === 'Layer' ? null : 'Layer')}>
                Layer
              </button>
              {openMenu === 'Layer' && (
                <div className="menu-dropdown menu-dropdown-compact">
                  <button onClick={handleLayerNew}>New text layer <kbd>T</kbd></button>
                  <button onClick={handleLayerRenameActive} disabled={!resolvedActiveLayerId}>Rename</button>
                  <button onClick={handleLayerDuplicate} disabled={!resolvedActiveLayerId}>Duplicate <kbd>Ctrl+J</kbd></button>
                  <button onClick={handleLayerDelete} disabled={layers.length <= 1}>Delete</button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={() => { addLayerMaskFromSelection(); setOpenMenu(null) }} disabled={!selection}>Add layer mask</button>
                  <button onClick={() => { toggleLayerMask(); setOpenMenu(null) }} disabled={!layerMask}>{layerMask?.enabled === false ? 'Enable' : 'Disable'} layer mask</button>
                  <button onClick={() => { deleteLayerMask(); setOpenMenu(null) }} disabled={!layerMask}>Delete layer mask</button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={handleLayerMergeDown} disabled={layers.findIndex((layer) => layer.id === resolvedActiveLayerId) <= 0}>Merge Down</button>
                  <button onClick={handleImageFlatten}>Flatten image</button>
                </div>
              )}
            </div>

            {/* TOOLS MENU */}
            <div className="menu-container">
              <button type="button" className="menu-item-compact" title="Tools" onClick={() => setOpenMenu(openMenu === 'Tools' ? null : 'Tools')}>
                Tools
              </button>
              {openMenu === 'Tools' && (
                <div className="menu-dropdown menu-dropdown-compact">
                  <button onClick={() => handleToolSelect('select')}>Move / select <kbd>V</kbd></button>
                  <button onClick={() => handleToolSelect('brush')}>Brush <kbd>B</kbd></button>
                  <button onClick={() => handleToolSelect('eraser')}>Eraser <kbd>E</kbd></button>
                  <button onClick={() => handleToolSelect('heal')}>Healing brush <kbd>J</kbd></button>
                  <button onClick={() => handleToolSelect('fill')}>Paint bucket <kbd>G</kbd></button>
                  <button onClick={handleToolCrop}>Crop <kbd>C</kbd></button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={() => handleToolSelect('object-select')}>Object selection <kbd>W</kbd></button>
                  <button onClick={() => handleToolSelect('magic-wand')}>Magic wand <kbd>Shift+W</kbd></button>
                  <button onClick={() => handleToolSelect('rect-select')}>Rectangular marquee <kbd>M</kbd></button>
                  <button onClick={() => handleToolSelect('lasso')}>Lasso <kbd>L</kbd></button>
                  <button onClick={() => handleToolSelect('polygon')}>Polygonal lasso <kbd>Shift+L</kbd></button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={handleToolText}>Text <kbd>T</kbd></button>
                  <button onClick={() => handleToolShape('rectangle')}>Rectangle <kbd>U</kbd></button>
                  <button onClick={() => handleToolShape('ellipse')}>Ellipse</button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={() => { setShortcutsOpen(true); setOpenMenu(null) }}>Keyboard shortcuts <kbd>?</kbd></button>
                </div>
              )}
            </div>

            {/* FILTERS MENU */}
            <div className="menu-container">
              <button type="button" className="menu-item-compact" title="Filters" onClick={() => setOpenMenu(openMenu === 'Filters' ? null : 'Filters')}>
                Filters
              </button>
              {openMenu === 'Filters' && (
                <div className="menu-dropdown menu-dropdown-compact">
                  <button onClick={handleFilterBrightness}>Brightness +</button>
                  <button onClick={handleFilterContrast}>Contrast +</button>
                  <button onClick={handleFilterSaturation}>Saturation +</button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={handleFilterBlur}>Blur</button>
                  <button onClick={handleFilterSharpen}>Sharpen</button>
                  <button onClick={handleFilterGrayscale}>Grayscale</button>
                  <button onClick={handleFilterInvert}>Invert</button>
                  <button onClick={handleFilterSepia}>Sepia</button>
                  <hr style={{ margin: '0.3rem 0', border: 'none', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }} />
                  <button onClick={resetFilters}>Reset All</button>
                </div>
              )}
            </div>

            {/* Collapse button */}
            <button type="button" className="menu-item-compact menu-tools-toggle" title="Collapse tools" onClick={() => setLeftSidebarCollapsed((prev) => !prev)}>
              Hide tools
            </button>
          </div>, menuHost)}

          <div className="photo-sidebar-toolbar">
            <p className="section-label">Tools</p>
          </div>

          {leftSidebarCollapsed ? (
            <button type="button" className="photo-sidebar-collapsed-card" onClick={() => setLeftSidebarCollapsed(false)} title="Open tools" aria-label="Open tools">
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ) : (
            <>
              <div className="tool-dock-shell">
                {KRITA_TOOL_GROUPS.map((group) => (
                  <div key={group.heading} className="tool-group">
                    <div className="tool-group-label">{group.heading}</div>
                    <div className="tool-button-grid">
                      {group.tools.map((tool) => {
                        const ToolIcon = tool.icon
                        const isActive = activeTool === tool.key || (tool.key === 'brush' && activeTool === 'brush')
                        const primaryAction = () => {
                          if (tool.key === 'brush') setActiveTool('brush')
                          else if (tool.key === 'rectangle') addShapeLayer('rectangle')
                          else if (tool.key === 'ellipse') addShapeLayer('ellipse')
                          else if (tool.key === 'triangle') addShapeLayer('triangle')
                          else if (tool.key === 'line') addShapeLayer('line')
                          else if (tool.key === 'crop') setActiveTool('crop')
                          else if (tool.key === 'select') setActiveTool('select')
                          else if (tool.key === 'heal') setActiveTool('heal')
                          else if (tool.key === 'eraser') setActiveTool('eraser')
                          else if (tool.key === 'zoom') setCanvasZoom((value) => clamp(value + 10, 25, 400))
                          else selectTool(tool.key)
                        }

                        return (
                          <button
                            key={tool.key}
                            type="button"
                            className={isActive ? 'tool-button active' : 'tool-button'}
                            onClick={primaryAction}
                            title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
                            aria-label={tool.label}
                          >
                            <ToolIcon size={17} strokeWidth={1.8} aria-hidden="true" />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                <div className="tool-group">
                  <div className="tool-group-label">Create</div>
                  <div className="tool-button-grid">
                    <button type="button" className="tool-button" onClick={addTextLayer} title="Add text" aria-label="Add text">
                      <Type size={17} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                    <details className="tool-sticker-menu">
                      <summary className="tool-button" title="Add sticker" aria-label="Add sticker">
                        <SmilePlus size={17} strokeWidth={1.8} aria-hidden="true" />
                      </summary>
                      <div className="tool-sticker-popover">
                        {STICKERS.map((sticker) => (
                          <button key={sticker} type="button" onClick={() => addStickerLayer(sticker)} title={`Add ${sticker}`}>
                            {sticker}
                          </button>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>
              </div>

              <div className="dock-actions" aria-label="Image source actions">
                <label className="photo-upload-chip compact-upload">
                  <Upload size={17} aria-hidden="true" />
                  <span>Upload</span>
                  <input ref={uploadInputRef} type="file" accept="image/*" onChange={handleUpload} />
                </label>
                <button type="button" className="photo-upload-chip compact-upload photo-stock-chip" onClick={() => setStockLibraryOpen(true)} title="Free stock photos, illustrations, and vectors">
                  <Images size={17} aria-hidden="true" />
                  <span>Stock images</span>
                </button>
              </div>
            </>
          )}
        </aside>

        <div className="photo-stage-panel">
          <div className="stage-chrome">
            <div>
              <p className="section-label">Canvas</p>
              <h3>{aspect.label} layout</h3>
            </div>
            <div className="stage-status">
              <span className="status-pill">{activeTool.toUpperCase()}</span>
              <p className="muted">{notice}</p>
            </div>
            <div className="canvas-controls" aria-label="Canvas controls">
              <button type="button" className="chip" onClick={() => setCanvasZoom((value) => clamp(value - 10, 25, 400))}>−</button>
              <span>{canvasZoom}%</span>
              <button type="button" className="chip" onClick={() => setCanvasZoom((value) => clamp(value + 10, 25, 400))}>+</button>
              <button type="button" className="chip" onClick={resetCanvasView}>Fit</button>
            </div>
          </div>

          <div
            ref={stageViewportRef}
            className="photo-stage-wrap"
            onPointerDownCapture={startCanvasPan}
            onContextMenu={(event) => {
              if (event.ctrlKey) event.preventDefault()
            }}
          >
            <div
              ref={stageRef}
              className={`photo-stage ${canvasBackground === 'transparent' ? 'photo-stage-transparent' : ''}`}
              onPointerDown={(event) => {
                if (event.target instanceof Element && event.target.closest('button, input, select, summary')) return
                if (activeTool === 'remove') startRemoveArea(event)
                else if (SELECTION_TOOLS.has(activeTool)) startSelection(event)
                else if (activeTool === 'fill') applyPaintBucket(event)
                else if (activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'heal') startBrushStroke(event)
              }}
              style={{
                width: `${stageDisplaySize.width}px`,
                height: `${stageDisplaySize.height}px`,
                aspectRatio: aspect.css,
                background: canvasBackground === 'transparent' ? undefined : canvasBackground,
                transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom / 100})`,
                cursor:
                  activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'heal' || SELECTION_TOOLS.has(activeTool)
                    ? 'crosshair'
                    : activeTool === 'remove'
                      ? 'crosshair'
                    : activeTool === 'fill'
                      ? 'cell'
                    : activeTool === 'crop' || activeTool === 'move'
                      ? 'move'
                      : 'default',
                clipPath: stageClipPath,
              }}
            >
              {selectedImageSrc ? (
                renderedImageSrc ? (
                  <img
                    className="photo-stage-image"
                    src={renderedImageSrc}
                    alt="Selected composition"
                    draggable={false}
                    style={{
                      filter: buildFilterString(filters),
                      opacity: (baseImageLayer?.opacity ?? 100) / 100,
                      clipPath: `inset(${cropRect.y}% ${100 - cropRect.x - cropRect.w}% ${100 - cropRect.y - cropRect.h}% ${cropRect.x}%)`,
                    }}
                  />
                ) : null
              ) : layers.length === 0 && brushStrokes.length === 0 ? (
                <div className="photo-stage-empty photo-stage-onboarding">
                  <p className="small-title">Start with your own media</p>
                  <ol>
                    <li><strong>Add a photo</strong> — upload an image from your device, or pick a free stock image.</li>
                    <li><strong>Add text, stickers, or shapes</strong> — use the toolbar on the left.</li>
                    <li><strong>Export</strong> when it looks right, using the button in the top right.</li>
                  </ol>
                  <div className="photo-stage-onboarding-actions">
                    <button type="button" className="primary-button" onClick={() => uploadInputRef.current?.click()}>Upload a photo</button>
                    <button type="button" className="ghost-button photo-stock-button" onClick={() => setStockLibraryOpen(true)}><Images size={16} aria-hidden="true" /> Browse stock images</button>
                  </div>
                </div>
              ) : null}

              {showGrid && <div className="photo-stage-grid-overlay" aria-hidden="true" />}
              {showGuides && (
                <div className="photo-stage-guides-overlay" aria-hidden="true">
                  <span className="photo-stage-guide-vertical" />
                  <span className="photo-stage-guide-horizontal" />
                </div>
              )}
              {showRulers && (
                <div className="photo-stage-rulers-overlay" aria-hidden="true">
                  <span className="photo-stage-ruler-top">0&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;25&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;50&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;75&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;100</span>
                  <span className="photo-stage-ruler-left">0<br />25<br />50<br />75<br />100</span>
                </div>
              )}

              {(selectedImageSrc || layers.length > 0 || brushStrokes.length > 0) && canvasBackground !== 'transparent' && (
                <>
                  {filters.vignette > 0 && <div className="photo-stage-vignette" style={{ opacity: clamp(filters.vignette / 100, 0, 1) }} />}
                  {filters.grain > 0 && <div className="photo-stage-noise" style={{ opacity: clamp(filters.grain / 80, 0, 0.22) }} />}
                </>
              )}
              <canvas ref={paintCanvasRef} className="photo-paint-layer" aria-hidden="true" />

              {activeTool === 'crop' && (
                <div className="crop-overlay">
                  <button
                    type="button"
                    className="crop-handle crop-handle-nw"
                    onPointerDown={(event) => startCropDrag(event, 'nw')}
                  />
                  <button
                    type="button"
                    className="crop-handle crop-handle-ne"
                    onPointerDown={(event) => startCropDrag(event, 'ne')}
                  />
                  <button
                    type="button"
                    className="crop-handle crop-handle-sw"
                    onPointerDown={(event) => startCropDrag(event, 'sw')}
                  />
                  <button
                    type="button"
                    className="crop-handle crop-handle-se"
                    onPointerDown={(event) => startCropDrag(event, 'se')}
                  />
                  <div
                    className="crop-frame"
                    onPointerDown={(event) => startCropDrag(event, 'move')}
                    style={{
                      left: `${cropRect.x}%`,
                      top: `${cropRect.y}%`,
                      width: `${cropRect.w}%`,
                      height: `${cropRect.h}%`,
                    }}
                  />
                </div>
              )}
              {activeTool === 'remove' && removeRect && (
                <div
                  className="remove-area-overlay"
                  style={{ left: `${removeRect.x}%`, top: `${removeRect.y}%`, width: `${removeRect.w}%`, height: `${removeRect.h}%` }}
                >
                  Remove area
                </div>
              )}

              {selection && imageFit && selection.width === activeWork?.width && (
                <div
                  className="photo-selection"
                  aria-hidden="true"
                  style={{
                    left: `${(imageFit.x / stageDisplaySize.width) * 100}%`,
                    top: `${(imageFit.y / stageDisplaySize.height) * 100}%`,
                    width: `${(imageFit.width / stageDisplaySize.width) * 100}%`,
                    height: `${(imageFit.height / stageDisplaySize.height) * 100}%`,
                  }}
                >
                  <img src={selection.tintUrl} alt="" draggable={false} />
                  <img className="photo-selection-ants" src={selection.edgeUrl} alt="" draggable={false} />
                </div>
              )}
              {marquee && (
                <div className="photo-marquee" aria-hidden="true" style={{ left: `${marquee.x}%`, top: `${marquee.y}%`, width: `${marquee.w}%`, height: `${marquee.h}%` }} />
              )}
              {lassoPoints.length > 0 && (
                <svg className="photo-lasso" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <polyline points={lassoPoints.map((point) => `${point.x},${point.y}`).join(' ')} vectorEffect="non-scaling-stroke" />
                  {activeTool === 'polygon' && lassoPoints.map((point, index) => (
                    <circle key={index} cx={point.x} cy={point.y} r={index === 0 ? 1.1 : 0.6} className={index === 0 ? 'first' : ''} />
                  ))}
                </svg>
              )}
              {busy && <div className="photo-busy" role="status"><span className="photo-busy-spinner" />{busy}</div>}

              {layers.filter((layer) => !layer.hidden && !layer.isBaseImage).map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  className={layer.id === resolvedActiveLayerId ? 'photo-layer active' : 'photo-layer'}
                  style={{
                    left: `${layer.x}%`,
                    top: `${layer.y}%`,
                    opacity: (layer.opacity ?? 100) / 100,
                    mixBlendMode: cssBlend(layer.blendMode),
                    cursor: activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'heal' ? 'crosshair' : 'grab',
                    transform: `${
                      layer.type === 'sticker' || layer.type === 'shape' || layer.type === 'image'
                        ? 'translate(-50%, -50%)'
                        : layer.align === 'center'
                          ? 'translate(-50%, -50%)'
                          : layer.align === 'right'
                            ? 'translate(-100%, -50%)'
                            : 'translate(0, -50%)'
                    } rotate(${layer.rotation || 0}deg)`,
                  }}
                  onPointerDown={(event) => beginDrag(layer, event)}
                  onClick={() => { setActiveLayerId(layer.id); setActiveTool('select') }}
                >
                  {layer.type === 'image' ? (
                    <img
                      src={layer.src}
                      alt={layer.label}
                      style={{
                        display: 'block',
                        width: `${(layer.width / 100) * stageDisplaySize.width}px`,
                        height: 'auto',
                      }}
                    />
                  ) : layer.type === 'shape' ? (
                    <span
                      style={{
                        display: 'block',
                        width: `${(layer.width / 100) * stageDisplaySize.width}px`,
                        height: `${(layer.height / 100) * stageDisplaySize.height}px`,
                        background: layer.filled === false ? 'transparent' : layer.color,
                        border: layer.strokeWidth > 0 ? `${layer.strokeWidth}px solid ${layer.strokeColor}` : 'none',
                        borderRadius:
                          layer.shape === 'ellipse' ? '50%' : `${layer.radius || 0}px`,
                        clipPath:
                          layer.shape === 'triangle' ? 'polygon(50% 0%, 100% 100%, 0% 100%)' : 'none',
                      }}
                    />
                  ) : layer.type === 'sticker' ? (
                    <span style={{ fontSize: `${layer.fontSize}px` }}>{layer.value}</span>
                  ) : (
                    <span
                      style={{
                        fontSize: `${layer.fontSize}px`,
                        fontWeight: layer.weight,
                        fontFamily: layer.fontFamily
                          ? `"${layer.fontFamily}", Inter, system-ui, sans-serif`
                          : undefined,
                        color: layer.color,
                        textAlign: layer.align,
                        filter: layer.effect === 'glow' ? 'drop-shadow(0 0 12px rgba(255,255,255,0.7))' : 'none',
                        maxWidth: '18ch',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {layer.value}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

        </div>

        <aside className={`photo-sidebar photo-sidebar-right ${rightSidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="photo-sidebar-toolbar">
            <p className="section-label">Inspector</p>
            <button type="button" className="ghost-button" onClick={() => setRightSidebarCollapsed((prev) => !prev)}>
              {rightSidebarCollapsed ? 'Open' : 'Collapse'}
            </button>
          </div>

          {rightSidebarCollapsed ? (
            <button type="button" className="photo-sidebar-collapsed-card" onClick={() => setRightSidebarCollapsed(false)} title="Open inspector" aria-label="Open inspector">
              <PanelRightOpen size={18} aria-hidden="true" />
            </button>
          ) : (
            <>
          {schoolPractice && (
            <div className="panel-block photo-practice-guide">
              <div className="photo-practice-heading"><span>Guided practice</span><strong>{schoolPractice.title}</strong></div>
              <p>{schoolPractice.exercise}</p>
              <ol>{schoolPractice.practice.checklist.map((item) => <li key={item}>{item}</li>)}</ol>
              <div className="photo-practice-actions">
                <button type="button" onClick={() => setWorkspaceView('school')}>Back to lesson</button>
                <button type="button" className={schoolPracticeCompleted ? 'completed' : ''} onClick={completeSchoolPractice}><Check size={14} /> {schoolPracticeCompleted ? 'Completed' : 'Finish lesson'}</button>
              </div>
            </div>
          )}
          <div className="panel-block photo-layers-panel">
            <div className="photo-sidebar-toolbar">
              <p className="section-label">Layers</p>
              <span className="muted">Top is in front · right-click for options</span>
            </div>
            {activeLayer && (
              <div className="photo-layers-props">
                <select aria-label="Blend mode" title="Blend mode" value={activeLayer.blendMode || 'source-over'} onChange={(event) => { commitHistory(); updateLayer(activeLayer.id, { blendMode: event.target.value }) }}>
                  {Object.entries(BLEND_MODES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
                <label>
                  <span>Opacity</span>
                  <input type="number" min="0" max="100" value={activeLayer.opacity ?? 100} onFocus={commitHistory} onChange={(event) => updateLayer(activeLayer.id, { opacity: clamp(Number(event.target.value) || 0, 0, 100) })} />
                </label>
              </div>
            )}
            <ul className="photo-layers-list">
              {[...layers].reverse().map((layer) => (
                <li
                  key={`manage-${layer.id}`}
                  className={`${layer.id === resolvedActiveLayerId ? 'active' : ''} ${layer.hidden ? 'is-hidden' : ''}`}
                  onClick={() => { setActiveLayerId(layer.id); setActiveTool('select') }}
                  onDoubleClick={() => setRenamingLayerId(layer.id)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setActiveLayerId(layer.id)
                    setLayerMenu({ x: event.clientX, y: event.clientY, layerId: layer.id })
                  }}
                >
                  <button type="button" className="photo-layer-eye" title={layer.hidden ? 'Show layer' : 'Hide layer'} aria-label={layer.hidden ? `Show ${layer.label}` : `Hide ${layer.label}`} onClick={(event) => { event.stopPropagation(); toggleLayerVisibility(layer.id) }}>
                    {layer.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <span className="photo-layer-thumb" aria-hidden="true">
                    {layer.type === 'image' ? <img src={layer.src} alt="" /> : layer.type === 'shape' ? <span style={{ background: layer.color, borderRadius: layer.shape === 'ellipse' ? '50%' : 3 }} /> : layer.type === 'sticker' ? layer.value : <strong style={{ color: normalizeColorInputValue(layer.color, '#0f172a') }}>T</strong>}
                  </span>
                  {renamingLayerId === layer.id ? (
                    <input
                      className="photo-layer-rename"
                      autoFocus
                      defaultValue={layer.label}
                      onClick={(event) => event.stopPropagation()}
                      onBlur={(event) => {
                        const label = event.target.value.trim()
                        if (label && label !== layer.label) {
                          commitHistory()
                          updateLayer(layer.id, { label })
                        }
                        setRenamingLayerId('')
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur()
                        if (event.key === 'Escape') setRenamingLayerId('')
                      }}
                    />
                  ) : (
                    <span className="photo-layer-name" title="Double-click to rename">{layer.label}</span>
                  )}
                  {layer.blendMode && layer.blendMode !== 'source-over' && <small className="photo-layer-blend">{BLEND_MODES[layer.blendMode]}</small>}
                </li>
              ))}
              <li className="photo-layer-fill">
                <span className="photo-layer-eye" aria-hidden="true" />
                <span className={`photo-layer-thumb ${canvasBackground === 'transparent' ? 'is-transparent' : ''}`} style={canvasBackground === 'transparent' ? undefined : { background: canvasBackground }} aria-hidden="true" />
                <span className="photo-layer-name">Fill</span>
                <input type="color" aria-label="Fill color" title="Solid color fill behind everything" value={canvasBackground === 'transparent' ? '#ffffff' : normalizeColorInputValue(canvasBackground, '#ffffff')} onPointerDown={commitHistory} onChange={(event) => setCanvasBackground(event.target.value)} />
                <button type="button" className="chip" onClick={() => setBackgroundFill(canvasBackground === 'transparent' ? '#000000' : 'transparent')} title="Transparent exports as a PNG with no background">
                  {canvasBackground === 'transparent' ? 'Solid' : 'None'}
                </button>
              </li>
            </ul>
            <div className="photo-layers-footer" aria-label="Layer actions">
              <button type="button" title="Add layer mask from selection" onClick={addLayerMaskFromSelection} disabled={!selection}><span className="photo-mask-icon" aria-hidden="true" /></button>
              <button type="button" title="Remove background" onClick={removeBackground} disabled={!selectedImageSrc}><Sparkles size={14} /></button>
              <button type="button" title="Hue/Saturation (Ctrl+U)" onClick={openHueSat} disabled={!selectedImageSrc}><SlidersHorizontal size={14} /></button>
              <button type="button" title="New text layer (T)" onClick={addTextLayer}><Type size={14} /></button>
              <button type="button" title="Bring forward" onClick={() => activeLayer && moveLayerOrder(activeLayer.id, 1)} disabled={!activeLayer}>↑</button>
              <button type="button" title="Send backward" onClick={() => activeLayer && moveLayerOrder(activeLayer.id, -1)} disabled={!activeLayer}>↓</button>
              <button type="button" title="Duplicate layer (Ctrl+J)" onClick={() => activeLayer && duplicateLayer(activeLayer.id)} disabled={!activeLayer}>⧉</button>
              <button type="button" title="Delete layer" onClick={() => activeLayer && deleteLayer(activeLayer.id)} disabled={!activeLayer}>✕</button>
            </div>
          </div>

          <div className="panel-block">
            <p className="section-label">Inspector</p>
            <label>
              Aspect ratio
              <select value={aspectRatio} onChange={(event) => {
                setAspectRatio(event.target.value)
                if (event.target.value !== 'custom') setCustomCanvasSize(null)
              }}>
                {Object.entries(ASPECT_RATIOS).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
                {customCanvasSize && <option value="custom">{customCanvasSize.label} ({customCanvasSize.width} × {customCanvasSize.height})</option>}
              </select>
            </label>
            <label>
              Active layer
              <select value={resolvedActiveLayerId} onChange={(event) => { setActiveLayerId(event.target.value); setActiveTool('select') }}>
                {layers.map((layer) => (
                  <option key={layer.id} value={layer.id}>{layer.label}</option>
                ))}
              </select>
            </label>
            <label>
              Layer effect
              <select
                value={activeTextLayer?.effect ?? 'none'}
                onChange={(event) => updateTextEffect({ effect: event.target.value })}
                disabled={!activeTextLayer}
              >
                {Object.entries(TEXT_EFFECTS).map(([key, value]) => (
                  <option key={key} value={key}>{value}</option>
                ))}
              </select>
            </label>
            {layers.map((layer) =>
              layer.id === resolvedActiveLayerId ? (
                <div key={layer.id} className="layer-inspector">
                  <label>
                    Content
                    <input
                      value={layer.value}
                      onChange={(event) => updateLayer(layer.id, { value: event.target.value })}
                    />
                  </label>
                  <label>
                    Size
                    <input
                      type="range"
                      min="16"
                      max="96"
                      value={layer.fontSize}
                      onChange={(event) => updateLayer(layer.id, { fontSize: Number(event.target.value) })}
                    />
                  </label>
                  <label className="slider-row">
                    <span>Opacity {layer.opacity ?? 100}%</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={layer.opacity ?? 100}
                      onPointerDown={commitHistory}
                      onChange={(event) => updateLayer(layer.id, { opacity: Number(event.target.value) })}
                    />
                  </label>
                  <label className="slider-row">
                    <span>Rotation {layer.rotation ?? 0}°</span>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      value={layer.rotation ?? 0}
                      onPointerDown={commitHistory}
                      onChange={(event) => updateLayer(layer.id, { rotation: Number(event.target.value) })}
                    />
                  </label>
                  {layer.type === 'shape' && (
                    <>
                      <label className="slider-row">
                        <span>Width</span>
                        <input
                          type="range"
                          min="2"
                          max="100"
                          value={layer.width}
                          onPointerDown={commitHistory}
                          onChange={(event) => updateLayer(layer.id, { width: Number(event.target.value) })}
                        />
                      </label>
                      <label className="slider-row">
                        <span>Height</span>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={layer.height}
                          onPointerDown={commitHistory}
                          onChange={(event) => updateLayer(layer.id, { height: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        Fill color
                        <input
                          type="color"
                          value={normalizeColorInputValue(layer.color, '#67e8f9')}
                          onChange={(event) => updateLayer(layer.id, { color: event.target.value })}
                        />
                      </label>
                      <label>
                        Border width
                        <input
                          type="range"
                          min="0"
                          max="24"
                          value={layer.strokeWidth ?? 0}
                          onPointerDown={commitHistory}
                          onChange={(event) => updateLayer(layer.id, { strokeWidth: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        Border color
                        <input
                          type="color"
                          value={normalizeColorInputValue(layer.strokeColor, '#f9a8d4')}
                          onChange={(event) => updateLayer(layer.id, { strokeColor: event.target.value })}
                        />
                      </label>
                      <label>
                        Filled
                        <input
                          type="checkbox"
                          checked={layer.filled !== false}
                          onChange={(event) => updateLayer(layer.id, { filled: event.target.checked })}
                        />
                      </label>
                    </>
                  )}
                  <label>
                    X position
                    <input
                      type="range"
                      min="4"
                      max="92"
                      value={layer.x}
                      onChange={(event) => updateLayer(layer.id, { x: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    Y position
                    <input
                      type="range"
                      min="6"
                      max="88"
                      value={layer.y}
                      onChange={(event) => updateLayer(layer.id, { y: Number(event.target.value) })}
                    />
                  </label>
                  {layer.type === 'text' && (
                    <>
                      <label>
                        Outline width
                        <input
                          type="range"
                          min="0"
                          max="12"
                          value={layer.outlineWidth ?? 0}
                          onChange={(event) => updateLayer(layer.id, { outlineWidth: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        Outline color
                        <input
                          type="color"
                          value={layer.outlineColor ?? '#020617'}
                          onChange={(event) => updateLayer(layer.id, { outlineColor: event.target.value })}
                        />
                      </label>
                      <label>
                        Shadow blur
                        <input
                          type="range"
                          min="0"
                          max="40"
                          value={layer.shadowBlur ?? 0}
                          onChange={(event) => updateLayer(layer.id, { shadowBlur: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        Shadow color
                        <input
                          type="color"
                          value={normalizeColorInputValue(layer.shadowColor, '#020617')}
                          onChange={(event) => updateLayer(layer.id, { shadowColor: event.target.value })}
                        />
                      </label>
                      <label>
                        Panel color
                        <input
                          type="color"
                          value={normalizeColorInputValue(layer.panelColor, '#0f172a')}
                          onChange={(event) => updateLayer(layer.id, { panelColor: `${event.target.value}cc` })}
                        />
                      </label>
                      <label>
                        Letter spacing
                        <input
                          type="range"
                          min="-2"
                          max="8"
                          step="0.5"
                          value={layer.letterSpacing ?? 0}
                          onChange={(event) => updateLayer(layer.id, { letterSpacing: Number(event.target.value) })}
                        />
                      </label>
                    </>
                  )}
                  {layer.type === 'text' && (
                    <label>
                      Color
                      <input
                        type="color"
                        value={layer.color}
                        onChange={(event) => updateLayer(layer.id, { color: event.target.value })}
                      />
                    </label>
                  )}
                  <button type="button" className="ghost-button full-width" onClick={() => deleteLayer(layer.id)}>
                    Remove layer
                  </button>
                </div>
              ) : null,
            )}
          </div>

          <div className="panel-block">
            <div className="photo-sidebar-toolbar">
              <p className="section-label">Adjustments</p>
              <button type="button" className="ghost-button" onClick={resetFilters}>Reset</button>
            </div>
            {[
              ['brightness', 'Brightness'],
              ['exposure', 'Exposure'],
              ['contrast', 'Contrast'],
              ['saturation', 'Saturation'],
              ['hue', 'Hue'],
              ['sepia', 'Sepia'],
              ['grayscale', 'Black & white'],
              ['invert', 'Invert'],
              ['blur', 'Blur'],
              ['vignette', 'Vignette'],
              ['grain', 'Grain'],
            ].map(([key, label]) => (
              <label key={key} className="slider-row">
                <span>{label}</span>
                <input
                  type="range"
                  min={key === 'blur' ? 0 : key === 'hue' ? -45 : 0}
                  max={
                    key === 'blur'
                      ? 6
                      : key === 'hue'
                        ? 45
                        : ['sepia', 'grayscale', 'invert'].includes(key)
                          ? 100
                          : 200
                  }
                  step={key === 'blur' ? 0.1 : 1}
                  value={filters[key]}
                  // One undo step per drag, rather than one per pixel moved.
                  onPointerDown={commitHistory}
                  onChange={(event) => setFilters((prev) => ({ ...prev, [key]: Number(event.target.value) }))}
                />
              </label>
            ))}
          </div>

          <div className="panel-block">
            <p className="section-label">Export</p>
            <label>
              Format
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                {Object.entries(EXPORT_FORMATS).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            </label>
            {EXPORT_FORMATS[exportFormat]?.lossy && (
              <label className="slider-row">
                <span>Quality {exportQuality}%</span>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={exportQuality}
                  onChange={(event) => setExportQuality(Number(event.target.value))}
                />
              </label>
            )}
          </div>

          <div className="panel-block">
            <p className="section-label">Brand kit</p>
            {(brandKit?.colors?.length || brandKit?.fonts?.length || brandKit?.logos?.length) ? (
              <>
                {brandKit.colors?.length > 0 && (
                  <>
                    <p className="muted">Colours — click to apply to the selected layer</p>
                    <div className="chip-row">
                      {brandKit.colors.map((color) => (
                        <button
                          key={color.id}
                          type="button"
                          className="chip"
                          title={`${color.label} ${color.value}`}
                          onClick={() => applyBrandColor(color.value)}
                          style={{
                            background: color.value,
                            color: '#fff',
                            textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                          }}
                        >
                          {color.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {brandKit.fonts?.length > 0 && (
                  <label>
                    Brand font
                    <select
                      value={activeTextLayer?.fontFamily ?? ''}
                      disabled={!activeTextLayer}
                      onChange={(event) => applyBrandFont(event.target.value)}
                    >
                      <option value="">Default (Inter)</option>
                      {brandKit.fonts
                        .filter((font) => font.family)
                        .map((font) => (
                          <option key={font.id} value={font.family}>
                            {font.label || font.family}
                          </option>
                        ))}
                    </select>
                  </label>
                )}

                {brandKit.logos?.length > 0 && (
                  <>
                    <p className="muted">Logos</p>
                    <div className="chip-row">
                      {brandKit.logos.map((logo) => (
                        <button
                          key={logo.id}
                          type="button"
                          className="chip"
                          onClick={() => addLogoLayer(logo)}
                          title={`Add ${logo.label}`}
                        >
                          <img src={logo.dataUrl} alt={logo.label} style={{ height: 22, width: 'auto' }} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="muted">
                No brand kit yet. Add your colours, licensed fonts, and logos under Integrations →
                Brand kit and they&apos;ll show up here.
              </p>
            )}
          </div>

          <div className="panel-block">
            <p className="section-label">Concept notes</p>
            <div className="concept-card">
              <strong>{headline}</strong>
              <p>{subcopy}</p>
              <small>Preset: {preset.label}</small>
            </div>
          </div>
            </>
          )}
        </aside>
      </div>
      {stockLibraryOpen && createPortal(
        <StockLibrary initialKind="image" initialQuery={stockLibraryOpen === 'logo' ? '' : undefined} initialImageType={stockLibraryOpen === 'logo' ? 'vector' : 'all'} kinds={['image']} onClose={() => setStockLibraryOpen(false)} onAdd={addFromStockLibrary} />,
        document.body,
      )}
      {hueSatDialog && createPortal(
        <PhotoHueSaturationDialog initial={hueSatDialog.initial} onPreview={setHueSat} onApply={applyHueSat} onCancel={cancelHueSat} />,
        document.body,
      )}
      {shortcutsOpen && createPortal(<PhotoShortcutsOverlay onClose={() => setShortcutsOpen(false)} />, document.body)}
      {layerMenu && createPortal(
        <div className="photo-context-backdrop" onClick={() => setLayerMenu(null)} onContextMenu={(event) => { event.preventDefault(); setLayerMenu(null) }}>
          <div className="photo-context-menu" role="menu" style={{ left: Math.min(layerMenu.x, window.innerWidth - 240), top: Math.min(layerMenu.y, window.innerHeight - 320) }} onClick={(event) => event.stopPropagation()}>
            {layerMenu.layerId === '__photo' ? (
              <>
                <button type="button" role="menuitem" onClick={() => runMenuAction(openHueSat)}>Hue/Saturation… <kbd>Ctrl+U</kbd></button>
                <button type="button" role="menuitem" onClick={() => runMenuAction(removeBackground)}>Remove background</button>
                <button type="button" role="menuitem" onClick={() => runMenuAction(addLayerMaskFromSelection)} disabled={!selection}>Add layer mask from selection</button>
                <hr />
                <button type="button" role="menuitem" onClick={() => runMenuAction(toggleLayerMask)} disabled={!layerMask}>{layerMask?.enabled === false ? 'Enable' : 'Disable'} layer mask</button>
                <button type="button" role="menuitem" onClick={() => runMenuAction(invertLayerMask)} disabled={!layerMask}>Invert layer mask</button>
                <button type="button" role="menuitem" onClick={() => runMenuAction(deleteLayerMask)} disabled={!layerMask}>Delete layer mask</button>
                <hr />
                <button type="button" role="menuitem" onClick={() => runMenuAction(() => transformBase('flip-h', 'Flipped the photo horizontally.'))}>Flip horizontal</button>
                <button type="button" role="menuitem" onClick={() => runMenuAction(flattenImage)}>Flatten image <kbd>Ctrl+Shift+E</kbd></button>
              </>
            ) : menuLayer ? (
              <>
                <button type="button" role="menuitem" onClick={() => runMenuAction(() => duplicateLayer(menuLayer.id))}>Duplicate layer <kbd>Ctrl+J</kbd></button>
                <button type="button" role="menuitem" onClick={() => runMenuAction(() => setRenamingLayerId(menuLayer.id))}>Rename layer…</button>
                <button type="button" role="menuitem" onClick={() => runMenuAction(() => toggleLayerVisibility(menuLayer.id))}>{menuLayer.hidden ? 'Show' : 'Hide'} layer</button>
                <hr />
                <button type="button" role="menuitem" onClick={() => runMenuAction(() => moveLayerOrder(menuLayer.id, 1))}>Bring forward</button>
                <button type="button" role="menuitem" onClick={() => runMenuAction(() => moveLayerOrder(menuLayer.id, -1))}>Send backward</button>
                <hr />
                <button type="button" role="menuitem" onClick={() => quickExportLayer(menuLayer)}>Quick export as PNG</button>
                <button type="button" role="menuitem" onClick={() => runMenuAction(flattenImage)}>Flatten image</button>
                <hr />
                <button type="button" role="menuitem" className="danger" onClick={() => runMenuAction(() => deleteLayer(menuLayer.id))}>Delete layer</button>
              </>
            ) : null}
          </div>
        </div>,
        document.body,
      )}
    </section>
  )
}