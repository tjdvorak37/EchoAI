let supabaseClient = null
let isSupabaseEnabled = false

try {
  const supabaseModule = await import('../lib/supabase.js')
  supabaseClient = supabaseModule.supabase
  isSupabaseEnabled = Boolean(supabaseModule.isSupabaseConfigured)
} catch {
  supabaseClient = null
  isSupabaseEnabled = false
}

const STORAGE_KEY = 'echoai-free-posting-usage-v1'

const getStorage = () => {
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.__echoaiFreePostingMemoryStore ??= {}
    return {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(globalThis.__echoaiFreePostingMemoryStore, key)
          ? globalThis.__echoaiFreePostingMemoryStore[key]
          : null
      },
      setItem(key, value) {
        globalThis.__echoaiFreePostingMemoryStore[key] = String(value)
      },
      removeItem(key) {
        delete globalThis.__echoaiFreePostingMemoryStore[key]
      },
      clear() {
        globalThis.__echoaiFreePostingMemoryStore = {}
      },
    }
  }

  return {
    data: {},
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null
    },
    setItem(key, value) {
      this.data[key] = String(value)
    },
    removeItem(key) {
      delete this.data[key]
    },
    clear() {
      this.data = {}
    },
  }
}

const readUsageMap = () => {
  const store = getStorage()
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const writeUsageMap = (usageMap) => {
  const store = getStorage()
  store.setItem(STORAGE_KEY, JSON.stringify(usageMap))
}

export const FREE_POSTING_ALLOWANCE = 10

const readSupabaseUsage = async (userId) => {
  if (!isSupabaseEnabled || !supabaseClient || !userId) return null

  try {
    const { data, error } = await supabaseClient
      .from('user_free_posting_usage')
      .select('used_count')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      return null
    }

    return data?.used_count ?? 0
  } catch {
    return null
  }
}

const writeSupabaseUsage = async (userId, usedCount) => {
  if (!isSupabaseEnabled || !supabaseClient || !userId) return null

  try {
    const { data, error } = await supabaseClient
      .from('user_free_posting_usage')
      .upsert({ user_id: userId, used_count: usedCount }, { onConflict: 'user_id' })
      .select('used_count')
      .single()

    if (error) return null
    return data?.used_count ?? usedCount
  } catch {
    return null
  }
}

export const getFreePostingUsage = async (userId) => {
  if (!userId) return 0

  if (isSupabaseEnabled && supabaseClient) {
    const supabaseValue = await readSupabaseUsage(userId)
    if (supabaseValue !== null) {
      return Number(supabaseValue) || 0
    }
  }

  const usageMap = readUsageMap()
  const raw = usageMap[userId]
  const value = Number(raw ?? 0)
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

export const consumeFreePostingAllowance = async ({ userId, entitlement, channelCount }) => {
  if (!userId) {
    return { allowed: true, used: 0, remaining: FREE_POSTING_ALLOWANCE, message: '' }
  }

  const isFreeUser = !entitlement || entitlement.entitled === false || entitlement.accessLevel === 'free' || entitlement.status === 'none'
  if (!isFreeUser) {
    return {
      allowed: true,
      used: 0,
      remaining: Number.POSITIVE_INFINITY,
      message: '',
    }
  }

  const requestedUsage = Math.max(0, Number(channelCount) || 0)
  const currentUsage = await getFreePostingUsage(userId)
  const nextUsage = currentUsage + requestedUsage

  if (nextUsage > FREE_POSTING_ALLOWANCE) {
    return {
      allowed: false,
      used: currentUsage,
      remaining: Math.max(0, FREE_POSTING_ALLOWANCE - currentUsage),
      message: `You have used ${currentUsage} of ${FREE_POSTING_ALLOWANCE} free social postings. Upgrade to Premium to keep posting beyond this limit.`,
    }
  }

  if (isSupabaseEnabled && supabaseClient) {
    await writeSupabaseUsage(userId, nextUsage)
    return {
      allowed: true,
      used: nextUsage,
      remaining: FREE_POSTING_ALLOWANCE - nextUsage,
      message: '',
    }
  }

  const nextMap = readUsageMap()
  nextMap[userId] = nextUsage
  writeUsageMap(nextMap)

  return {
    allowed: true,
    used: nextUsage,
    remaining: FREE_POSTING_ALLOWANCE - nextUsage,
    message: '',
  }
}
