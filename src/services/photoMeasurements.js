export const DEFAULT_PHOTO_MEASUREMENTS = { unit: 'px', ppi: 96 }
export const PHOTO_UNITS = { px: 'Pixels', in: 'Inches', mm: 'Millimeters' }

export const validatePhotoMeasurements = (settings) => {
  if (!settings || !Object.hasOwn(PHOTO_UNITS, settings.unit)
    || !Number.isFinite(settings.ppi) || settings.ppi < 36 || settings.ppi > 1200) {
    throw new Error('Document measurements require pixels, inches, or millimeters and a resolution between 36 and 1200 PPI.')
  }
  return { unit: settings.unit, ppi: settings.ppi }
}

export const pixelsPerUnit = ({ unit, ppi }) => unit === 'px' ? 1 : unit === 'in' ? ppi : ppi / 25.4
export const pixelsToUnits = (pixels, settings) => pixels / pixelsPerUnit(settings)
export const unitsToPixels = (value, settings) => value * pixelsPerUnit(settings)

export const measuredCanvasSize = (width, height, settings) => {
  validatePhotoMeasurements(settings)
  if (!String(width).trim() || !String(height).trim() || Number(width) <= 0 || Number(height) <= 0) {
    throw new Error('Enter a positive page width and height.')
  }
  const size = { width: Math.round(unitsToPixels(Number(width), settings)), height: Math.round(unitsToPixels(Number(height), settings)) }
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)
    || size.width < 40 || size.height < 40 || size.width > 8192 || size.height > 8192) {
    throw new Error('Page dimensions must resolve to between 40 and 8192 pixels per side. Adjust the size or resolution.')
  }
  return size
}

export const rulerTicks = (length, origin, screenPixelsPerUnit) => {
  const rawStep = 70 / screenPixelsPerUnit
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = [1, 2, 5, 10].map((value) => value * magnitude).find((value) => value >= rawStep)
  const minor = step / 5
  const first = Math.ceil(-origin / screenPixelsPerUnit / minor)
  const last = Math.floor((length - origin) / screenPixelsPerUnit / minor)
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => {
    const tick = first + index
    const value = tick * minor
    return {
      position: origin + value * screenPixelsPerUnit,
      major: tick % 5 === 0,
      label: Number(value.toPrecision(8)).toString(),
    }
  })
}
