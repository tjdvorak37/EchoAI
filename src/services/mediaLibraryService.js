import { isSupabaseConfigured, supabase } from '../lib/supabase'

const unavailable = 'Sign in to a connected workspace to browse the stock library.'

const errorMessage = async (error, fallback) => {
  try {
    const body = await error.context?.json()
    if (body?.error) return body.error
  } catch {
    // Response body was not JSON.
  }
  return error?.message || fallback
}

export const searchMediaLibrary = async ({ kind, query, page = 1, imageType, order }) => {
  if (!isSupabaseConfigured) throw new Error(unavailable)
  const { data, error } = await supabase.functions.invoke('media-library', {
    body: { action: 'search', kind, query, page, imageType, order },
  })
  if (error) throw new Error(await errorMessage(error, 'The stock library could not be reached.'))
  return data
}

export const downloadMediaLibraryFile = async (url, mime) => {
  if (!isSupabaseConfigured) throw new Error(unavailable)
  const { data, error } = await supabase.functions.invoke('media-library', {
    body: { action: 'download', url },
  })
  if (error) throw new Error(await errorMessage(error, 'The file could not be downloaded.'))
  if (!(data instanceof Blob)) throw new Error('The file could not be downloaded.')
  return URL.createObjectURL(new Blob([data], { type: mime }))
}

// Data URLs survive project save/reload, unlike blob URLs.
export const downloadMediaLibraryDataUrl = async (url, mime) => {
  const blobUrl = await downloadMediaLibraryFile(url, mime)
  try {
    const blob = await (await fetch(blobUrl)).blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('The image could not be read.'))
      reader.readAsDataURL(blob)
    })
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}
