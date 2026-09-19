import { isSupabaseConfigured, supabase } from '../lib/supabase'

export const askEcho = async ({ message, activeTab, history }) => {
  if (!isSupabaseConfigured) {
    throw new Error('Ask Echo needs the live EchoAI service before it can respond.')
  }

  const { data, error } = await supabase.functions.invoke('echo-chat', {
    body: { message, activeTab, history },
  })

  if (error) {
    const detail = await error.context?.json?.().catch(() => null)
    throw new Error(detail?.error || error.message || 'Ask Echo is unavailable right now.')
  }

  if (!data?.text) throw new Error('Ask Echo returned an empty response. Please try again.')
  return data
}

export const testEchoGateway = async () => {
  if (!isSupabaseConfigured) throw new Error('Connect Supabase before testing Ask Echo.')

  const { data, error } = await supabase.functions.invoke('echo-chat', {
    body: { action: 'test' },
  })

  if (error) {
    const detail = await error.context?.json?.().catch(() => null)
    throw new Error(detail?.error || error.message || 'Gateway test failed.')
  }

  return data
}