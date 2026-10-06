export const DEFAULT_EFFECTS = { brightness: 100, contrast: 100, saturate: 100, blur: 0, hue: 0 }

export const FILTER_PRESETS = {
  none: { label: 'None', css: '', group: 'Clean' },
  natural: { label: 'Natural', css: 'contrast(105%) saturate(105%)', group: 'Clean' },
  crisp: { label: 'Crisp', css: 'contrast(120%) saturate(110%)', group: 'Clean' },
  bright: { label: 'Airy', css: 'brightness(115%) contrast(95%) saturate(90%)', group: 'Clean' },
  soft: { label: 'Soft matte', css: 'contrast(85%) brightness(108%) saturate(85%)', group: 'Clean' },
  vintage: { label: 'Vintage', css: 'sepia(45%) contrast(110%) saturate(85%)', group: 'Film' },
  retro: { label: 'Retro', css: 'sepia(25%) hue-rotate(-15deg) saturate(140%)', group: 'Film' },
  cinema: { label: 'Cinema', css: 'contrast(125%) saturate(80%) brightness(95%)', group: 'Film' },
  faded: { label: 'Faded film', css: 'sepia(15%) contrast(80%) brightness(110%)', group: 'Film' },
  amber: { label: 'Amber', css: 'sepia(35%) saturate(135%) contrast(108%)', group: 'Film' },
  cool: { label: 'Cool', css: 'hue-rotate(180deg) saturate(115%) brightness(105%)', group: 'Color' },
  warm: { label: 'Warm', css: 'sepia(20%) saturate(130%) brightness(105%)', group: 'Color' },
  vibrant: { label: 'Vibrant', css: 'saturate(155%) contrast(110%)', group: 'Color' },
  muted: { label: 'Muted', css: 'saturate(55%) contrast(105%)', group: 'Color' },
  sunset: { label: 'Sunset', css: 'sepia(30%) hue-rotate(-15deg) saturate(145%)', group: 'Color' },
  mono: { label: 'B&W', css: 'grayscale(100%) contrast(115%)', group: 'Mono' },
  noir: { label: 'Noir', css: 'grayscale(100%) contrast(160%) brightness(90%)', group: 'Mono' },
  silver: { label: 'Silver', css: 'grayscale(100%) contrast(90%) brightness(115%)', group: 'Mono' },
  dreamy: { label: 'Dreamy', css: 'blur(1px) brightness(110%) saturate(120%)', group: 'Creative' },
}

export const EFFECT_PRESETS = {
  neutral: { label: 'Neutral', group: 'Correction', effects: { ...DEFAULT_EFFECTS } },
  brighten: { label: 'Brighten', group: 'Correction', effects: { ...DEFAULT_EFFECTS, brightness: 120, contrast: 105 } },
  contrast: { label: 'Punchy', group: 'Correction', effects: { ...DEFAULT_EFFECTS, contrast: 135, saturate: 115 } },
  desaturate: { label: 'Low saturation', group: 'Correction', effects: { ...DEFAULT_EFFECTS, saturate: 45 } },
  vivid: { label: 'Vivid color', group: 'Correction', effects: { ...DEFAULT_EFFECTS, saturate: 160, contrast: 110 } },
  soften: { label: 'Soft focus', group: 'Creative', effects: { ...DEFAULT_EFFECTS, blur: 2, brightness: 105 } },
  frosted: { label: 'Frosted blur', group: 'Creative', effects: { ...DEFAULT_EFFECTS, blur: 6, saturate: 75 } },
  hue: { label: 'Color shift', group: 'Creative', effects: { ...DEFAULT_EFFECTS, hue: 45, saturate: 125 } },
  dramatic: { label: 'Dramatic', group: 'Creative', effects: { ...DEFAULT_EFFECTS, brightness: 85, contrast: 150, saturate: 80 } },
}

export const TRANSITION_PRESETS = {
  none: { label: 'None', kind: 'none', seconds: 0.6, group: 'Basic' },
  fade: { label: 'Fade', kind: 'fade', seconds: 0.6, group: 'Fade' },
  'fade-fast': { label: 'Quick fade', kind: 'fade', seconds: 0.25, group: 'Fade' },
  'fade-slow': { label: 'Gentle fade', kind: 'fade', seconds: 1.2, group: 'Fade' },
  slide: { label: 'Slide', kind: 'slide', seconds: 0.6, group: 'Slide' },
  'slide-right': { label: 'Reverse slide', kind: 'slide', seconds: 0.6, direction: -1, group: 'Slide' },
  'slide-fast': { label: 'Quick slide', kind: 'slide', seconds: 0.3, group: 'Slide' },
  zoom: { label: 'Zoom', kind: 'zoom', seconds: 0.6, group: 'Zoom' },
  'zoom-out': { label: 'Zoom from small', kind: 'zoom', seconds: 0.6, amount: -0.25, group: 'Zoom' },
  'zoom-slow': { label: 'Gentle zoom', kind: 'zoom', seconds: 1.2, group: 'Zoom' },
  wipe: { label: 'Wipe', kind: 'wipe', seconds: 0.6, group: 'Wipe' },
  'wipe-fast': { label: 'Quick wipe', kind: 'wipe', seconds: 0.25, group: 'Wipe' },
}

export const TRANSITIONS = Object.fromEntries(Object.entries(TRANSITION_PRESETS).map(([key, preset]) => [key, preset.label]))

export const buildClipFilter = (clip) => {
  if (!clip) return 'none'
  const effects = { ...DEFAULT_EFFECTS, ...(clip.effects ?? {}) }
  const preset = FILTER_PRESETS[clip.filter ?? 'none']?.css ?? ''
  const adjustments = [
    `brightness(${effects.brightness}%)`,
    `contrast(${effects.contrast}%)`,
    `saturate(${effects.saturate}%)`,
    `hue-rotate(${effects.hue}deg)`,
    effects.blur > 0 ? `blur(${effects.blur}px)` : '',
  ].filter(Boolean).join(' ')
  return [preset, adjustments].filter(Boolean).join(' ') || 'none'
}

export const transitionStateAt = (clip, localTime) => {
  const preset = TRANSITION_PRESETS[clip?.transition ?? 'none']
  const neutral = { opacity: 1, scale: 1, offset: 0, clip: 0 }
  if (!preset || preset.kind === 'none' || !clip) return neutral
  const length = Math.min(preset.seconds, clip.duration / 2)
  if (length <= 0) return neutral
  const fadingIn = localTime < length
  const fadingOut = localTime > clip.duration - length
  if (!fadingIn && !fadingOut) return neutral
  const progress = fadingIn ? localTime / length : (clip.duration - localTime) / length
  const eased = Math.max(0, Math.min(1, progress))
  if (preset.kind === 'fade') return { ...neutral, opacity: eased }
  if (preset.kind === 'zoom') return { ...neutral, opacity: eased, scale: 1 + (1 - eased) * (preset.amount ?? 0.25) }
  if (preset.kind === 'slide') return { ...neutral, offset: (1 - eased) * (fadingIn ? -1 : 1) * (preset.direction ?? 1) }
  if (preset.kind === 'wipe') return { ...neutral, clip: 1 - eased }
  return neutral
}
