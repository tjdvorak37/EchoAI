import { isSupabaseConfigured, supabase } from '../lib/supabase'

const DEMO_KEY = 'echoai_brand_kit_demo'

// Logos are stored inline as data URLs, so keep them small enough to sit in a
// jsonb column comfortably.
export const MAX_LOGO_BYTES = 512 * 1024

export const createEmptyBrandKit = () => ({
  colors: [],
  fonts: [],
  logos: [],
  guidelines: '',
})

const normalize = (record) => ({
  colors: Array.isArray(record?.colors) ? record.colors : [],
  fonts: Array.isArray(record?.fonts) ? record.fonts : [],
  logos: Array.isArray(record?.logos) ? record.logos : [],
  guidelines: record?.guidelines ?? '',
  companyName: record?.company_name ?? record?.companyName ?? '',
  updatedAt: record?.updated_at ?? record?.updatedAt ?? '',
})

// Licensed fonts are loaded at runtime from the URL the customer hosts them at.
// Canvas export needs the face registered before it can draw with it.
export const loadBrandFonts = async (fonts) => {
  if (!fonts?.length || typeof FontFace === 'undefined') return

  await Promise.all(
    fonts
      .filter((font) => font.family && font.sourceUrl)
      .map(async (font) => {
        try {
          const face = new FontFace(font.family, `url(${font.sourceUrl})`)
          await face.load()
          document.fonts.add(face)
        } catch (error) {
          console.warn(`Could not load brand font ${font.family}`, error)
        }
      }),
  )

  await document.fonts.ready
}

export const brandService = {
  async getBrandKit() {
    if (!isSupabaseConfigured) {
      try {
        const stored = localStorage.getItem(DEMO_KEY)
        return stored ? normalize(JSON.parse(stored)) : createEmptyBrandKit()
      } catch {
        return createEmptyBrandKit()
      }
    }

    const { data, error } = await supabase.from('brand_kits').select('*').maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    return data ? normalize(data) : createEmptyBrandKit()
  },

  async saveBrandKit({ colors, fonts, logos, guidelines }) {
    const payload = { colors, fonts, logos, guidelines }

    if (!isSupabaseConfigured) {
      localStorage.setItem(DEMO_KEY, JSON.stringify(payload))
      return normalize(payload)
    }

    const { data, error } = await supabase.rpc('save_brand_kit', {
      p_colors: colors,
      p_fonts: fonts,
      p_logos: logos,
      p_guidelines: guidelines ?? '',
    })

    if (error) {
      throw new Error(error.message)
    }

    return normalize(data)
  },
}
