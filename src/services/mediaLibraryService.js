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

export const searchMediaLibrary = async ({ kind, query, page = 1 }) => {
  if (!isSupabaseConfigured) throw new Error(unavailable)
  const { data, error } = await supabase.functions.invoke('media-library', {
    body: { action: 'search', kind, query, page },
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
