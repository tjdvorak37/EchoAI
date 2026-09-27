// Pure pixel operations for the Photo Editor. Everything here works on plain
// { data, width, height } objects so it runs (and is tested) outside a browser.

export const HUE_RANGES = {
  master: { label: 'Master', center: null, swatch: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' },
  reds: { label: 'Reds', center: 0, swatch: '#ef4444' },
  yellows: { label: 'Yellows', center: 60, swatch: '#eab308' },
  greens: { label: 'Greens', center: 120, swatch: '#22c55e' },
  cyans: { label: 'Cyans', center: 180, swatch: '#06b6d4' },
  blues: { label: 'Blues', center: 240, swatch: '#3b82f6' },
  magentas: { label: 'Magentas', center: 300, swatch: '#d946ef' },
}

const neutralRange = () => ({ hue: 0, saturation: 0, lightness: 0 })

export const defaultHueSat = () => ({
  colorize: false,
  colorizeHue: 0,
  colorizeSaturation: 25,
  colorizeLightness: 0,
  ranges: Object.fromEntries(Object.keys(HUE_RANGES).map((key) => [key, neutralRange()])),
})

export const HUE_SAT_PRESETS = {
  default: { label: 'Default', build: () => defaultHueSat() },
  desaturate: { label: 'Desaturate (muted)', build: () => withMaster({ saturation: -80 }) },
  blackWhite: { label: 'Black & white', build: () => withMaster({ saturation: -100 }) },
  strong: { label: 'Strong saturation', build: () => withMaster({ saturation: 40 }) },
  sepia: { label: 'Sepia', build: () => ({ ...defaultHueSat(), colorize: true, colorizeHue: 35, colorizeSaturation: 30 }) },
  cyanotype: { label: 'Cyanotype', build: () => ({ ...defaultHueSat(), colorize: true, colorizeHue: 205, colorizeSaturation: 35 }) },
  oldStyle: { label: 'Old style', build: () => withMaster({ saturation: -45, lightness: 6 }) },
  redBoost: { label: 'Increase reds', build: () => withRange('reds', { saturation: 45 }) },
  greenBoost: { label: 'Lush greens', build: () => withRange('greens', { saturation: 40, lightness: -5 }) },
}

function withMaster(patch) {
  return withRange('master', patch)
}

function withRange(key, patch) {
  const settings = defaultHueSat()
  settings.ranges[key] = { ...settings.ranges[key], ...patch }
  return settings
}

export const isNeutralHueSat = (settings) => {
  if (!settings) return true
  if (settings.colorize) return false
  return Object.values(settings.ranges ?? {}).every((range) => !range.hue && !range.saturation && !range.lightness)
}

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value)

export const rgbToHsl = (r, g, b) => {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return [h * 60, s, l]
}

const hueToChannel = (p, q, t) => {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

export const hslToRgb = (h, s, l) => {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const hn = (((h % 360) + 360) % 360) / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hueToChannel(p, q, hn + 1 / 3) * 255),
    Math.round(hueToChannel(p, q, hn) * 255),
    Math.round(hueToChannel(p, q, hn - 1 / 3) * 255),
  ]
}

// Photoshop-style range weighting: full effect within 15° of the centre, fading out by 45°.
export const rangeWeight = (hue, center) => {
  const distance = Math.abs(((hue - center + 540) % 360) - 180)
  if (distance <= 15) return 1
  if (distance >= 45) return 0
  return 1 - (distance - 15) / 30
}

const adjustSaturation = (s, amount) => (amount < 0 ? s * (1 + amount / 100) : clamp01(s + (1 - s) * (amount / 100) * Math.min(1, s * 3)))
const adjustLightness = (l, amount) => (amount < 0 ? l * (1 + amount / 100) : l + (1 - l) * (amount / 100))

export const applyHueSaturation = (image, settings) => {
  if (isNeutralHueSat(settings)) return image
  const { data } = image
  const ranges = settings.ranges ?? {}
  const master = ranges.master ?? neutralRange()
  const colorRanges = Object.entries(HUE_RANGES)
    .filter(([key, meta]) => meta.center !== null && ranges[key] && (ranges[key].hue || ranges[key].saturation || ranges[key].lightness))
    .map(([key, meta]) => ({ center: meta.center, ...ranges[key] }))

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    let h
    let s
    let l

    if (settings.colorize) {
      h = settings.colorizeHue ?? 0
      s = clamp01((settings.colorizeSaturation ?? 25) / 100)
      l = adjustLightness((0.299 * r + 0.587 * g + 0.114 * b) / 255, settings.colorizeLightness ?? 0)
    } else {
      ;[h, s, l] = rgbToHsl(r, g, b)
      let hueShift = master.hue
      let satShift = master.saturation
      let lightShift = master.lightness
      if (colorRanges.length && s > 0.02) {
        const chroma = Math.min(1, s * 4)
        for (const range of colorRanges) {
          const weight = rangeWeight(h, range.center) * chroma
          if (!weight) continue
          hueShift += range.hue * weight
          satShift += range.saturation * weight
          lightShift += range.lightness * weight
        }
      }
      h += hueShift
      s = adjustSaturation(s, Math.max(-100, Math.min(100, satShift)))
      l = clamp01(adjustLightness(l, Math.max(-100, Math.min(100, lightShift))))
    }

    const [nr, ng, nb] = hslToRgb(h, s, l)
    data[index] = nr
    data[index + 1] = ng
    data[index + 2] = nb
  }
  return image
}

const colorDistance = (data, index, r, g, b) => {
  const dr = data[index] - r
  const dg = data[index + 1] - g
  const db = data[index + 2] - b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

// Estimates the backdrop from the image border, then flood-fills it inward from every edge.
// Strong on plain/studio backgrounds; busy scenes return a low `confidence`.
export const selectSubjectMask = (image, { tolerance = 42 } = {}) => {
  const { data, width, height } = image
  const buckets = new Map()
  const borderIndexes = []
  const pushBorder = (x, y) => borderIndexes.push((y * width + x) * 4)
  for (let x = 0; x < width; x += 1) {
    pushBorder(x, 0)
    pushBorder(x, height - 1)
  }
  for (let y = 1; y < height - 1; y += 1) {
    pushBorder(0, y)
    pushBorder(width - 1, y)
  }
  for (const index of borderIndexes) {
    const key = ((data[index] >> 3) << 10) | ((data[index + 1] >> 3) << 5) | (data[index + 2] >> 3)
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
    bucket.count += 1
    bucket.r += data[index]
    bucket.g += data[index + 1]
    bucket.b += data[index + 2]
    buckets.set(key, bucket)
  }
  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count)
  const palette = []
  let covered = 0
  for (const bucket of sorted) {
    palette.push([bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count])
    covered += bucket.count
    if (covered / borderIndexes.length >= 0.9 || palette.length >= 12) break
  }

  const isBackdrop = (index) => palette.some(([r, g, b]) => colorDistance(data, index, r, g, b) <= tolerance)
  const background = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  for (const index of borderIndexes) {
    const pixel = index / 4
    if (!background[pixel] && isBackdrop(index)) {
      background[pixel] = 1
      queue[tail++] = pixel
    }
  }
  while (head < tail) {
    const pixel = queue[head++]
    const x = pixel % width
    const y = (pixel - x) / width
    const neighbours = [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1, y > 0 ? pixel - width : -1, y < height - 1 ? pixel + width : -1]
    for (const next of neighbours) {
      if (next < 0 || background[next]) continue
      if (isBackdrop(next * 4)) {
        background[next] = 1
        queue[tail++] = next
      }
    }
  }

  const mask = new Uint8Array(width * height)
  let subject = 0
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!background[pixel]) {
      mask[pixel] = 255
      subject += 1
    }
  }
  const coverage = subject / mask.length
  const confidence = coverage < 0.01 || coverage > 0.97 ? 'low' : covered / borderIndexes.length < 0.6 ? 'medium' : 'high'
  return { mask, coverage, confidence }
}

export const magicWandMask = (image, seedX, seedY, { tolerance = 32, contiguous = true } = {}) => {
  const { data, width, height } = image
  const x0 = Math.max(0, Math.min(width - 1, Math.round(seedX)))
  const y0 = Math.max(0, Math.min(height - 1, Math.round(seedY)))
  const seed = (y0 * width + x0) * 4
  const [r, g, b] = [data[seed], data[seed + 1], data[seed + 2]]
  const mask = new Uint8Array(width * height)
  if (!contiguous) {
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
      if (colorDistance(data, pixel * 4, r, g, b) <= tolerance) mask[pixel] = 255
    }
    return mask
  }
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  const start = y0 * width + x0
  mask[start] = 255
  queue[tail++] = start
  while (head < tail) {
    const pixel = queue[head++]
    const x = pixel % width
    const y = (pixel - x) / width
    const neighbours = [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1, y > 0 ? pixel - width : -1, y < height - 1 ? pixel + width : -1]
    for (const next of neighbours) {
      if (next < 0 || mask[next]) continue
      if (colorDistance(data, next * 4, r, g, b) <= tolerance) {
        mask[next] = 255
        queue[tail++] = next
      }
    }
  }
  return mask
}

export const rectMask = (width, height, rect) => {
  const mask = new Uint8Array(width * height)
  const x1 = Math.max(0, Math.floor(Math.min(rect.x, rect.x + rect.w)))
  const x2 = Math.min(width, Math.ceil(Math.max(rect.x, rect.x + rect.w)))
  const y1 = Math.max(0, Math.floor(Math.min(rect.y, rect.y + rect.h)))
  const y2 = Math.min(height, Math.ceil(Math.max(rect.y, rect.y + rect.h)))
  for (let y = y1; y < y2; y += 1) mask.fill(255, y * width + x1, y * width + x2)
  return mask
}

// Even-odd scanline fill, sampled at pixel centres.
export const polygonMask = (width, height, points) => {
  const mask = new Uint8Array(width * height)
  if (points.length < 3) return mask
  for (let y = 0; y < height; y += 1) {
    const sy = y + 0.5
    const crossings = []
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index]
      const b = points[(index + 1) % points.length]
      if ((a.y <= sy && b.y > sy) || (b.y <= sy && a.y > sy)) {
        crossings.push(a.x + ((sy - a.y) / (b.y - a.y)) * (b.x - a.x))
      }
    }
    crossings.sort((a, b) => a - b)
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const from = Math.max(0, Math.ceil(crossings[index] - 0.5))
      const to = Math.min(width, Math.floor(crossings[index + 1] - 0.5) + 1)
      if (to > from) mask.fill(255, y * width + from, y * width + to)
    }
  }
  return mask
}

export const combineMasks = (current, next, mode = 'new') => {
  if (!current || mode === 'new') return next
  const out = new Uint8Array(next.length)
  for (let index = 0; index < out.length; index += 1) {
    const a = current[index]
    const b = next[index]
    if (mode === 'add') out[index] = a > b ? a : b
    else if (mode === 'subtract') out[index] = Math.round((a * (255 - b)) / 255)
    else out[index] = a < b ? a : b
  }
  return out
}

export const invertMask = (mask) => {
  const out = new Uint8Array(mask.length)
  for (let index = 0; index < mask.length; index += 1) out[index] = 255 - mask[index]
  return out
}

const boxBlurPass = (source, target, width, height, radius, horizontal) => {
  const span = radius * 2 + 1
  const outer = horizontal ? height : width
  const inner = horizontal ? width : height
  for (let line = 0; line < outer; line += 1) {
    const at = (position) => (horizontal ? line * width + position : position * width + line)
    let sum = 0
    for (let offset = -radius; offset <= radius; offset += 1) sum += source[at(Math.max(0, Math.min(inner - 1, offset)))]
    for (let position = 0; position < inner; position += 1) {
      target[at(position)] = Math.round(sum / span)
      const leaving = source[at(Math.max(0, position - radius))]
      const entering = source[at(Math.min(inner - 1, position + radius + 1))]
      sum += entering - leaving
    }
  }
}

export const featherMask = (mask, width, height, radius) => {
  const r = Math.round(radius)
  if (r < 1) return mask
  const temp = new Uint8Array(mask.length)
  const out = new Uint8Array(mask.length)
  boxBlurPass(mask, temp, width, height, r, true)
  boxBlurPass(temp, out, width, height, r, false)
  boxBlurPass(out, temp, width, height, r, true)
  boxBlurPass(temp, out, width, height, r, false)
  return out
}

export const maskCoverage = (mask) => {
  let total = 0
  for (let index = 0; index < mask.length; index += 1) total += mask[index]
  return total / (mask.length * 255)
}

export const maskEdges = (mask, width, height) => {
  const edges = new Uint8Array(mask.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x
      if (mask[pixel] < 128) continue
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1
        || mask[pixel - 1] < 128 || mask[pixel + 1] < 128 || mask[pixel - width] < 128 || mask[pixel + width] < 128) {
        edges[pixel] = 1
      }
    }
  }
  return edges
}

export const paintBucket = (image, seedX, seedY, [r, g, b], { tolerance = 32, contiguous = true } = {}) => {
  const region = magicWandMask(image, seedX, seedY, { tolerance, contiguous })
  const { data } = image
  let filled = 0
  for (let pixel = 0; pixel < region.length; pixel += 1) {
    if (!region[pixel]) continue
    const index = pixel * 4
    data[index] = r
    data[index + 1] = g
    data[index + 2] = b
    filled += 1
  }
  return filled
}

export const sharpen = (image, amount = 0.6) => {
  const { data, width, height } = image
  const source = new Uint8ClampedArray(data)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const c = index + channel
        const edge = 4 * source[c] - source[c - 4] - source[c + 4] - source[c - width * 4] - source[c + width * 4]
        data[c] = source[c] + edge * amount
      }
    }
  }
  return image
}
