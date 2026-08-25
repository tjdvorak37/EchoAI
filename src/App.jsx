import { Suspense, lazy, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import './App.css'
import './components/VideoEditor.css'
import './components/PhotoEditor.css'
import {
  accessRequestsSeed,
  adminAlerts,
  aiPromptIdeas,
  companyMainPostsSeed,
  companySocialAccountsSeed,
  connectedAccountsSeed,
  expensesSeed,
  financialTasksSeed,
  licensesSeed,
  payrollSeed,
  postTypeChips,
  promoCodesSeed,
  purchaseHistorySeed,
  refundsSeed,
  repostQueueSeed,
  scheduledPostsSeed,
  siteFeatureFlagsSeed,
  starterStats,
  supportTicketsSeed,
  taxRecordsSeed,
  teamMembersSeed,
  userRepostsSeed,
  workspaceAssetsSeed,
  workspaceFoldersSeed,
} from './data/demoData'
import { authService } from './services/authService'
import { announcementService, DEFAULT_ANNOUNCEMENTS } from './services/announcementService'
import { billingService } from './services/billingService'
import { brandService, createEmptyBrandKit, loadBrandFonts, MAX_LOGO_BYTES } from './services/brandService'
import { CLOUD_PROVIDERS, cloudDriveService, toLinkedAsset } from './services/cloudDriveService'
import { getPlan, getStorageMb } from './data/plans'
import { platformService } from './services/platformService'
import { repostService } from './services/repostService'
import { socialIntegrationService } from './services/socialIntegrationService'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import echoMascot from './assets/echo-mascot.svg'
import { AGENT_CAPABILITIES, DEFAULT_AGENT_CAPABILITIES } from './services/aiAgentService'
import { AiToolManager } from './components/AiToolManager'
import { OpenAiSetupGuide } from './components/OpenAiSetupGuide'
import { AnnouncementBanner } from './components/AnnouncementBanner'

const VideoEditor = lazy(() => import('./components/VideoEditor').then((module) => ({ default: module.VideoEditor })))
const PhotoEditor = lazy(() => import('./components/PhotoEditor').then((module) => ({ default: module.PhotoEditor })))
const SocialListeningPanel = lazy(() => import('./components/SocialListeningPanel').then((module) => ({ default: module.SocialListeningPanel })))
const LandingPage = lazy(() => import('./components/LandingPage').then((module) => ({ default: module.LandingPage })))
const CompanyPackageRequest = lazy(() => import('./components/CompanyPackageRequest').then((module) => ({ default: module.CompanyPackageRequest })))
const PurchasePage = lazy(() => import('./components/PurchasePage').then((module) => ({ default: module.PurchasePage })))
const AdminPanel = lazy(() => import('./components/AdminPanel').then((module) => ({ default: module.AdminPanel })))
const FinancePanel = lazy(() => import('./components/FinancePanel').then((module) => ({ default: module.FinancePanel })))
const CreativeBrief = lazy(() => import('./components/CreativeBrief').then((module) => ({ default: module.CreativeBrief })))
const HelpCenter = lazy(() => import('./components/HelpCenter').then((module) => ({ default: module.HelpCenter })))
const InhouseAiStudio = lazy(() => import('./components/InhouseAiStudio').then((module) => ({ default: module.InhouseAiStudio })))
const CalendarPopout = lazy(() => import('./components/CalendarPopout').then((module) => ({ default: module.CalendarPopout })))
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy').then((module) => ({ default: module.PrivacyPolicy })))

// Per-user localStorage isolation — each user's data lives under their own key
const getUserKey = (userId) => `echoai-u-${userId}-v1`
const AI_GENERATIONS_FOLDER_ID = 'folder-ai-generations'
const readUserData = (userId) => {
  try { return JSON.parse(localStorage.getItem(getUserKey(userId))) } catch { return null }
}

const PLATFORM_META = {
  instagram: { label: 'Instagram', icon: 'IG', color: '#E1306C', bg: 'rgba(225,48,108,0.12)', border: 'rgba(225,48,108,0.35)' },
  facebook:  { label: 'Facebook',  icon: 'FB', color: '#1877F2', bg: 'rgba(24,119,242,0.12)', border: 'rgba(24,119,242,0.35)' },
  tiktok:    { label: 'TikTok',    icon: 'TT', color: '#FE2C55', bg: 'rgba(254,44,85,0.12)',  border: 'rgba(254,44,85,0.35)' },
  snapchat:  { label: 'Snapchat',  icon: '👻', color: '#F7C600', bg: 'rgba(247,198,0,0.12)',  border: 'rgba(247,198,0,0.35)' },
  x:         { label: 'X',         icon: '𝕏',  color: '#e2e8f0', bg: 'rgba(226,232,240,0.1)', border: 'rgba(226,232,240,0.3)' },
  youtube:   { label: 'YouTube',   icon: '▶',  color: '#FF0000', bg: 'rgba(255,0,0,0.12)',    border: 'rgba(255,0,0,0.35)' },
  linkedin:  { label: 'LinkedIn',  icon: 'in', color: '#0A66C2', bg: 'rgba(10,102,194,0.12)', border: 'rgba(10,102,194,0.35)' },
}

const getPlatformMeta = (platformName) =>
  PLATFORM_META[platformName?.toLowerCase()] ??
  { label: platformName, icon: '🔗', color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.25)' }

const DEFAULT_ACCOUNT_HANDLES = {
  instagram: '@youraccount',
  facebook: 'Your page name',
  tiktok: '@youraccount',
  snapchat: 'Your Snapchat',
  x: '@youraccount',
  youtube: 'Your channel',
  linkedin: 'Your profile / page',
}

const SOCIAL_PUBLISHING_SCOPES = ['posts', 'images', 'videos', 'comments', 'analytics']

const getDefaultAccountHandle = (platformName) =>
  DEFAULT_ACCOUNT_HANDLES[String(platformName || '').toLowerCase()] || 'Your account'

const isPlaceholderAccountHandle = (platformName, accountName) => {
  const defaultValue = getDefaultAccountHandle(platformName)
  return !String(accountName || '').trim() || String(accountName).trim().toLowerCase() === defaultValue.toLowerCase()
}

const createDefaultAiAgentConfig = () => ({
  enabled: false,
  name: 'My AI Agent',
  provider: 'custom_router',
  endpoint: '',
  apiKey: '',
  model: '',
  capabilities: DEFAULT_AGENT_CAPABILITIES,
  personas: [],
  routing: { strategy: 'best_quality', allowFallback: true },
  negativePrompt: '',
  defaultStyle: '',
  lastSyncedAt: '',
  status: 'not connected',
  message: 'Connect an in-house AI endpoint for writing, documents, images, characters, video, audio, and media analysis.',
})

const hydrateWorkspaceAssets = (assets) =>
  (assets ?? []).map((asset) => {
    if (asset?.type !== 'image' || asset?.previewUrl) {
      return asset
    }

    const seededAsset = workspaceAssetsSeed.find((item) => item.id === asset.id)
    if (!seededAsset?.previewUrl) {
      return asset
    }

    return { ...asset, previewUrl: seededAsset.previewUrl }
  })

const AI_AGENT_CAPABILITIES = AGENT_CAPABILITIES

// Staff accounts run the platform, so they get the top plan without paying for it.
const STAFF_ROLES = ['admin', 'super_admin', 'manager', 'it']
const STAFF_PLAN = 'creator'
const isStaffRole = (role) => STAFF_ROLES.includes(String(role || '').toLowerCase())

function App() {
  const [authView, setAuthView] = useState(() =>
    new URLSearchParams(window.location.search).get('checkout') === 'success' ? 'signup' : 'landing',
  )
  const [authState, setAuthState] = useState({
    email: '',
    password: '',
    fullName: '',
    company: '',
    otpCode: '',
  })
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [resetPassword, setResetPassword] = useState({ newPassword: '', confirmPassword: '' })
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
  const [mfaPending, setMfaPending] = useState(false)
  const [mfaChallenge, setMfaChallenge] = useState({ factorId: '', challengeId: '' })
  const [mfaEnrollOpen, setMfaEnrollOpen] = useState(false)
  const [mfaEnrollment, setMfaEnrollment] = useState(null)
  const [mfaEnrollCode, setMfaEnrollCode] = useState('')
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState([])
  const [mfaError, setMfaError] = useState('')
  const [mfaBusy, setMfaBusy] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('')
  const [brandKit, setBrandKit] = useState(createEmptyBrandKit)
  const [brandDraft, setBrandDraft] = useState(createEmptyBrandKit)
  const [brandBusy, setBrandBusy] = useState(false)
  const [brandNotice, setBrandNotice] = useState('')
  const [brandError, setBrandError] = useState('')
  const [cloudConnections, setCloudConnections] = useState([])
  const [cloudProvider, setCloudProvider] = useState('')
  const [cloudItems, setCloudItems] = useState([])
  const [cloudPath, setCloudPath] = useState([])
  const [cloudSearch, setCloudSearch] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)
  const [cloudError, setCloudError] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [session, setSession] = useState(null)
  const [sessionRestoring, setSessionRestoring] = useState(isSupabaseConfigured)
  const [contactCard, setContactCard] = useState(null)
  const [contactCardDraft, setContactCardDraft] = useState(null)
  const [contactCardOpen, setContactCardOpen] = useState(false)
  const [contactCardSaving, setContactCardSaving] = useState(false)
  const [contactCardError, setContactCardError] = useState('')
  const [contactCardNotice, setContactCardNotice] = useState('')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [googleCalendars, setGoogleCalendars] = useState([])
  const [googleEvents, setGoogleEvents] = useState([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarError, setCalendarError] = useState('')
  const [selectedCalendarId, setSelectedCalendarId] = useState(
    () => localStorage.getItem('echoai-calendar-id') || 'primary',
  )
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(
    () => localStorage.getItem('echoai-calendar-sync') !== 'false',
  )

  const [activeTab, setActiveTab] = useState('dashboard')
  const [connectedAccounts, setConnectedAccounts] = useState(connectedAccountsSeed)
  const [socialPlatformReadiness, setSocialPlatformReadiness] = useState([])
  const [socialPlatformReadinessLoading, setSocialPlatformReadinessLoading] = useState(false)
  const [socialPlatformReadinessError, setSocialPlatformReadinessError] = useState('')
  const [scheduledPosts, setScheduledPosts] = useState(scheduledPostsSeed)
  const [companyMainPosts, setCompanyMainPosts] = useState(companyMainPostsSeed)
  const [companySocialAccounts, setCompanySocialAccounts] = useState(companySocialAccountsSeed)
  const [repostQueue, setRepostQueue] = useState(repostQueueSeed)
  const [userReposts, setUserReposts] = useState(userRepostsSeed)
  const [autoApproveCompanyPosts, setAutoApproveCompanyPosts] = useState(false)
  const [repostNotice, setRepostNotice] = useState('')
  const [repostError, setRepostError] = useState('')
  const [tenantCompanyKey, setTenantCompanyKey] = useState('')
  const [publishLoading, setPublishLoading] = useState(false)
  const [broadcastingPostId, setBroadcastingPostId] = useState('')
  const [companyPostDraft, setCompanyPostDraft] = useState({
    title: '',
    content: '',
    channels: ['instagram'],
  })
  const [companyAccountDraft, setCompanyAccountDraft] = useState({
    platform: '',
    accountName: '',
  })
  const localIdRef = useRef(3000)
  const [alerts, setAlerts] = useState(adminAlerts)
  const [accessRequests, setAccessRequests] = useState(accessRequestsSeed)
  const [teamMembers, setTeamMembers] = useState(teamMembersSeed)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [companySeatPackage, setCompanySeatPackage] = useState(null)
  const [companySeats, setCompanySeats] = useState([])
  const [supportModalOpen, setSupportModalOpen] = useState(false)
  const [supportLoading, setSupportLoading] = useState(false)
  const [supportAttachments, setSupportAttachments] = useState([])
  const [supportUploading, setSupportUploading] = useState(false)
  const [supportError, setSupportError] = useState('')
  const [supportSuccess, setSupportSuccess] = useState('')
  const supportCloseTimerRef = useRef(null)
  const [supportTicket, setSupportTicket] = useState({
    category: 'Technical issue',
    details: '',
  })
  const [composer, setComposer] = useState({
    campaign: '',
    message: '',
    imageIdea: '',
    scheduledAt: '',
    channels: [],
    mediaAssetIds: [],
  })
  const [schedulerError, setSchedulerError] = useState('')
  const [accountHandleDrafts, setAccountHandleDrafts] = useState(() => ({
    instagram: '@youraccount',
    facebook: 'Your page name',
    tiktok: '@youraccount',
    snapchat: 'Your Snapchat',
    x: '@youraccount',
    youtube: 'Your channel',
    linkedin: 'Your profile / page',
  }))
  const [accountScopeDrafts, setAccountScopeDrafts] = useState({})
  const [quickConnectOpen, setQuickConnectOpen] = useState(() => {
    const status = new URLSearchParams(window.location.search).get('social')
    return status === 'connected' || status === 'failed' || status === 'provider_error'
  })
  const [quickConnectEmail, setQuickConnectEmail] = useState(() => session?.email || '')
  const [quickConnectName, setQuickConnectName] = useState('')
  const [quickConnectSelected, setQuickConnectSelected] = useState(['instagram', 'facebook', 'youtube'])
  const [quickConnectNotice, setQuickConnectNotice] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('social')
    const platform = params.get('platform')
    const reason = params.get('reason')
    if (!status || !platform) return ''
    return status === 'connected'
      ? `${getPlatformMeta(platform).label} connected successfully. Choose another selected provider to continue.`
      : `${getPlatformMeta(platform).label} connection was not completed.${reason ? ` ${decodeURIComponent(reason)}` : ''}`
  })
  const [integrationError, setIntegrationError] = useState('')
  const [aiInput, setAiInput] = useState('')
  const [aiSuggestions, setAiSuggestions] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [creativeProject, setCreativeProject] = useState(null)
  const [aiAgentConfig, setAiAgentConfig] = useState(() => createDefaultAiAgentConfig())
  const [aiAgentDraft, setAiAgentDraft] = useState(() => createDefaultAiAgentConfig())
  const [aiAgentSaving, setAiAgentSaving] = useState(false)
  const [aiAgentTesting, setAiAgentTesting] = useState(false)
  const [aiAgentFeedback, setAiAgentFeedback] = useState('')
  const [aiAgentFeedbackTone, setAiAgentFeedbackTone] = useState('info')
  const [aiAgentConnections, setAiAgentConnections] = useState([])
  const [openAiGuideOpen, setOpenAiGuideOpen] = useState(false)
  const [workspaceFolders, setWorkspaceFolders] = useState(workspaceFoldersSeed)
  const [workspaceAssets, setWorkspaceAssets] = useState(workspaceAssetsSeed)
  const [selectedFolderId, setSelectedFolderId] = useState('folder-root')
  const [assetSearch, setAssetSearch] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [editingItem, setEditingItem] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [isAssetPanelOpen, setIsAssetPanelOpen] = useState(() => window.innerWidth > 768)
  const [drawerDragActive, setDrawerDragActive] = useState(false)
  const [quotaEditingUserId, setQuotaEditingUserId] = useState('')
  const [quotaDraftMb, setQuotaDraftMb] = useState('2048')
  const [licenses, setLicenses] = useState(licensesSeed)
  const [tickets, setTickets] = useState(supportTicketsSeed)
  const [purchaseHistory, setPurchaseHistory] = useState(purchaseHistorySeed)
  const [featureFlags, setFeatureFlags] = useState(siteFeatureFlagsSeed)
  const [announcements, setAnnouncements] = useState(DEFAULT_ANNOUNCEMENTS)
  const [promoCodes, setPromoCodes] = useState(promoCodesSeed)
  const [expenses, setExpenses] = useState(expensesSeed)
  const [payroll, setPayroll] = useState(payrollSeed)
  const [taxRecords, setTaxRecords] = useState(taxRecordsSeed)
  const [refunds, setRefunds] = useState(refundsSeed)
  const [financialTasks, setFinancialTasks] = useState(financialTasksSeed)
  const [showPurchase, setShowPurchase] = useState(false)
  const [companyPackageRequested, setCompanyPackageRequested] = useState(false)
  const [purchasePlan, setPurchasePlan] = useState('storage_pro')
  // Stripe sends the buyer back here after checkout; they still need a login.
  const [checkoutReturn] = useState(
    () => new URLSearchParams(window.location.search).get('checkout') || '',
  )
  const [myEntitlement, setMyEntitlement] = useState(null)
  const [billingPortalLoading, setBillingPortalLoading] = useState(false)
  const [billingPortalError, setBillingPortalError] = useState('')
  const [accountActionError, setAccountActionError] = useState('')
  const [accountActionLoading, setAccountActionLoading] = useState(false)
  const [referralSummary, setReferralSummary] = useState(null)
  const [referralCopied, setReferralCopied] = useState(false)
  // Captured once on load so it survives the user navigating around before buying.
  const [incomingReferralCode] = useState(
    () => new URLSearchParams(window.location.search).get('ref') || '',
  )

  const loadingPanel = (
    <section className="panel">
      <h2>Loading workspace module...</h2>
      <p className="panel-note">Preparing tools and data.</p>
    </section>
  )

  async function loadContactCard(user) {
    try {
      const card = await authService.getMyContactCard({ userId: user.id, email: user.email })
      setContactCard(card)
      setContactCardDraft(card)
    } catch (error) {
      setContactCardError(error.message)
    }
  }

  // Loads and applies this user's persisted data after login.
  // Demo users fall back to seed data on first login; all others start clean.
  const applyUserData = async (user) => {
    const stored = readUserData(user.id)
    const isDemo = user.id?.startsWith('demo-')
    const defaults = isDemo
      ? {
          scheduledPosts: scheduledPostsSeed,
          connectedAccounts: connectedAccountsSeed,
          companyMainPosts: companyMainPostsSeed,
          companySocialAccounts: companySocialAccountsSeed,
          repostQueue: repostQueueSeed,
          userReposts: userRepostsSeed,
          workspaceFolders: workspaceFoldersSeed,
          workspaceAssets: workspaceAssetsSeed,
        }
      : {}
    const d = stored ?? defaults
    setScheduledPosts(d.scheduledPosts ?? [])
    setConnectedAccounts(d.connectedAccounts ?? [])
    setCompanyMainPosts(d.companyMainPosts ?? [])
    setCompanySocialAccounts(d.companySocialAccounts ?? [])
    setRepostQueue(d.repostQueue ?? [])
    setUserReposts(d.userReposts ?? [])
    const savedFolders = d.workspaceFolders ?? [{ id: 'folder-root', name: 'My workspace', parentId: null, createdAt: new Date().toISOString() }]
    setWorkspaceFolders(savedFolders.some((folder) => folder.id === AI_GENERATIONS_FOLDER_ID)
      ? savedFolders
      : [...savedFolders, { id: AI_GENERATIONS_FOLDER_ID, name: 'AI Generations', parentId: 'folder-root', createdAt: new Date().toISOString(), system: true }])
    setWorkspaceAssets(hydrateWorkspaceAssets(d.workspaceAssets ?? []))

    await loadContactCard(user)

    if (isSupabaseConfigured) {
      const [socialAccounts, savedPosts] = await Promise.all([
        socialIntegrationService.listAccounts(),
        platformService.listPosts(),
      ])
      setConnectedAccounts(socialAccounts)
      setScheduledPosts(savedPosts)
      const profileAiAgentConfig = await authService.getUserAiAgentConfig({
        userId: user.id,
        email: user.email,
      })

      const nextAiAgentConfig = profileAiAgentConfig
        ? { ...createDefaultAiAgentConfig(), ...profileAiAgentConfig }
        : createDefaultAiAgentConfig()

      setAiAgentConfig(nextAiAgentConfig)
      setAiAgentDraft(nextAiAgentConfig)
      const connections = await authService.listAiAgentConnections()
      setAiAgentConnections(connections)
      if (connections[0]) {
        const active = { ...createDefaultAiAgentConfig(), ...connections[0], connectionId: connections[0].id, enabled: connections[0].enabled }
        setAiAgentConfig(active)
        setAiAgentDraft(active)
      }
      return
    }

    const nextAiAgentConfig = d.aiAgentConfig
      ? { ...createDefaultAiAgentConfig(), ...d.aiAgentConfig }
      : createDefaultAiAgentConfig()

    setAiAgentConfig(nextAiAgentConfig)
    setAiAgentDraft(nextAiAgentConfig)
  }

  const validatePromoCode = (raw) => {
    const code = raw.trim().toUpperCase()

    // With Supabase configured the code is validated and consumed atomically by
    // the redeem_promo_code RPC, so the client never gets to see the code list.
    if (isSupabaseConfigured) {
      if (!code) return { valid: false, message: 'Enter a code.' }
      return {
        valid: true,
        message: 'Code will be verified when you activate.',
        codeObj: { code, description: 'Verified at activation' },
      }
    }

    const found = promoCodes.find((c) => c.code.toUpperCase() === code)
    if (!found) return { valid: false, message: 'Code not found.' }
    if (!found.active) return { valid: false, message: 'This code is no longer active.' }
    if (found.expiresAt && new Date(found.expiresAt) < new Date()) return { valid: false, message: 'This code has expired.' }
    if (found.maxUses !== null && found.usedCount >= found.maxUses) return { valid: false, message: 'This code has reached its usage limit.' }
    return { valid: true, message: `Code applied: ${found.description}`, codeObj: found }
  }

  useEffect(() => {
    let active = true

    announcementService.list()
      .then((records) => {
        if (!active) return
        setAnnouncements((current) => ({
          ...current,
          ...Object.fromEntries(records.map((notice) => [notice.id, notice])),
        }))
      })
      .catch((error) => console.error('Unable to load platform announcements', error))

    return () => { active = false }
  }, [session?.id])

  const handleSaveAnnouncement = async (notice) => {
    const saved = await announcementService.save(notice)
    setAnnouncements((current) => ({ ...current, [saved.id]: saved }))
    return saved
  }

  // Save all per-user data to their own namespaced localStorage key whenever any slice changes.
  // In production this is backed by Supabase with row-level security scoped to auth.uid().

  useEffect(() => {
    if (!session?.id) return
    try {
      // Keep image previews for the editor; strip larger non-image previews from storage.
      const assetsForStorage = workspaceAssets.map((asset) => {
        const rest = { ...asset }
        if (asset.type !== 'image') {
          delete rest.previewUrl
        }
        return rest
      })
      localStorage.setItem(
        getUserKey(session.id),
        JSON.stringify({
          scheduledPosts,
          connectedAccounts,
          companyMainPosts,
          companySocialAccounts,
          repostQueue,
          userReposts,
          workspaceFolders,
          workspaceAssets: assetsForStorage,
          ...(isSupabaseConfigured ? {} : { aiAgentConfig }),
        }),
      )
    } catch (err) {
      console.error('Unable to save user data', err)
    }
  }, [session, scheduledPosts, connectedAccounts, companyMainPosts, companySocialAccounts, repostQueue, userReposts, workspaceFolders, workspaceAssets, aiAgentConfig])

  // The subscribed tier is authoritative; the profile column is the fallback for
  // demo mode and for admins who have no subscription.
  const storageQuotaMb = myEntitlement?.storageGb
    ? myEntitlement.storageGb * 1024
    : isStaffRole(session?.role)
      ? getStorageMb(STAFF_PLAN)
      : Number(session?.storageQuotaMb ?? session?.storage_quota_mb ?? getStorageMb('standard')) ||
        getStorageMb('standard')

  const upcomingPostCount = useMemo(
    () => scheduledPosts.filter((post) => post.status === 'scheduled').length,
    [scheduledPosts],
  )

  const stats = useMemo(
    () => [
      starterStats[0],
      { label: 'Queued posts', value: `${upcomingPostCount}` },
      { label: 'Connected channels', value: `${connectedAccounts.length}` },
      starterStats[3],
    ],
    [connectedAccounts.length, upcomingPostCount],
  )

  const pendingRepostCount = useMemo(
    () => repostQueue.filter((item) => item.status === 'pending').length,
    [repostQueue],
  )

  // Linked cloud files live in the customer's own drive, so they cost no quota.
  const storageUsedMb = useMemo(
    () =>
      workspaceAssets
        .filter((asset) => !asset.linked)
        .reduce((sum, asset) => sum + asset.size / 1024 / 1024, 0),
    [workspaceAssets],
  )

  const userIdentity = useMemo(() => {
    const metadataName = session?.user_metadata?.full_name
    if (metadataName) {
      return metadataName
    }

    if (!session?.email) {
      return 'team member'
    }

    return session.email.split('@')[0]
  }, [session])

  const getStatusBadgeClass = (status) => {
    const normalized = (status || '').toLowerCase()

    if (['active', 'approved', 'posted', 'healthy', 'resolved'].includes(normalized)) {
      return 'badge success'
    }

    if (['pending', 'medium', 'token refresh due'].includes(normalized)) {
      return 'badge pending'
    }

    if (['denied', 'deactivated', 'declined', 'high', 'open'].includes(normalized)) {
      return 'badge risk'
    }

    return 'badge info'
  }

  const isAdminUser = session?.role === 'admin'
  const canViewManagementBoard = ['admin', 'manager', 'it', 'accountant'].includes(session?.role || '')
  const canManageBrandKit = ['admin', 'manager'].includes(session?.role || '')

  async function loadAdminData() {
    setAdminError('')
    setAdminLoading(true)

    try {
      const [requests, members, subscriptions, payments, seatData, supportTickets] = await Promise.all([
        authService.getAccessRequests(),
        authService.getManagedUsers(),
        billingService.listSubscriptions(),
        billingService.listPayments(),
        authService.getCompanySeatData({ companyKey: session?.company }),
        authService.getSupportTickets(),
      ])

      if (requests.length) {
        setAccessRequests(requests)
      }

      if (members.length) {
        setTeamMembers(members)
      }

      setCompanySeatPackage(seatData.package)
      setCompanySeats(seatData.seats)
      if (isSupabaseConfigured) setTickets(supportTickets)

      if (isSupabaseConfigured) {
        // Subscriptions only carry an email; pair them with profile names.
        const nameByEmail = new Map(
          members.map((m) => [String(m.email || '').toLowerCase(), m.fullName]),
        )
        const withNames = (rows) =>
          rows.map((row) => ({
            ...row,
            userFullName: nameByEmail.get(String(row.userEmail || '').toLowerCase()) || row.userEmail,
          }))

        setLicenses(withNames(subscriptions))
        setPurchaseHistory(withNames(payments))
      }
    } catch (error) {
      setAdminError(error.message)
    } finally {
      setAdminLoading(false)
    }
  }

  const handleCreateCompanySeatPackage = async (seatLimit) => {
    const created = await authService.createCompanySeatPackage({ companyKey: session?.company, seatLimit })
    setCompanySeatPackage(created)
    return created
  }

  const handleUpdateCompanySeatPackage = async (seatLimit) => {
    const updated = await authService.updateCompanySeatPackage({
      packageId: companySeatPackage?.id,
      seatLimit,
      assignedSeats: companySeats.filter((seat) => seat.status !== 'revoked').length,
    })
    setCompanySeatPackage((prev) => ({ ...prev, ...updated }))
    return updated
  }

  const handleRespondToSupportTicket = async ({ ticketId, response }) => {
    const updated = await authService.respondToSupportTicket({ ticketId, response })
    setTickets((prev) => prev.map((ticket) => ticket.id === ticketId ? { ...ticket, ...updated } : ticket))
    return updated
  }

  const handleUpdateSupportTicketStatus = async ({ ticketId, status }) => {
    const updated = await authService.updateSupportTicketStatus({ ticketId, status })
    setTickets((prev) => prev.map((ticket) => ticket.id === ticketId ? { ...ticket, ...updated } : ticket))
    return updated
  }

  const restorePersistedSession = useEffectEvent(async (isActive) => {
    try {
      const restoredUser = await authService.restoreSession()
      if (!isActive() || !restoredUser) return

      setSession(restoredUser)
      await applyUserData(restoredUser)
      if (['admin', 'manager', 'it'].includes(restoredUser.role)) {
        await loadAdminData()
      }
    } catch {
      // An expired or insufficient-assurance session should fall through to sign-in.
    } finally {
      if (isActive()) setSessionRestoring(false)
    }
  })

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined

    let active = true
    let restoreTimer
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') {
        // Defer Supabase calls until after its auth callback completes.
        restoreTimer = window.setTimeout(() => restorePersistedSession(() => active), 0)
      }
    })

    return () => {
      active = false
      window.clearTimeout(restoreTimer)
      subscription.unsubscribe()
    }
  }, [])

  const handleAssignCompanySeat = async (employeeEmail) => {
    const created = await authService.assignCompanySeat({
      packageId: companySeatPackage?.id,
      companyKey: session?.company,
      employeeEmail,
    })
    setCompanySeats((prev) => [created, ...prev])
    return created
  }

  const handleRevokeCompanySeat = async (seatId) => {
    const updated = await authService.revokeCompanySeat({ seatId })
    setCompanySeats((prev) => prev.map((seat) => (seat.id === updated.id ? { ...seat, ...updated } : seat)))
  }

  const loadRepostWorkspace = async () => {
    if (!isSupabaseConfigured) {
      return
    }

    setRepostError('')
    try {
      const workspace = await repostService.getWorkspace()
      if (!workspace) {
        return
      }

      setCompanyMainPosts(workspace.companyPosts)
      setCompanySocialAccounts(workspace.companyAccounts)
      setRepostQueue(workspace.queue)
      setUserReposts(workspace.reposts)
      setAutoApproveCompanyPosts(workspace.autoApprove)
      setTenantCompanyKey(workspace.companyKey)
    } catch (error) {
      setRepostError(error.message)
    }
  }

  const handleAuthChange = (field, value) => {
    setAuthState((prev) => ({ ...prev, [field]: value }))
  }

  const handleSignIn = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthNotice('')
    setAuthLoading(true)

    try {
      const result = await authService.signIn({
        email: authState.email,
        password: authState.password,
      })

      if (result.mfaRequired) {
        setPendingEmail(authState.email)
        setMfaChallenge({ factorId: result.factorId, challengeId: result.challengeId })
        setMfaPending(true)
        return
      }

      // Signed in at aal1 with no second factor: enrolment is the next step.
      if (result.enrollmentRequired) {
        setPendingEmail(authState.email)
        setSession(result.user)
        await applyUserData(result.user)
        setMfaEnrollOpen(true)
        return
      }

      setSession(result.user)
      await applyUserData(result.user)
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignUp = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthNotice('')
    setAuthLoading(true)

    try {
      const result = await authService.signUp({
        email: authState.email,
        password: authState.password,
        fullName: authState.fullName,
        company: authState.company,
      })
      setAuthNotice(
        result?.activated
          ? result.seatActivated
            ? 'Account created and your company seat is assigned. Check your inbox to verify your email, then sign in.'
            : 'Account created and your subscription is attached. Check your inbox to verify your email, then sign in.'
          : 'Account request submitted. Check your inbox to verify your email. Access unlocks once your subscription is active or a manager approves you.',
      )
      setAuthView('signin')
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handlePasswordReset = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthNotice('')
    setAuthLoading(true)

    try {
      await authService.requestPasswordReset(authState.email)
      setAuthNotice('Password reset email sent. Check your inbox.')
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleResetPasswordSubmit = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthNotice('')

    if (!resetPassword.newPassword || !resetPassword.confirmPassword) {
      setAuthError('Both password fields are required.')
      return
    }

    if (resetPassword.newPassword !== resetPassword.confirmPassword) {
      setAuthError('The new passwords do not match.')
      return
    }

    if (resetPassword.newPassword.length < 8) {
      setAuthError('Choose a password with at least 8 characters.')
      return
    }

    setResetPasswordLoading(true)

    try {
      if (!isSupabaseConfigured) {
        setAuthNotice('Password reset is unavailable because Supabase is not configured.')
        return
      }

      const { error } = await supabase.auth.updateUser({
        password: resetPassword.newPassword,
      })

      if (error) {
        throw new Error(error.message)
      }

      setAuthNotice('Your password has been updated. You can sign in now.')
      setResetPassword({ newPassword: '', confirmPassword: '' })
      setTimeout(() => {
        setAuthView('signin')
        window.history.replaceState({}, '', window.location.origin)
      }, 1200)
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setResetPasswordLoading(false)
    }
  }

  const openContactCard = () => {
    setContactCardError('')
    setContactCardNotice('')
    setContactCardDraft(contactCard)
    setContactCardOpen(true)
  }

  const handleContactCardChange = (field, value) => {
    setContactCardDraft((prev) => ({ ...prev, [field]: value }))
  }

  const handleSaveContactCard = async (event) => {
    event.preventDefault()
    setContactCardError('')
    setContactCardNotice('')

    if (!contactCardDraft?.fullName?.trim()) {
      setContactCardError('A name is required.')
      return
    }

    setContactCardSaving(true)

    try {
      if (!isSupabaseConfigured) {
        setContactCard(contactCardDraft)
        setContactCardNotice('Contact card updated.')
        return
      }

      const saved = await authService.updateMyContactCard(contactCardDraft)
      setContactCard(saved)
      setContactCardDraft(saved)
      setContactCardNotice('Contact card updated.')
    } catch (error) {
      setContactCardError(error.message)
    } finally {
      setContactCardSaving(false)
    }
  }

  const isGoogleConnected = cloudConnections.some((connection) => connection.provider === 'google')

  const loadCalendarMonth = async (month, calendarId = selectedCalendarId) => {
    if (!isSupabaseConfigured || !isGoogleConnected) return

    const timeMin = new Date(month.getFullYear(), month.getMonth() - 1, 1).toISOString()
    const timeMax = new Date(month.getFullYear(), month.getMonth() + 2, 0, 23, 59, 59).toISOString()

    setCalendarError('')
    setCalendarLoading(true)

    try {
      const [events, calendars] = await Promise.all([
        cloudDriveService.listCalendarEvents({ timeMin, timeMax, calendarId }),
        googleCalendars.length === 0 ? cloudDriveService.listCalendars() : Promise.resolve(googleCalendars),
      ])
      setGoogleEvents(events)
      setGoogleCalendars(calendars)
    } catch (error) {
      setCalendarError(
        error.message === 'reauth_required'
          ? 'Your Google connection expired. Reconnect it in Integrations.'
          : error.message,
      )
    } finally {
      setCalendarLoading(false)
    }
  }

  const handleSelectCalendar = (calendarId) => {
    setSelectedCalendarId(calendarId)
    localStorage.setItem('echoai-calendar-id', calendarId)
    loadCalendarMonth(new Date(), calendarId)
  }

  const handleToggleCalendarSync = (enabled) => {
    setCalendarSyncEnabled(enabled)
    localStorage.setItem('echoai-calendar-sync', String(enabled))
  }

  // Mirrors a newly scheduled post onto the chosen Google calendar.
  const syncPostToCalendar = async (post) => {
    if (!calendarSyncEnabled || !isGoogleConnected || !post?.scheduledAt) return

    const start = new Date(post.scheduledAt)
    if (Number.isNaN(start.getTime())) return

    try {
      await cloudDriveService.createCalendarEvent({
        calendarId: selectedCalendarId,
        title: post.campaign || 'EchoAI scheduled post',
        description: [post.message, (post.channels ?? []).join(', ')].filter(Boolean).join('\n\n'),
        start: start.toISOString(),
        end: new Date(start.getTime() + 30 * 60000).toISOString(),
      })
    } catch (error) {
      setCalendarError(`Calendar sync failed: ${error.message}`)
    }
  }

  const loadCloudConnections = async () => {
    if (!isSupabaseConfigured) return
    try {
      setCloudConnections(await cloudDriveService.listConnections())
    } catch (error) {
      setCloudError(error.message)
    }
  }

  const browseCloud = async ({ provider, folderId = '', search = '', label = '' }) => {
    setCloudError('')
    setCloudBusy(true)
    setCloudProvider(provider)

    try {
      const items = await cloudDriveService.listFiles({ provider, folderId, search })
      setCloudItems(items)

      if (search) {
        setCloudPath([{ id: '', label: `Search: ${search}` }])
      } else if (!folderId) {
        setCloudPath([])
      } else {
        setCloudPath((prev) => [...prev, { id: folderId, label }])
      }
    } catch (error) {
      setCloudError(
        error.message === 'reauth_required'
          ? 'That connection expired. Reconnect the provider to continue.'
          : error.message === 'not_connected'
            ? 'Connect this provider first.'
            : error.message,
      )
    } finally {
      setCloudBusy(false)
    }
  }

  // Adds a pointer to the file. Nothing is copied, so the quota is untouched.
  const linkCloudFile = (item) => {
    const asset = toLinkedAsset({ item, provider: cloudProvider, folderId: selectedFolderId })

    if (workspaceAssets.some((existing) => existing.id === asset.id)) {
      setCloudError(`${item.name} is already in this workspace.`)
      return
    }

    setWorkspaceAssets((prev) => [asset, ...prev])
    setCloudError('')
  }

  const handleDisconnectCloud = async (provider) => {
    try {
      await cloudDriveService.disconnect(provider)
      setCloudConnections((prev) => prev.filter((entry) => entry.provider !== provider))
      if (cloudProvider === provider) {
        setCloudItems([])
        setCloudProvider('')
      }
    } catch (error) {
      setCloudError(error.message)
    }
  }

  const loadBrandKit = async () => {
    setBrandError('')

    try {
      const kit = await brandService.getBrandKit()
      setBrandKit(kit)
      setBrandDraft(kit)
      await loadBrandFonts(kit.fonts)
    } catch (error) {
      setBrandError(error.message)
    }
  }

  const handleSaveBrandKit = async () => {
    setBrandError('')
    setBrandNotice('')
    setBrandBusy(true)

    try {
      const saved = await brandService.saveBrandKit(brandDraft)
      setBrandKit(saved)
      setBrandDraft(saved)
      await loadBrandFonts(saved.fonts)
      setBrandNotice('Brand kit saved. It now applies across the editors.')
    } catch (error) {
      setBrandError(error.message)
    } finally {
      setBrandBusy(false)
    }
  }

  const addBrandColor = () => {
    setBrandDraft((prev) => ({
      ...prev,
      colors: [
        ...prev.colors,
        { id: `color-${prev.colors.length + 1}-${prev.colors.length}`, label: 'New colour', value: '#3b82f6' },
      ],
    }))
  }

  const updateBrandColor = (id, patch) => {
    setBrandDraft((prev) => ({
      ...prev,
      colors: prev.colors.map((color) => (color.id === id ? { ...color, ...patch } : color)),
    }))
  }

  const removeBrandItem = (collection, id) => {
    setBrandDraft((prev) => ({
      ...prev,
      [collection]: prev[collection].filter((item) => item.id !== id),
    }))
  }

  const addBrandFont = () => {
    setBrandDraft((prev) => ({
      ...prev,
      fonts: [
        ...prev.fonts,
        {
          id: `font-${prev.fonts.length + 1}-${prev.fonts.length}`,
          label: 'Heading font',
          family: '',
          sourceUrl: '',
          fallback: 'system-ui, sans-serif',
        },
      ],
    }))
  }

  const updateBrandFont = (id, patch) => {
    setBrandDraft((prev) => ({
      ...prev,
      fonts: prev.fonts.map((font) => (font.id === id ? { ...font, ...patch } : font)),
    }))
  }

  const handleBrandLogoUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > MAX_LOGO_BYTES) {
      setBrandError(`Logos must be under ${Math.round(MAX_LOGO_BYTES / 1024)} KB. Try an SVG or compressed PNG.`)
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setBrandError('')
      setBrandDraft((prev) => ({
        ...prev,
        logos: [
          ...prev.logos,
          {
            id: `logo-${prev.logos.length + 1}-${prev.logos.length}`,
            label: file.name.replace(/\.[^.]+$/, ''),
            dataUrl: String(reader.result),
            usage: 'primary',
          },
        ],
      }))
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const handleStartMfaEnrollment = async () => {
    setMfaError('')
    setMfaBusy(true)

    try {
      setMfaEnrollment(await authService.startMfaEnrollment())
      setMfaEnrollOpen(true)
    } catch (error) {
      setMfaError(error.message)
    } finally {
      setMfaBusy(false)
    }
  }

  const handleConfirmMfaEnrollment = async (event) => {
    event.preventDefault()
    setMfaError('')
    setMfaBusy(true)

    try {
      const result = await authService.confirmMfaEnrollment({
        factorId: mfaEnrollment.factorId,
        code: mfaEnrollCode,
      })
      setMfaRecoveryCodes(result.recoveryCodes)
      setMfaEnrollment(null)
      setMfaEnrollCode('')
    } catch (error) {
      setMfaError(error.message)
    } finally {
      setMfaBusy(false)
    }
  }

  const handleRecoverWithBackupCode = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthNotice('')
    setAuthLoading(true)

    try {
      const result = await authService.recoverWithBackupCode({
        email: pendingEmail || authState.email,
        password: authState.password,
        recoveryCode: recoveryCodeInput,
      })
      setAuthNotice(result?.message ?? 'Authenticator removed. Sign in again to set up a new one.')
      setRecoveryMode(false)
      setMfaPending(false)
      setRecoveryCodeInput('')
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleVerifyMfa = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthNotice('')
    setAuthLoading(true)

    try {
      const result = await authService.verifyMfaCode({
        email: pendingEmail,
        code: authState.otpCode,
        factorId: mfaChallenge.factorId,
        challengeId: mfaChallenge.challengeId,
      })
      setSession(result.user)
      await applyUserData(result.user)
      await loadRepostWorkspace()
      await loadBrandKit()
      await loadCloudConnections()
      if (result.user?.role === 'admin') {
        await loadAdminData()
      }
      setMfaPending(false)
      setMfaChallenge({ factorId: '', challengeId: '' })
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const toggleChannel = (channelId) => {
    setComposer((prev) => {
      const hasChannel = prev.channels.includes(channelId)
      return {
        ...prev,
        channels: hasChannel
          ? prev.channels.filter((channel) => channel !== channelId)
          : [...prev.channels, channelId],
      }
    })
  }

  const handleComposerChange = (field, value) => {
    setComposer((prev) => ({ ...prev, [field]: value }))
  }

  const saveSocialAccount = async ({ platform, accountName, accountType = 'profile', publishingScopes = [] }) => {
    setIntegrationError('')
    const normalizedPlatform = platform.toLowerCase()
    const normalizedName = accountName.trim()

    if (!normalizedName) {
      setIntegrationError(`Enter a ${getPlatformMeta(normalizedPlatform).label} account label before saving.`)
      return
    }

    try {
      const saved = await socialIntegrationService.saveAccount({
        platform: normalizedPlatform,
        accountName: normalizedName,
        accountType,
        publishingScopes,
      })
      const nextAccount = saved ?? {
        id: nextLocalId('acc'),
        platform: getPlatformMeta(normalizedPlatform).label,
        accountName: normalizedName,
        accountType,
        publishingScopes,
        status: 'oauth required',
        connectionStatus: 'profile_saved',
      }
      setConnectedAccounts((prev) => [
        ...prev.filter((account) => account.platform.toLowerCase() !== normalizedPlatform),
        nextAccount,
      ])
      setAccountHandleDrafts((prev) => ({ ...prev, [normalizedPlatform]: normalizedName }))
    } catch (error) {
      setIntegrationError(error.message)
    }
  }

  const removeSocialAccount = async (account) => {
    setIntegrationError('')
    try {
      await socialIntegrationService.removeAccount(account.id)
      setConnectedAccounts((prev) => prev.filter((item) => item.id !== account.id))
    } catch (error) {
      setIntegrationError(error.message)
    }
  }

  const connectSocialAccount = async ({ platform, requestedScopes }) => {
    setIntegrationError('')
    try {
      await socialIntegrationService.connectAccount({ platform, requestedScopes })
    } catch (error) {
      setIntegrationError(error.message)
    }
  }

  const openQuickConnect = () => {
    setQuickConnectEmail(session?.email || authState.email || '')
    setQuickConnectName(userIdentity === 'team member' ? '' : userIdentity)
    setQuickConnectNotice('Select the providers you want to connect. Each provider will ask you to sign in and approve access.')
    setIntegrationError('')
    setQuickConnectOpen(true)
  }

  const startQuickConnect = async () => {
    if (!quickConnectEmail.trim() || !quickConnectName.trim()) {
      setQuickConnectNotice('Enter your name and email first so we can label this connection session.')
      return
    }
    if (!quickConnectSelected.length) {
      setQuickConnectNotice('Select at least one provider to connect.')
      return
    }

    const nextPlatform = quickConnectSelected.find((platform) => {
      const account = connectedAccounts.find((item) => item.platform.toLowerCase() === platform)
      return account?.status !== 'healthy'
    })

    if (!nextPlatform) {
      setQuickConnectNotice('All selected providers are already connected.')
      return
    }

    setQuickConnectNotice(`Opening ${getPlatformMeta(nextPlatform).label}. Sign in there and approve EchoAI access.`)
    await connectSocialAccount({
      platform: nextPlatform,
      requestedScopes: ['posts', 'images', 'videos', 'analytics'],
    })
  }

  const loadSocialPlatformReadiness = async () => {
    setSocialPlatformReadinessError('')
    setSocialPlatformReadinessLoading(true)
    try {
      setSocialPlatformReadiness(await socialIntegrationService.getPlatformReadiness())
    } catch (error) {
      setSocialPlatformReadinessError(error.message)
    } finally {
      setSocialPlatformReadinessLoading(false)
    }
  }

  const handleSchedulePost = async (event) => {
    event.preventDefault()
    setSchedulerError('')
    if (!composer.message.trim() || !composer.scheduledAt || !composer.channels.length) {
      setSchedulerError('Add a message, at least one channel, and a deployment date and time.')
      return
    }

    const invalidSelectedChannels = composer.channels.filter((channel) => {
      const linkedAccount = connectedAccounts.find((a) => a.platform.toLowerCase() === channel)
      return !linkedAccount || linkedAccount.status !== 'healthy'
    })

    if (invalidSelectedChannels.length) {
      setSchedulerError(`Complete OAuth for ${invalidSelectedChannels.join(', ')} before queuing this post.`)
      return
    }

    const newPost = await platformService.schedulePost({
      campaign: composer.campaign || 'Daily Campaign',
      message: composer.message,
      imageIdea: composer.imageIdea,
      scheduledAt: composer.scheduledAt,
      channels: composer.channels,
      media: workspaceAssets
        .filter((asset) => composer.mediaAssetIds.includes(asset.id))
        .map(({ id, name, type, mime, size, previewUrl, linked, provider, externalId, storagePath, webUrl }) => ({
          id, name, type, mime, size, previewUrl, linked, provider, externalId, storagePath, webUrl,
        })),
    })

    setScheduledPosts((prev) => [newPost, ...prev])
    await syncPostToCalendar(newPost)
    setComposer({
      campaign: '',
      message: '',
      imageIdea: '',
      scheduledAt: '',
      channels: [],
      mediaAssetIds: [],
    })
  }

  const handlePostNow = async (event) => {
    event.preventDefault()
    setSchedulerError('')
    if (!composer.message.trim() || !composer.channels.length) {
      setSchedulerError('Add a message and at least one channel before posting.')
      return
    }

    const invalidSelectedChannels = composer.channels.filter((channel) => {
      const linkedAccount = connectedAccounts.find((a) => a.platform.toLowerCase() === channel)
      return !linkedAccount || linkedAccount.status !== 'healthy'
    })

    if (invalidSelectedChannels.length) {
      setSchedulerError(`Complete OAuth for ${invalidSelectedChannels.join(', ')} before posting.`)
      return
    }

    try {
      const newPost = await platformService.postNow({
        campaign: composer.campaign || 'Instant Campaign',
        message: composer.message,
        imageIdea: composer.imageIdea,
        channels: composer.channels,
        media: workspaceAssets
          .filter((asset) => composer.mediaAssetIds.includes(asset.id))
          .map(({ id, name, type, mime, size, previewUrl, linked, provider, externalId, storagePath, webUrl }) => ({
            id, name, type, mime, size, previewUrl, linked, provider, externalId, storagePath, webUrl,
          })),
      })

      setScheduledPosts((prev) => [newPost, ...prev])
      setComposer({
        campaign: '',
        message: '',
        imageIdea: '',
        scheduledAt: '',
        channels: [],
        mediaAssetIds: [],
      })
    } catch (error) {
      setSchedulerError(error.message)
    }
  }

  const handleGenerateAi = async () => {
    if (!aiInput.trim()) {
      return
    }

    setAiLoading(true)
    try {
      const suggestions = await platformService.generateMessageIdeas(aiInput, aiAgentConfig)
      setAiSuggestions(suggestions)
    } finally {
      setAiLoading(false)
    }
  }

  const handleEditCreativeProject = (project) => {
    setCreativeProject(project)
    setActiveTab(project.outputType === 'video' ? 'studio' : 'photo')
  }

  const handleUseCreativeDraft = (project) => {
    setComposer((prev) => ({
      ...prev,
      campaign: project.title || prev.campaign,
      message: project.caption || prev.message,
      imageIdea: project.visualPrompt || prev.imageIdea,
    }))
  }

  const handleSaveCreativeProjectToWorkspace = async (project) => {
    // Save the generated project (with AI image, headline, caption, etc.) as a workspace asset
    const asset = {
      id: `creative_${Date.now()}`,
      name: project.title || `${project.outputType} - ${new Date().toLocaleDateString()}`,
      type: project.imageSrc ? 'image' : 'document',
      mime: project.imageSrc ? 'image/png' : 'application/json',
      size: project.imageSrc ? Math.round((project.imageSrc.length || 0) * 0.72) : 0,
      folderId: AI_GENERATIONS_FOLDER_ID,
      createdAt: new Date().toISOString(),
      previewUrl: project.imageSrc || '',
      summary: `AI-generated ${project.outputType}: ${project.headline || project.title} • Saved automatically in AI Generations`,
      // Store the full project metadata so it can be retrieved/edited later
      projectMetadata: {
        title: project.title,
        headline: project.headline,
        caption: project.caption,
        visualPrompt: project.visualPrompt,
        outputType: project.outputType,
        scenes: project.scenes,
        imageSource: project.imageSource,
        imageSrc: project.imageSrc,
        source: project.source,
      },
    }

    setWorkspaceAssets((prev) => [asset, ...prev])
  }

  const handleSaveAiAgent = async (event) => {
    event.preventDefault()
    setAiAgentSaving(true)
    setAiAgentFeedback('')

    try {
      const capabilities = Array.isArray(aiAgentDraft.capabilities)
        ? aiAgentDraft.capabilities
        : createDefaultAiAgentConfig().capabilities

      const savedConfig = await authService.updateUserAiAgentConfig({
        userId: session.id,
        aiAgentConfig: {
          ...createDefaultAiAgentConfig(),
          ...aiAgentDraft,
          capabilities,
          enabled: Boolean(aiAgentDraft.endpoint.trim()) && aiAgentDraft.enabled,
          endpoint: aiAgentDraft.endpoint.trim(),
          apiKey: aiAgentDraft.apiKey.trim(),
          model: aiAgentDraft.model.trim(),
          provider: aiAgentDraft.provider || 'custom_router',
          status: aiAgentDraft.endpoint.trim() ? 'connected' : 'not connected',
          message: aiAgentDraft.endpoint.trim()
            ? 'Your in-house AI is ready for its enabled creative capabilities.'
            : 'Connect an in-house AI endpoint to activate creative generation.',
          lastSyncedAt: aiAgentDraft.endpoint.trim() ? new Date().toISOString() : '',
        },
      })

      const nextAiAgentConfig = { ...createDefaultAiAgentConfig(), ...savedConfig }
      setAiAgentConfig(nextAiAgentConfig)
      setAiAgentDraft(nextAiAgentConfig)
      setAiAgentFeedbackTone('success')
      setAiAgentFeedback('AI agent settings saved for this account.')
    } catch (error) {
      setAiAgentFeedbackTone('error')
      setAiAgentFeedback(error.message)
    } finally {
      setAiAgentSaving(false)
    }
  }

  const saveInhouseAiConfig = async (nextConfig) => {
    const savedConfig = await authService.updateUserAiAgentConfig({
      userId: session.id,
      aiAgentConfig: nextConfig,
    })
    const normalized = { ...createDefaultAiAgentConfig(), ...savedConfig }
    setAiAgentConfig(normalized)
    setAiAgentDraft(normalized)
    return normalized
  }

  const saveAiAgentConnection = async (connection) => {
    const saved = await authService.saveAiAgentConnection(connection)
    setAiAgentConnections((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
    const active = { ...createDefaultAiAgentConfig(), ...saved, connectionId: saved.id }
    setAiAgentConfig(active)
    setAiAgentDraft(active)
    return saved
  }

  const deleteAiAgentConnection = async (connectionId) => {
    await authService.deleteAiAgentConnection(connectionId)
    setAiAgentConnections((current) => current.filter((item) => item.id !== connectionId))
    if (aiAgentConfig.connectionId === connectionId) {
      setAiAgentConfig(createDefaultAiAgentConfig())
      setAiAgentDraft(createDefaultAiAgentConfig())
    }
  }

  const resyncAiAgentConnection = async (connection) => {
    const { data, error } = await supabase.functions.invoke('inhouse-ai', {
      body: { connectionId: connection.id, mode: 'test', capability: 'test', contractVersion: '2.0', prompt: 'EchoAI connection test' },
    })
    if (error) {
      const detail = await error.context?.json?.().catch(() => null)
      throw new Error(detail?.error || detail?.detail?.error?.message || error.message)
    }
    if (data?.error) throw new Error(data.error)
    setAiAgentConnections((current) => current.map((item) => item.id === connection.id ? { ...item, status: 'connected', lastError: '' } : item))
  }

  const handleInhouseAiAsset = (asset) => {
    setWorkspaceAssets((prev) => [{
      id: `asset_${Date.now()}`,
      size: 0,
      folderId: AI_GENERATIONS_FOLDER_ID,
      createdAt: new Date().toISOString(),
      ...asset,
      summary: `${asset.summary || 'AI-generated media'} • Saved automatically in AI Generations`,
    }, ...prev])
  }

  const handleAiAgentDraftChange = (field, value) => {
    setAiAgentDraft((prev) => ({ ...prev, [field]: value }))
  }

  const handleAiAgentCapabilityToggle = (capabilityKey) => {
    setAiAgentDraft((prev) => {
      const current = Array.isArray(prev.capabilities) ? prev.capabilities : []
      const next = current.includes(capabilityKey)
        ? current.filter((item) => item !== capabilityKey)
        : [...current, capabilityKey]

      return { ...prev, capabilities: next }
    })
  }

  const handleTestAiAgent = async () => {
    const endpoint = aiAgentDraft.endpoint.trim() || aiAgentConfig.endpoint.trim()
    if (!endpoint) {
      setAiAgentFeedbackTone('error')
      setAiAgentFeedback('Add an AI agent endpoint before testing the connection.')
      return
    }

    let endpointUrl
    try {
      endpointUrl = new URL(endpoint)
    } catch {
      setAiAgentFeedbackTone('error')
      setAiAgentFeedback('Use a complete HTTPS API endpoint, for example https://your-domain.com/echoai-agent.')
      return
    }

    if (endpointUrl.protocol !== 'https:' && endpointUrl.hostname !== 'localhost') {
      setAiAgentFeedbackTone('error')
      setAiAgentFeedback('Use an HTTPS API endpoint. Do not paste a normal OpenArt, ChatGPT, or dashboard webpage URL; EchoAI needs an endpoint that accepts POST requests.')
      return
    }

    setAiAgentTesting(true)
    setAiAgentFeedback('')

    try {
      const capabilities = Array.isArray(aiAgentDraft.capabilities)
        ? aiAgentDraft.capabilities
        : aiAgentConfig.capabilities

      const testConfig = {
        ...createDefaultAiAgentConfig(),
        ...aiAgentDraft,
        capabilities,
        endpoint,
        enabled: true,
      }

      const testPayload = {
          contractVersion: '2.0',
          mode: 'test',
          capability: 'test',
          ...(testConfig.connectionId ? { connectionId: testConfig.connectionId } : {}),
          model: testConfig.model || 'default',
          agentName: testConfig.name || 'My AI Agent',
          capabilities: testConfig.capabilities,
          routing: testConfig.routing,
          prompt: 'EchoAI connection test',
      }

      if (isSupabaseConfigured) {
        const { data, error } = await supabase.functions.invoke('inhouse-ai', { body: testPayload })
        if (error) {
          const detail = await error.context?.json?.().catch(() => null)
          throw new Error(detail?.error || detail?.detail?.error?.message || error.message)
        }
        if (data?.error) throw new Error(data.error)
      } else {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(testConfig.apiKey ? { Authorization: `Bearer ${testConfig.apiKey}` } : {}),
          },
          body: JSON.stringify(testPayload),
        })
        if (!response.ok) throw new Error(`AI agent test failed (${response.status})`)
      }

      setAiAgentFeedbackTone('success')
      setAiAgentFeedback('AI agent connection verified successfully.')
    } catch (error) {
      setAiAgentFeedbackTone('error')
      const message = error instanceof TypeError
        ? 'The browser blocked this connection, usually because of CORS. Your endpoint must allow POST and OPTIONS requests from this EchoAI site. A provider website URL such as openart.ai/home cannot be connected directly.'
        : error.message
      setAiAgentFeedback(message)
    } finally {
      setAiAgentTesting(false)
    }
  }

  const handlePhotoExport = (project) => {
    const exportedAsset = {
      id: `asset_${Date.now()}`,
      name: project.exportName || 'photo-creator-export.png',
      type: 'image',
      mime: 'image/png',
      size: project.sizeBytes || Math.max(300000, Math.round((project.dataUrl?.length || 0) * 0.72)),
      folderId: selectedFolderId,
      createdAt: new Date().toISOString(),
      previewUrl: project.dataUrl,
      summary: project.summary || 'Exported from the photo creator',
    }

    setWorkspaceAssets((prev) => [exportedAsset, ...prev])
  }

  const handleCreateFolder = (event) => {
    event.preventDefault()
    if (!newFolderName.trim()) {
      return
    }

    const folder = {
      id: `folder_${Date.now()}`,
      name: newFolderName.trim(),
      parentId: selectedFolderId,
      createdAt: new Date().toISOString(),
    }

    setWorkspaceFolders((prev) => [...prev, folder])
    setNewFolderName('')
    setSelectedFolderId(folder.id)
  }

  const handleUploadAsset = async (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const fileSizeMb = file.size / 1024 / 1024
    if (storageUsedMb + fileSizeMb > storageQuotaMb) {
      setAdminError('This upload exceeds your available storage quota.')
      event.target.value = ''
      return
    }

    const assetType = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : 'document'

    const previewUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Unable to read file'))
      reader.readAsDataURL(file)
    })

    let storagePath = ''
    if (isSupabaseConfigured && ['image', 'video'].includes(assetType)) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sign in before uploading media.')
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
      storagePath = `${user.id}/${Date.now()}-${safeName}`
      const { error } = await supabase.storage
        .from('social-media')
        .upload(storagePath, file, { contentType: file.type, upsert: false })
      if (error) throw new Error(error.message)
    }

    const asset = {
      id: `asset_${Date.now()}`,
      name: file.name,
      type: assetType,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      folderId: selectedFolderId,
      createdAt: new Date().toISOString(),
      previewUrl,
      storagePath,
      summary: 'Uploaded from your device',
    }

    setWorkspaceAssets((prev) => [asset, ...prev])
    event.target.value = ''
  }

  // Prevent the browser from navigating to dropped files anywhere on the page.
  useEffect(() => {
    // Prevent browser navigating to the file; don't set dropEffect so element handlers control the cursor
    const blockBrowser = (e) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault()
    }
    document.addEventListener('dragover', blockBrowser)
    document.addEventListener('drop', blockBrowser)
    return () => {
      document.removeEventListener('dragover', blockBrowser)
      document.removeEventListener('drop', blockBrowser)
    }
  }, [])

  const handleAssetFileDrop = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    setDrawerDragActive(false)
    const file = event.dataTransfer?.files?.[0]
    if (!file) return
    const fileSizeMb = file.size / 1024 / 1024
    if (storageUsedMb + fileSizeMb > storageQuotaMb) {
      setAdminError('This upload exceeds your available storage quota.')
      return
    }
    const assetType = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : 'document'
    const previewUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Unable to read file'))
      reader.readAsDataURL(file)
    })
    let storagePath = ''
    if (isSupabaseConfigured && ['image', 'video'].includes(assetType)) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sign in before uploading media.')
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
      storagePath = `${user.id}/${Date.now()}-${safeName}`
      const { error } = await supabase.storage
        .from('social-media')
        .upload(storagePath, file, { contentType: file.type, upsert: false })
      if (error) throw new Error(error.message)
    }
    setWorkspaceAssets((prev) => [{
      id: `asset_${Date.now()}`,
      name: file.name,
      type: assetType,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      folderId: selectedFolderId,
      createdAt: new Date().toISOString(),
      previewUrl,
      storagePath,
      summary: 'Dropped into workspace',
    }, ...prev])
  }

  const filteredAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase()
    return workspaceAssets.filter((asset) => {
      if (!query) {
        return asset.folderId === selectedFolderId
      }

      return (
        asset.folderId === selectedFolderId &&
        `${asset.name} ${asset.summary}`.toLowerCase().includes(query)
      )
    })
  }, [assetSearch, selectedFolderId, workspaceAssets])

  const currentFolder = workspaceFolders.find((folder) => folder.id === selectedFolderId)
  const folderBreadcrumbs = useMemo(() => {
    const crumbs = []
    let folder = currentFolder

    while (folder) {
      crumbs.unshift(folder)
      folder = workspaceFolders.find((item) => item.id === folder.parentId)
    }

    return crumbs
  }, [currentFolder, workspaceFolders])

  const startRenameItem = (type, id, name) => {
    setEditingItem({ type, id })
    setEditingName(name)
  }

  const saveRenameItem = () => {
    if (!editingItem) {
      return
    }

    const trimmed = editingName.trim()
    if (!trimmed) {
      setEditingItem(null)
      setEditingName('')
      return
    }

    if (editingItem.type === 'folder') {
      setWorkspaceFolders((prev) => prev.map((folder) => (folder.id === editingItem.id ? { ...folder, name: trimmed } : folder)))
    } else {
      setWorkspaceAssets((prev) => prev.map((asset) => (asset.id === editingItem.id ? { ...asset, name: trimmed } : asset)))
    }

    setEditingItem(null)
    setEditingName('')
  }

  const deleteFolder = (folderId) => {
    const foldersToRemove = [folderId]
    const collectChildren = (id) => {
      const children = workspaceFolders.filter((folder) => folder.parentId === id)
      children.forEach((child) => {
        foldersToRemove.push(child.id)
        collectChildren(child.id)
      })
    }

    collectChildren(folderId)

    setWorkspaceFolders((prev) => prev.filter((folder) => !foldersToRemove.includes(folder.id)))
    setWorkspaceAssets((prev) => prev.filter((asset) => !foldersToRemove.includes(asset.folderId)))

    if (selectedFolderId === folderId || foldersToRemove.includes(selectedFolderId)) {
      setSelectedFolderId('folder-root')
    }
  }

  const deleteAsset = (assetId) => {
    setWorkspaceAssets((prev) => prev.filter((asset) => asset.id !== assetId))
  }

  const handleAssetDragStart = () => {}

  const handleQuotaUpdate = async (member) => {
    const nextQuota = Number(quotaDraftMb)
    if (!Number.isFinite(nextQuota) || nextQuota <= 0) {
      setAdminError('Storage quota must be a positive number.')
      return
    }

    try {
      const updatedMember = await authService.updateUserStorageQuota({
        userId: member.id,
        storageQuotaMb: nextQuota,
      })

      setTeamMembers((prev) =>
        prev.map((item) => (item.id === updatedMember.id ? { ...item, ...updatedMember } : item)),
      )
      if (session?.id === updatedMember.id) {
        setSession((prev) => ({ ...prev, storageQuotaMb: updatedMember.storageQuotaMb }))
      }
      setQuotaEditingUserId('')
      setQuotaDraftMb('2048')
      setAdminError('')
    } catch (error) {
      setAdminError(error.message)
    }
  }
  const handleUpdateUserRole = async (member, nextRole) => {
    setAdminError('')
    setAdminLoading(true)

    try {
      const updatedMember = await authService.updateUserRole({
        userId: member.id,
        role: nextRole,
      })

      setTeamMembers((prev) =>
        prev.map((item) => (item.id === updatedMember.id ? { ...item, ...updatedMember } : item)),
      )

      if (session?.id === updatedMember.id) {
        setSession((prev) => ({ ...prev, role: updatedMember.role }))
        if (!['admin', 'manager', 'it'].includes(updatedMember.role)) {
          setActiveTab('dashboard')
        }
      }
    } catch (error) {
      setAdminError(error.message)
    } finally {
      setAdminLoading(false)
    }
  }

  const openSupportModal = () => {
    if (supportCloseTimerRef.current) window.clearTimeout(supportCloseTimerRef.current)
    setSupportError('')
    setSupportSuccess('')
    setSupportTicket({
      category: 'Technical issue',
      details: '',
    })
    setSupportModalOpen(true)
  }

  const closeSupportModal = () => {
    if (supportCloseTimerRef.current) window.clearTimeout(supportCloseTimerRef.current)
    setSupportModalOpen(false)
    setSupportError('')
    setSupportSuccess('')
    setSupportAttachments([])
  }

  const handleSupportTicketChange = (field, value) => {
    setSupportTicket((prev) => ({ ...prev, [field]: value }))
  }

  const handleAdminUserAction = async ({ action, userId, fullName, company }) => {
    const result = await authService.adminUserAction({ action, userId, fullName, company })

    if (action === 'update-profile' && result?.profile) {
      setTeamMembers((prev) => prev.map((member) => (
        member.id === userId
          ? { ...member, fullName: result.profile.full_name, company: result.profile.company }
          : member
      )))
    }

    return result
  }

  const handleSupportAttachmentChange = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return

    setSupportUploading(true)
    setSupportError('')
    try {
      const uploaded = []
      for (const file of files) {
        const path = await authService.uploadTicketAttachment(file)
        uploaded.push({ path, name: file.name })
      }
      setSupportAttachments((prev) => [...prev, ...uploaded])
    } catch (error) {
      setSupportError(error.message)
    } finally {
      setSupportUploading(false)
    }
  }

  const handleSubmitSupportTicket = async (event) => {
    event.preventDefault()
    setSupportError('')
    setSupportSuccess('')
    setSupportLoading(true)

    try {
      await authService.createSupportTicket({
        category: supportTicket.category,
        details: supportTicket.details,
        attachmentPaths: supportAttachments.map((attachment) => attachment.path),
      })

      setSupportSuccess('Support ticket sent successfully. Our team will follow up soon.')
      setAlerts((prev) => [
        {
          id: `issue_support_${Date.now()}`,
          title: `Support ticket: ${supportTicket.category}`,
          owner: 'Support Desk',
          priority: 'medium',
          status: 'open',
        },
        ...prev,
      ])
      setSupportTicket({
        category: 'Technical issue',
        details: '',
      })
      setSupportAttachments([])
      supportCloseTimerRef.current = window.setTimeout(() => {
        setSupportModalOpen(false)
        setSupportSuccess('')
      }, 1200)
    } catch (error) {
      setSupportError(error.message)
    } finally {
      setSupportLoading(false)
    }
  }

  const handleCompanyPackageRequest = async (request) => {
    await authService.submitCompanyPackageRequest(request)
    setCompanyPackageRequested(true)
  }

  const getCompanyPostById = (companyPostId) =>
    companyMainPosts.find((item) => item.id === companyPostId)

  const toggleDraftChannel = (channelId) => {
    setCompanyPostDraft((prev) => {
      const hasChannel = prev.channels.includes(channelId)
      return {
        ...prev,
        channels: hasChannel
          ? prev.channels.filter((channel) => channel !== channelId)
          : [...prev.channels, channelId],
      }
    })
  }

  const nextLocalId = (prefix) => {
    localIdRef.current += 1
    return `${prefix}_${localIdRef.current}`
  }

  const createBrandedRepost = (companyPost) => ({
    id: nextLocalId('repost'),
    companyPostId: companyPost.id,
    status: 'posted',
    caption: `Reposted by ${userIdentity}: ${companyPost.content}`,
    postedAt: new Date().toISOString(),
  })

  const postToUserAccounts = (companyPost) => {
    const repost = createBrandedRepost(companyPost)
    setUserReposts((prev) => [repost, ...prev])
    return repost
  }

  const handleCopyCompanyPost = async (post) => {
    setRepostNotice('')

    try {
      await navigator.clipboard.writeText(post.content)
      setRepostNotice(`Copied post content from ${post.companyName}.`)
    } catch {
      setRepostNotice('Copy failed in this browser. You can still approve and repost directly.')
    }
  }

  const handleSendToApprovalBoard = async (companyPost) => {
    setRepostNotice('')
    setRepostError('')

    const alreadyQueued = repostQueue.some(
      (item) =>
        item.companyPostId === companyPost.id &&
        (item.status === 'pending' || item.status === 'approved' || item.status === 'posted'),
    )

    if (alreadyQueued) {
      setRepostNotice('This company post is already in your approval flow.')
      return
    }

    try {
      if (autoApproveCompanyPosts) {
        if (isSupabaseConfigured) {
          const createdQueue = await repostService.enqueueCompanyPost({
            companyPostId: companyPost.id,
            companyKey: tenantCompanyKey,
          })

          const branded = createBrandedRepost(companyPost)
          const persisted = await repostService.approveAndCreateRepost({
            queueId: createdQueue.id,
            companyPostId: companyPost.id,
            companyKey: tenantCompanyKey,
            caption: branded.caption,
          })

          setUserReposts((prev) => [persisted.repost, ...prev])
          setRepostQueue((prev) => [persisted.queue, ...prev])
        } else {
          const repost = postToUserAccounts(companyPost)
          setRepostQueue((prev) => [
            {
              id: nextLocalId('queue'),
              companyPostId: companyPost.id,
              status: 'posted',
              queuedAt: new Date().toISOString(),
              decisionAt: repost.postedAt,
            },
            ...prev,
          ])
        }

        setRepostNotice('Auto-approval is on. Post was rebranded and sent to your accounts.')
        return
      }

      if (isSupabaseConfigured) {
        const created = await repostService.enqueueCompanyPost({
          companyPostId: companyPost.id,
          companyKey: tenantCompanyKey,
        })
        setRepostQueue((prev) => [created, ...prev])
      } else {
        setRepostQueue((prev) => [
          {
            id: nextLocalId('queue'),
            companyPostId: companyPost.id,
            status: 'pending',
            queuedAt: new Date().toISOString(),
            decisionAt: null,
          },
          ...prev,
        ])
      }

      setRepostNotice('Company post added to your approval board.')
    } catch (error) {
      setRepostError(error.message)
    }
  }

  const handleRepostDecision = async (queueId, decision) => {
    setRepostError('')
    const queueItem = repostQueue.find((item) => item.id === queueId)
    if (!queueItem) {
      return
    }

    const companyPost = getCompanyPostById(queueItem.companyPostId)
    if (!companyPost) {
      return
    }

    const decisionTime = new Date().toISOString()

    try {
      if (decision === 'approved') {
        if (isSupabaseConfigured) {
          const branded = createBrandedRepost(companyPost)
          const persisted = await repostService.approveAndCreateRepost({
            queueId,
            companyPostId: companyPost.id,
            companyKey: tenantCompanyKey,
            caption: branded.caption,
          })

          setRepostQueue((prev) =>
            prev.map((item) =>
              item.id === queueId ? { ...item, ...persisted.queue } : item,
            ),
          )
          setUserReposts((prev) => [persisted.repost, ...prev])
        } else {
          const repost = postToUserAccounts(companyPost)
          setRepostQueue((prev) =>
            prev.map((item) =>
              item.id === queueId
                ? {
                    ...item,
                    status: 'posted',
                    decisionAt: repost.postedAt,
                  }
                : item,
            ),
          )
        }

        setRepostNotice('Approved and reposted with user-branded caption.')
        return
      }

      if (isSupabaseConfigured) {
        const persisted = await repostService.markQueueDeclined({ queueId })
        setRepostQueue((prev) =>
          prev.map((item) => (item.id === queueId ? { ...item, ...persisted } : item)),
        )
      } else {
        setRepostQueue((prev) =>
          prev.map((item) =>
            item.id === queueId
              ? {
                  ...item,
                  status: 'declined',
                  decisionAt: decisionTime,
                }
              : item,
          ),
        )
      }

      setRepostNotice('Company post was declined and will not be published to your accounts.')
    } catch (error) {
      setRepostError(error.message)
    }
  }

  const handleToggleAutoApproval = async () => {
    setRepostNotice('')
    setRepostError('')

    const nextValue = !autoApproveCompanyPosts
    setAutoApproveCompanyPosts(nextValue)

    try {
      if (isSupabaseConfigured) {
        await repostService.setAutoApprove({
          enabled: nextValue,
          companyKey: tenantCompanyKey,
        })
      }

      if (nextValue) {
        const pendingItems = repostQueue.filter((item) => item.status === 'pending')

        if (pendingItems.length) {
          if (isSupabaseConfigured) {
            for (const item of pendingItems) {
              await handleRepostDecision(item.id, 'approved')
            }
          } else {
            const pendingPostIds = new Set(pendingItems.map((item) => item.companyPostId))
            const pendingPosts = companyMainPosts.filter((post) => pendingPostIds.has(post.id))
            const postedAt = new Date().toISOString()

            setUserReposts((existing) => [
              ...pendingPosts.map((post) => ({
                id: nextLocalId(`repost_${post.id}`),
                companyPostId: post.id,
                status: 'posted',
                caption: `Reposted by ${userIdentity}: ${post.content}`,
                postedAt,
              })),
              ...existing,
            ])

            setRepostQueue((existing) =>
              existing.map((item) =>
                item.status === 'pending'
                  ? {
                      ...item,
                      status: 'posted',
                      decisionAt: postedAt,
                    }
                  : item,
              ),
            )
          }

          setRepostNotice('Auto-approval enabled. Existing pending items were reposted automatically.')
        } else {
          setRepostNotice('Auto-approval enabled for all future company posts.')
        }
      } else {
        setRepostNotice('Auto-approval disabled. New company posts now require manual approval.')
      }
    } catch (error) {
      setRepostError(error.message)
    }
  }

  const handlePublishCompanyPost = async (event) => {
    event.preventDefault()
    setRepostNotice('')
    setRepostError('')

    if (!companyPostDraft.title.trim() || !companyPostDraft.content.trim()) {
      setRepostError('Post title and content are required.')
      return
    }

    setPublishLoading(true)
    try {
      if (isSupabaseConfigured) {
        const created = await repostService.createCompanyMainPost({
          title: companyPostDraft.title,
          content: companyPostDraft.content,
          channels: companyPostDraft.channels,
          companyKey: tenantCompanyKey,
        })
        setCompanyMainPosts((prev) => [created, ...prev])
      } else {
        setCompanyMainPosts((prev) => [
          {
            id: nextLocalId('corp_post'),
            companyName: session?.user_metadata?.company || 'Your Company',
            title: companyPostDraft.title.trim(),
            content: companyPostDraft.content.trim(),
            channels: companyPostDraft.channels.length ? companyPostDraft.channels : ['instagram'],
            publishedAt: new Date().toISOString(),
          },
          ...prev,
        ])
      }

      setCompanyPostDraft({
        title: '',
        content: '',
        channels: ['instagram'],
      })
      setRepostNotice('Company main post published successfully.')
    } catch (error) {
      setRepostError(error.message)
    } finally {
      setPublishLoading(false)
    }
  }

  const handleAddCompanySocialAccount = async (event) => {
    event.preventDefault()
    setRepostNotice('')
    setRepostError('')

    if (!companyAccountDraft.platform.trim() || !companyAccountDraft.accountName.trim()) {
      setRepostError('Platform and account name are required.')
      return
    }

    setPublishLoading(true)
    try {
      if (isSupabaseConfigured) {
        const created = await repostService.createCompanySocialAccount({
          platform: companyAccountDraft.platform,
          accountName: companyAccountDraft.accountName,
          companyKey: tenantCompanyKey,
        })
        setCompanySocialAccounts((prev) => [created, ...prev])
      } else {
        setCompanySocialAccounts((prev) => [
          {
            id: nextLocalId('corp_acc'),
            companyName: session?.user_metadata?.company || 'Your Company',
            platform: companyAccountDraft.platform.trim(),
            accountName: companyAccountDraft.accountName.trim(),
          },
          ...prev,
        ])
      }

      setCompanyAccountDraft({
        platform: '',
        accountName: '',
      })
      setRepostNotice('Company social account added.')
    } catch (error) {
      setRepostError(error.message)
    } finally {
      setPublishLoading(false)
    }
  }

  const handleBroadcastCompanyPost = async (postId) => {
    setRepostNotice('')
    setRepostError('')
    setBroadcastingPostId(postId)

    try {
      if (isSupabaseConfigured) {
        const queuedCount = await repostService.broadcastCompanyPost({
          companyPostId: postId,
        })
        setRepostNotice(`Broadcast queued for ${queuedCount} team member(s).`)
      } else {
        setRepostNotice('Broadcast simulation complete in demo mode.')
      }
    } catch (error) {
      setRepostError(error.message)
    } finally {
      setBroadcastingPostId('')
    }
  }

  const handleToggleUserAccess = async (member) => {
    setAdminError('')
    setAdminLoading(true)

    try {
      const nextStatus = member.accessStatus === 'deactivated' ? 'active' : 'deactivated'
      const updatedMember = await authService.updateUserAccessStatus({
        userId: member.id,
        accessStatus: nextStatus,
      })

      setTeamMembers((prev) =>
        prev.map((item) => (item.id === updatedMember.id ? { ...item, ...updatedMember } : item)),
      )

      if (session?.id === updatedMember.id && nextStatus === 'deactivated') {
        await authService.signOut()
        setSession(null)
      }
    } catch (error) {
      setAdminError(error.message)
    } finally {
      setAdminLoading(false)
    }
  }

  const handleOpenBillingPortal = async () => {
    setBillingPortalError('')
    setBillingPortalLoading(true)

    try {
      await billingService.openBillingPortal()
    } catch (error) {
      setBillingPortalError(error.message)
      setBillingPortalLoading(false)
    }
  }

  const handleDeactivateAccount = async () => {
    if (!window.confirm('Deactivate your account? You will be signed out and can contact support to restore access.')) return
    setAccountActionError('')
    setAccountActionLoading(true)
    try {
      await authService.deactivateMyAccount()
      await signOut()
    } catch (error) {
      setAccountActionError(error.message)
      setAccountActionLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!window.confirm('Permanently delete your account and associated data? This cannot be undone.')) return
    setAccountActionError('')
    setAccountActionLoading(true)
    try {
      await authService.deleteMyAccount()
      setSession(null)
      setAuthView('landing')
    } catch (error) {
      setAccountActionError(error.message)
      setAccountActionLoading(false)
    }
  }

  const handleLoadReferral = async () => {
    setBillingPortalError('')

    try {
      setReferralSummary(await billingService.getReferralSummary())
    } catch (error) {
      setBillingPortalError(error.message)
    }
  }

  const handleCopyReferralLink = async () => {
    const link = billingService.referralLink(referralSummary?.code)
    if (!link) return

    try {
      await navigator.clipboard.writeText(link)
      setReferralCopied(true)
      setTimeout(() => setReferralCopied(false), 2000)
    } catch {
      setBillingPortalError('Copy failed — select the link and copy it manually.')
    }
  }

  // Continuously enforce billing entitlement. If a renewal fails or a plan
  // lapses while someone is signed in, their session ends without intervention.
  useEffect(() => {
    if (!isSupabaseConfigured || !session?.id) return undefined

    let cancelled = false

    const enforceEntitlement = async () => {
      // Staff run the site itself and are never billed, so entitlement never gates them.
      if (isStaffRole(session?.role)) return

      let entitlement
      try {
        entitlement = await billingService.getMyEntitlement()
      } catch {
        // A transient network failure must never lock a paying customer out.
        return
      }

      if (cancelled) return
      setMyEntitlement(entitlement)

      if (entitlement?.entitled !== false) return

      await authService.signOut()
      if (cancelled) return
      setSession(null)
      setAuthError('Your subscription is no longer active. Renew to restore access.')
    }
    enforceEntitlement()
    const timer = setInterval(enforceEntitlement, 5 * 60 * 1000)
    window.addEventListener('focus', enforceEntitlement)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('focus', enforceEntitlement)
    }
  }, [session?.id, session?.role])

  const signOut = async () => {
    await authService.signOut()
    setSession(null)
    setActiveTab('dashboard')
    setSupportModalOpen(false)
    // Wipe all per-user state so the next user starts with a clean slate
    setScheduledPosts([])
    setConnectedAccounts([])
    setCompanyMainPosts([])
    setCompanySocialAccounts([])
    setRepostQueue([])
    setUserReposts([])
    setWorkspaceFolders([])
    setWorkspaceAssets([])
    setComposer({ campaign: '', message: '', imageIdea: '', scheduledAt: '', channels: [], mediaAssetIds: [] })
    setAiSuggestions([])
    setAiAgentConfig(createDefaultAiAgentConfig())
    setAiAgentDraft(createDefaultAiAgentConfig())
  }

  const isResetPasswordRoute = typeof window !== 'undefined' && window.location.pathname === '/reset-password'

  if (isResetPasswordRoute) {
    return (
      <div className="auth-page">
        <header className="auth-header">
          <button type="button" className="text-button" onClick={() => setAuthView('signin')}>
            ← Back to sign in
          </button>
        </header>

        <section className="auth-panel">
          <h1>Set a new password</h1>
          <p>Choose a new password for your account.</p>

          <form className="auth-form" onSubmit={handleResetPasswordSubmit}>
            <label>
              New password
              <input
                type="password"
                value={resetPassword.newPassword}
                onChange={(event) => setResetPassword((prev) => ({ ...prev, newPassword: event.target.value }))}
                placeholder="••••••••"
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                value={resetPassword.confirmPassword}
                onChange={(event) => setResetPassword((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                placeholder="••••••••"
              />
            </label>
            <button type="submit" disabled={resetPasswordLoading}>
              {resetPasswordLoading ? 'Updating...' : 'Update password'}
            </button>
          </form>

          {authError && <p className="auth-message auth-error">{authError}</p>}
          {authNotice && <p className="auth-message">{authNotice}</p>}
        </section>
      </div>
    )
  }

  if (sessionRestoring) {
    return loadingPanel
  }

  if (!session) {
    if (showPurchase) {
      return (
        <Suspense fallback={loadingPanel}>
          <PurchasePage
            initialPlan={purchasePlan}
            validatePromoCode={validatePromoCode}
            referralCode={incomingReferralCode}
            billingLive={isSupabaseConfigured}
            onBack={(nextView) => {
              setShowPurchase(false)
              if (nextView === 'signup' || nextView === 'signin') {
                setAuthView(nextView)
              }
            }}
            onSubmit={async (order) => {
              const isPromo = Boolean(order.promoCode)

              // Live mode: activation and revocation are driven entirely by the
              // payment provider webhook and the database, never by an operator.
              if (isSupabaseConfigured) {
                if (isPromo) {
                  await billingService.redeemPromoCode({
                    code: order.promoCode,
                    email: order.email,
                  })
                  return { redirected: false }
                }

                await billingService.startCheckout({
                  plan: order.plan,
                  billingInterval: order.billingInterval,
                  email: order.email,
                  fullName: order.fullName,
                  referralCode: incomingReferralCode,
                })
                return { redirected: true }
              }

              // Demo mode mirrors the live behaviour: paid or redeemed means active immediately.
              const periodDays = !isPromo && order.billingInterval === 'annual' ? 365 : 30
              const expiresAt = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000).toISOString()
              const newLicense = {
                id: `lic-${Date.now()}`,
                userId: `pending-${Date.now()}`,
                userEmail: order.email,
                userFullName: order.fullName,
                plan: isPromo ? 'standard' : order.plan,
                planLabel: getPlan(isPromo ? 'standard' : order.plan).label,
                billingInterval: isPromo ? 'monthly' : order.billingInterval,
                priceUsd: isPromo ? 0 : order.priceUsd,
                storageLimitGb: isPromo ? 2 : order.storageLimitGb,
                status: 'active',
                purchasedAt: new Date().toISOString(),
                expiresAt,
                paymentConfirmed: true,
                notes: isPromo ? `Promo: ${order.promoCode}` : `Ref: ${order.licenseRef}`,
              }
              setLicenses((prev) => [newLicense, ...prev])
              setPurchaseHistory((prev) => [{
                id: `pmt-${Date.now()}`,
                licenseId: newLicense.id,
                userEmail: order.email,
                userFullName: order.fullName,
                plan: newLicense.plan,
                amountUsd: newLicense.priceUsd,
                method: isPromo ? `Promo (${order.promoCode})` : 'Card',
                status: 'confirmed',
                paidAt: new Date().toISOString(),
              }, ...prev])
              if (isPromo) {
                setPromoCodes((prev) => prev.map((c) =>
                  c.code.toUpperCase() === order.promoCode.toUpperCase()
                    ? { ...c, usedCount: c.usedCount + 1, usedBy: [...c.usedBy, order.email] }
                    : c,
                ))
              }

              return { redirected: false }
            }}
          />
        </Suspense>
      )
    }

    if (authView === 'landing' && checkoutReturn !== 'success') {
      return (
        <Suspense fallback={loadingPanel}>
          <LandingPage
            announcement={announcements.landing}
            onSignIn={() => setAuthView('signin')}
            onCompanyPackageRequest={() => setCompanyPackageRequested(false)}
            onPurchase={(planKey) => {
              if (planKey) setPurchasePlan(planKey)
              setShowPurchase(true)
            }}
          >
            <CompanyPackageRequest
              onSubmit={handleCompanyPackageRequest}
              submitted={companyPackageRequested}
            />
          </LandingPage>
        </Suspense>
      )
    }

    return (
      <div className="auth-page">
        <header className="auth-header">
          <button type="button" className="text-button" onClick={() => setAuthView('landing')}>
            ← EchoAI
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setAuthView(authView === 'signin' ? 'signup' : 'signin')}
          >
            {authView === 'signin' ? 'Create account' : 'Sign in'}
          </button>
        </header>

        <section className="auth-panel">
          {checkoutReturn === 'success' && (
            <div className="promo-applied" style={{ marginBottom: '1rem' }}>
              <span>
                ✓ Payment received. Create your login below using the <strong>same email</strong> you
                paid with — your plan is already attached to that address.
              </span>
            </div>
          )}
          {checkoutReturn === 'cancelled' && (
            <div className="promo-applied" style={{ marginBottom: '1rem' }}>
              <span>Checkout was cancelled. Nothing was charged.</span>
            </div>
          )}

          <h1>AI social media agents that plan and publish for you</h1>
          <p>
            Connect your channels, queue posts by day and time, and automate reminders,
            offers, and updates from one dashboard.
          </p>

          <div className="chip-row">
            {postTypeChips.map((chip) => (
              <span key={chip} className="chip">
                {chip}
              </span>
            ))}
          </div>

          {mfaPending ? (
            recoveryMode ? (
              <form className="auth-form" onSubmit={handleRecoverWithBackupCode}>
                <h2>Use a recovery code</h2>
                <p>
                  Lost your authenticator? Enter your password and one unused recovery code. We&apos;ll
                  remove the old device so you can set up a new one.
                </p>
                <label>
                  Password
                  <input
                    type="password"
                    value={authState.password}
                    onChange={(event) => handleAuthChange('password', event.target.value)}
                    autoComplete="current-password"
                  />
                </label>
                <label>
                  Recovery code
                  <input
                    type="text"
                    value={recoveryCodeInput}
                    onChange={(event) => setRecoveryCodeInput(event.target.value.toUpperCase())}
                    placeholder="A1B2C3D4E5"
                    autoComplete="one-time-code"
                  />
                </label>
                <button type="submit" disabled={authLoading}>
                  {authLoading ? 'Checking...' : 'Reset my authenticator'}
                </button>
                <button type="button" className="text-button" onClick={() => setRecoveryMode(false)}>
                  ← Back to code entry
                </button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={handleVerifyMfa}>
                <h2>Two-factor verification</h2>
                <p>Open your authenticator app and enter the current 6-digit code for {pendingEmail}.</p>
                <label>
                  Authentication code
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={authState.otpCode}
                    onChange={(event) => handleAuthChange('otpCode', event.target.value)}
                    placeholder="123456"
                  />
                </label>
                <button type="submit" disabled={authLoading}>
                  {authLoading ? 'Verifying...' : 'Verify and continue'}
                </button>
                <button type="button" className="text-button" onClick={() => setRecoveryMode(true)}>
                  Lost your device? Use a recovery code
                </button>
              </form>
            )
          ) : (
            <>
              {authView === 'signin' && (
                <form className="auth-form" onSubmit={handleSignIn}>
                  <h2>Sign in</h2>
                  <label>
                    Email
                    <input
                      type="email"
                      value={authState.email}
                      onChange={(event) => handleAuthChange('email', event.target.value)}
                      placeholder="you@company.com"
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={authState.password}
                      onChange={(event) => handleAuthChange('password', event.target.value)}
                      placeholder="••••••••"
                    />
                  </label>
                  <button type="submit" disabled={authLoading}>
                    {authLoading ? 'Signing in...' : 'Login'}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setAuthView('forgot')}
                  >
                    Forgot password?
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setShowPurchase(true)}
                  >
                    Don&apos;t have access? Purchase a license →
                  </button>
                </form>
              )}

              {authView === 'signup' && (
                <form className="auth-form" onSubmit={handleSignUp}>
                  <h2>Create account</h2>
                  <label>
                    Full name
                    <input
                      type="text"
                      value={authState.fullName}
                      onChange={(event) => handleAuthChange('fullName', event.target.value)}
                      placeholder="Alex Rivera"
                    />
                  </label>
                  <label>
                    Company
                    <input
                      type="text"
                      value={authState.company}
                      onChange={(event) => handleAuthChange('company', event.target.value)}
                      placeholder="EchoAI Media"
                    />
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={authState.email}
                      onChange={(event) => handleAuthChange('email', event.target.value)}
                      placeholder="you@company.com"
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={authState.password}
                      onChange={(event) => handleAuthChange('password', event.target.value)}
                      placeholder="••••••••"
                    />
                  </label>
                  <button type="submit" disabled={authLoading}>
                    {authLoading ? 'Creating account...' : 'Create account'}
                  </button>
                </form>
              )}

              {authView === 'forgot' && (
                <form className="auth-form" onSubmit={handlePasswordReset}>
                  <h2>Password reset</h2>
                  <label>
                    Email
                    <input
                      type="email"
                      value={authState.email}
                      onChange={(event) => handleAuthChange('email', event.target.value)}
                      placeholder="you@company.com"
                    />
                  </label>
                  <button type="submit" disabled={authLoading}>
                    {authLoading ? 'Sending...' : 'Send reset link'}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setAuthView('signin')}
                  >
                    Back to login
                  </button>
                </form>
              )}
            </>
          )}

          {authError && <p className="auth-message auth-error">{authError}</p>}
          {authNotice && <p className="auth-message">{authNotice}</p>}
        </section>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <AnnouncementBanner
        key={announcements.application.updatedAt}
        notice={announcements.application}
        audience="application"
        dismissalScope={session.id}
      />
      <Suspense fallback={null}>
        <CalendarPopout
          open={calendarOpen}
          onClose={() => setCalendarOpen(false)}
          scheduledPosts={scheduledPosts}
          googleEvents={googleEvents}
          calendars={googleCalendars}
          selectedCalendarId={selectedCalendarId}
          onSelectCalendar={handleSelectCalendar}
          connected={isGoogleConnected}
          onConnect={() => cloudDriveService.connect('google').catch((error) => setCalendarError(error.message))}
          syncEnabled={calendarSyncEnabled}
          onToggleSync={handleToggleCalendarSync}
          loading={calendarLoading}
          error={calendarError}
          onMonthChange={loadCalendarMonth}
        />
      </Suspense>

      {mfaEnrollOpen && (
        <div className="modal-overlay">
          <div className="modal-panel" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            {mfaRecoveryCodes.length > 0 ? (
              <>
                <h2>Save your recovery codes</h2>
                <p className="panel-note">
                  These are shown once. Store them somewhere safe — each one gets you back in if you
                  lose your phone.
                </p>
                <div className="chip-row" style={{ margin: '1rem 0' }}>
                  {mfaRecoveryCodes.map((code) => (
                    <span key={code} className="chip" style={{ fontFamily: 'monospace' }}>{code}</span>
                  ))}
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => navigator.clipboard?.writeText(mfaRecoveryCodes.join('\n'))}
                >
                  Copy all
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setMfaRecoveryCodes([])
                    setMfaEnrollOpen(false)
                  }}
                >
                  I&apos;ve saved them
                </button>
              </>
            ) : mfaEnrollment ? (
              <form onSubmit={handleConfirmMfaEnrollment}>
                <h2>Set up your authenticator</h2>
                <p className="panel-note">
                  Scan this with Google Authenticator, 1Password, Authy, or any TOTP app, then enter
                  the 6-digit code it shows.
                </p>
                {mfaEnrollment.qrCode && (
                  <img
                    src={mfaEnrollment.qrCode}
                    alt="Authenticator QR code"
                    style={{ width: 200, height: 200, background: '#fff', borderRadius: 12, margin: '1rem 0' }}
                  />
                )}
                <p className="muted" style={{ overflowWrap: 'anywhere' }}>
                  Can&apos;t scan? Enter this key manually: <strong>{mfaEnrollment.secret}</strong>
                </p>
                <label>
                  6-digit code
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={mfaEnrollCode}
                    onChange={(event) => setMfaEnrollCode(event.target.value)}
                    placeholder="123456"
                  />
                </label>
                {mfaError && <span className="field-error">{mfaError}</span>}
                <button type="submit" className="primary-button" disabled={mfaBusy}>
                  {mfaBusy ? 'Verifying...' : 'Turn on two-factor'}
                </button>
                <button type="button" className="text-button" onClick={() => setMfaEnrollOpen(false)}>
                  Later
                </button>
              </form>
            ) : (
              <>
                <h2>Protect your account</h2>
                <p className="panel-note">
                  Two-factor authentication adds a 6-digit code from your phone on top of your
                  password. Works with Google Authenticator and any other TOTP app.
                </p>
                {mfaError && <span className="field-error">{mfaError}</span>}
                <button
                  type="button"
                  className="primary-button"
                  disabled={mfaBusy}
                  onClick={handleStartMfaEnrollment}
                >
                  {mfaBusy ? 'Preparing...' : 'Set up two-factor'}
                </button>
                <button type="button" className="text-button" onClick={() => setMfaEnrollOpen(false)}>
                  Not now
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {contactCardOpen && contactCardDraft && (
        <div className="modal-overlay">
          <div className="modal-panel contact-card-panel">
            <h2>Your contact card</h2>
            <p className="panel-note">
              Teammates see this instead of just your email address. Everything except your name is
              optional.
            </p>

            <form className="contact-card-form" onSubmit={handleSaveContactCard}>
              <label>
                Full name
                <input
                  type="text"
                  value={contactCardDraft.fullName}
                  onChange={(event) => handleContactCardChange('fullName', event.target.value)}
                  placeholder="Alex Rivera"
                />
              </label>
              <label>
                Email
                <input type="email" value={contactCardDraft.email} disabled />
              </label>
              <label>
                Job title
                <input
                  type="text"
                  value={contactCardDraft.jobTitle}
                  onChange={(event) => handleContactCardChange('jobTitle', event.target.value)}
                  placeholder="Marketing Manager"
                />
              </label>
              <label>
                Company
                <input
                  type="text"
                  value={contactCardDraft.company}
                  onChange={(event) => handleContactCardChange('company', event.target.value)}
                  placeholder="EchoAI Media"
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  value={contactCardDraft.phone}
                  onChange={(event) => handleContactCardChange('phone', event.target.value)}
                  placeholder="(555) 123-4567"
                />
              </label>
              <label>
                Calendar link
                <input
                  type="url"
                  value={contactCardDraft.calendarUrl}
                  onChange={(event) => handleContactCardChange('calendarUrl', event.target.value)}
                  placeholder="https://calendar.google.com/..."
                />
              </label>
              <label className="contact-card-wide">
                Address
                <input
                  type="text"
                  value={contactCardDraft.addressLine1}
                  onChange={(event) => handleContactCardChange('addressLine1', event.target.value)}
                  placeholder="123 Main St"
                />
              </label>
              <label className="contact-card-wide">
                Address line 2
                <input
                  type="text"
                  value={contactCardDraft.addressLine2}
                  onChange={(event) => handleContactCardChange('addressLine2', event.target.value)}
                  placeholder="Suite 400"
                />
              </label>
              <label>
                City
                <input
                  type="text"
                  value={contactCardDraft.city}
                  onChange={(event) => handleContactCardChange('city', event.target.value)}
                />
              </label>
              <label>
                State / region
                <input
                  type="text"
                  value={contactCardDraft.stateRegion}
                  onChange={(event) => handleContactCardChange('stateRegion', event.target.value)}
                />
              </label>
              <label>
                Postal code
                <input
                  type="text"
                  value={contactCardDraft.postalCode}
                  onChange={(event) => handleContactCardChange('postalCode', event.target.value)}
                />
              </label>
              <label>
                Country
                <input
                  type="text"
                  value={contactCardDraft.country}
                  onChange={(event) => handleContactCardChange('country', event.target.value)}
                />
              </label>

              {contactCardError && <span className="field-error contact-card-wide">{contactCardError}</span>}
              {contactCardNotice && <p className="panel-note contact-card-wide">{contactCardNotice}</p>}

              <div className="contact-card-actions contact-card-wide">
                <button type="submit" className="primary-button" disabled={contactCardSaving}>
                  {contactCardSaving ? 'Saving...' : 'Save contact card'}
                </button>
                <button type="button" className="text-button" onClick={() => setContactCardOpen(false)}>
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <header className="top-bar">
        <div className="app-brand-heading">
          <img src={echoMascot} alt="EchoAI mascot" />
          <div>
          <p className="brand">EchoAI</p>
          <h1>Campaign command center</h1>
          </div>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className="icon-button"
            onClick={() => setCalendarOpen((open) => !open)}
            title="Open calendar"
            aria-label="Open calendar"
            aria-expanded={calendarOpen}
          >
            <span aria-hidden="true">📅</span>
          </button>
          <button
            type="button"
            className="contact-chip"
            onClick={openContactCard}
            title="View and edit your contact card"
          >
            <span className="contact-chip-avatar" aria-hidden="true">
              {(contactCard?.fullName || session?.email || '?').trim().charAt(0).toUpperCase()}
            </span>
            <span className="contact-chip-text">
              <strong>{contactCard?.fullName || session?.email}</strong>
              <small>{contactCard?.jobTitle || contactCard?.company || session?.email}</small>
            </span>
          </button>
          <button type="button" className="ghost-button" onClick={openSupportModal}>
            Contact support
          </button>
          <button type="button" className="primary-button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="main-nav">
        {[
          ['dashboard', 'Dashboard'],
          ['listening', 'Social Listening'],
          ['repost', 'Repost Hub'],
          ['scheduler', 'Scheduler'],
          ['assistant', 'Create'],
          ['photo', 'Photo Creator'],
          ['studio', 'Video Studio'],
          ['integrations', 'Integrations'],
          ['account', 'Manage account'],
          ['help', 'How To'],
          ...(canViewManagementBoard ? [['admin', 'IT / Management']] : []),
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={activeTab === key ? 'nav-link active' : 'nav-link'}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className={`app-main ${activeTab === 'photo' ? 'photo-workspace-layout' : ''} ${activeTab === 'help' ? 'help-workspace-layout' : ''} ${isAssetPanelOpen ? '' : 'asset-drawer-collapsed'}`}>
        {activeTab !== 'help' && (
        <aside
          className={`asset-drawer ${activeTab === 'photo' ? 'photo-workspace-drawer' : ''} ${isAssetPanelOpen ? 'open' : 'collapsed'} ${drawerDragActive ? 'drag-active' : ''}`}
          onDragEnter={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); e.stopPropagation(); setDrawerDragActive(true) } }}
          onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy' } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrawerDragActive(false) }}
          onDrop={handleAssetFileDrop}
        >
          {drawerDragActive && (
            <div className="drawer-drop-overlay">
              <span>📂 Drop to upload</span>
            </div>
          )}
          <div className="asset-drawer-header">
            <div>
              <p className="small-title">Workspace</p>
              <h3>Media library</h3>
            </div>
            <button
              type="button"
              className="asset-drawer-toggle"
              onClick={() => setIsAssetPanelOpen((prev) => !prev)}
              title={isAssetPanelOpen ? 'Collapse media library' : 'Expand media library'}
              aria-label={isAssetPanelOpen ? 'Collapse media library' : 'Expand media library'}
              aria-expanded={isAssetPanelOpen}
            >
              {isAssetPanelOpen ? '<' : '>'}
            </button>
          </div>

          {isAssetPanelOpen && (
            <>
              <form className="composer" onSubmit={handleCreateFolder}>
                <label>
                  New folder
                  <input
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    placeholder="Campaign assets"
                  />
                </label>
                <button type="submit" className="primary-button">Create folder</button>
              </form>

              <label className="asset-upload-label asset-upload-chip">
                <span>Upload media</span>
                <input type="file" onChange={handleUploadAsset} />
              </label>

              <div className="folder-breadcrumbs">
                {folderBreadcrumbs.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    className="chip"
                    onClick={() => setSelectedFolderId(folder.id)}
                  >
                    {folder.name}
                  </button>
                ))}
              </div>

              <label>
                Search assets
                <input
                  value={assetSearch}
                  onChange={(event) => setAssetSearch(event.target.value)}
                  placeholder="Find video, image, PDF"
                />
              </label>

              <div className="asset-usage-banner">
                <strong>Quota</strong>
                <span>{storageUsedMb.toFixed(1)} MB / {storageQuotaMb} MB used</span>
              </div>

              <div className="cloud-drive-panel">
                <strong>Cloud drives</strong>
                <p className="muted">
                  Browse and link files without using your quota — they stay in your own drive.
                </p>

                <div className="chip-row">
                  {Object.values(CLOUD_PROVIDERS).map((provider) => {
                    const connection = cloudConnections.find((entry) => entry.provider === provider.key)
                    return connection ? (
                      <button
                        key={provider.key}
                        type="button"
                        className={cloudProvider === provider.key ? 'chip active' : 'chip'}
                        title={connection.accountEmail}
                        onClick={() => browseCloud({ provider: provider.key })}
                      >
                        {provider.icon} {provider.label}
                      </button>
                    ) : (
                      <button
                        key={provider.key}
                        type="button"
                        className="chip"
                        disabled={!isSupabaseConfigured}
                        onClick={() => cloudDriveService.connect(provider.key).catch((error) => setCloudError(error.message))}
                      >
                        + Connect {provider.label}
                      </button>
                    )
                  })}
                </div>

                {cloudProvider && (
                  <>
                    <div className="chip-row">
                      <button
                        type="button"
                        className="chip"
                        onClick={() => browseCloud({ provider: cloudProvider })}
                      >
                        ← Top level
                      </button>
                      {cloudPath.map((crumb) => (
                        <span key={`${crumb.id}-${crumb.label}`} className="chip">{crumb.label}</span>
                      ))}
                      <button
                        type="button"
                        className="chip"
                        onClick={() => handleDisconnectCloud(cloudProvider)}
                      >
                        Disconnect
                      </button>
                    </div>

                    <label>
                      Search this drive
                      <input
                        value={cloudSearch}
                        onChange={(event) => setCloudSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            browseCloud({ provider: cloudProvider, search: cloudSearch })
                          }
                        }}
                        placeholder="Press Enter to search"
                      />
                    </label>

                    {cloudBusy && <p className="muted">Loading…</p>}

                    <div className="asset-list">
                      {cloudItems.map((item) => (
                        <div key={item.id} className="asset-card">
                          <div className="asset-card-main">
                            <span>{item.isFolder ? '📁' : '📄'} {item.name}</span>
                            {!item.isFolder && (
                              <small className="muted">
                                {(item.size / 1024 / 1024).toFixed(1)} MB • no quota used
                              </small>
                            )}
                          </div>
                          {item.isFolder ? (
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() =>
                                browseCloud({
                                  provider: cloudProvider,
                                  folderId: item.id,
                                  label: item.name,
                                })
                              }
                            >
                              Open
                            </button>
                          ) : (
                            <button type="button" className="ghost-button" onClick={() => linkCloudFile(item)}>
                              Link
                            </button>
                          )}
                        </div>
                      ))}
                      {!cloudBusy && cloudItems.length === 0 && (
                        <p className="muted">Nothing here.</p>
                      )}
                    </div>
                  </>
                )}

                {cloudError && <span className="field-error">{cloudError}</span>}
              </div>

              <div className="asset-list">
                {workspaceFolders
                  .filter((folder) => folder.parentId === selectedFolderId)
                  .sort((left, right) => Number(Boolean(right.system)) - Number(Boolean(left.system)))
                  .map((folder) => (
                    <div key={folder.id} className={`asset-card ${folder.system ? 'ai-generations-folder' : ''}`}>
                      {editingItem?.type === 'folder' && editingItem?.id === folder.id ? (
                        <div className="asset-edit-row">
                          <input
                            value={editingName}
                            onChange={(event) => setEditingName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                saveRenameItem()
                              }
                            }}
                          />
                          <div className="asset-actions">
                            <button type="button" className="asset-action-button" onClick={saveRenameItem}>Save</button>
                            <button type="button" className="asset-action-button" onClick={() => setEditingItem(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button type="button" className="asset-card-main" onClick={() => setSelectedFolderId(folder.id)}>
                            <strong>{folder.system ? '✨' : '📁'} {folder.name}</strong>
                            <span>{folder.system ? 'Generated images and creative history' : 'Subfolder'}</span>
                          </button>
                          <div className="asset-actions">
                            <button type="button" className="asset-action-button" onClick={() => startRenameItem('folder', folder.id, folder.name)}>Rename</button>
                            <button type="button" className="asset-action-button" onClick={() => deleteFolder(folder.id)}>Delete</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                {filteredAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="asset-card"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('assetId', asset.id)
                      handleAssetDragStart(asset.id)
                    }}
                  >
                    {editingItem?.type === 'asset' && editingItem?.id === asset.id ? (
                      <div className="asset-edit-row">
                        <input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              saveRenameItem()
                            }
                          }}
                        />
                        <div className="asset-actions">
                          <button type="button" className="asset-action-button" onClick={saveRenameItem}>Save</button>
                          <button type="button" className="asset-action-button" onClick={() => setEditingItem(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="asset-card-main">
                          <strong>{asset.type === 'video' ? '🎬' : asset.type === 'image' ? '🖼️' : '📄'} {asset.name}</strong>
                          <span>{asset.summary}</span>
                          <small>
                            {asset.type} • {(asset.size / 1024 / 1024).toFixed(1)} MB
                            {asset.linked && (
                              <>
                                {' '}
                                <span className="asset-linked-badge">
                                  Linked · {CLOUD_PROVIDERS[asset.provider]?.label ?? 'cloud'} · no quota
                                </span>
                              </>
                            )}
                          </small>
                        </div>
                        <div className="asset-actions">
                          {asset.type === 'image' && (
                            <button
                              type="button"
                              className="asset-action-button"
                              onClick={() => {
                                setCreativeProject(asset.projectMetadata
                                  ? { ...asset.projectMetadata, imageSrc: asset.projectMetadata.imageSrc || asset.previewUrl, outputType: asset.projectMetadata.outputType || 'image' }
                                  : { imageSrc: asset.previewUrl, outputType: 'image', headline: '', caption: '', visualPrompt: asset.summary || '' })
                                setActiveTab('photo')
                              }}
                            >
                              Edit
                            </button>
                          )}
                          <button type="button" className="asset-action-button" onClick={() => startRenameItem('asset', asset.id, asset.name)}>Rename</button>
                          <button type="button" className="asset-action-button" onClick={() => deleteAsset(asset.id)}>Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
        )}

        {activeTab === 'dashboard' && (
          <section className="panel panel-dashboard">
            <h2>Overview</h2>
            <p className="panel-note">
              Build morning campaigns once, then deploy automatically throughout the day.
            </p>

            <div className="stats-grid">
              {stats.map((item) => (
                <article key={item.label} className="stat-card">
                  <p>{item.label}</p>
                  <h3>{item.value}</h3>
                </article>
              ))}
              <article className="stat-card">
                <p>Company post alerts</p>
                <h3>{pendingRepostCount}</h3>
              </article>
            </div>

            <div className="split">
              <article className="sub-panel tone-ocean">
                <h3>Connected channels</h3>
                <div className="platform-cards">
                  {connectedAccounts.map((account) => {
                    const meta = getPlatformMeta(account.platform)
                    return (
                      <div
                        key={account.id}
                        className="platform-card"
                        style={{ borderColor: meta.border, background: meta.bg }}
                      >
                        <span className="platform-icon" style={{ color: meta.color }}>{meta.icon}</span>
                        <div className="platform-card-info">
                          <strong style={{ color: meta.color }}>{meta.label}</strong>
                          <span>{account.accountName}</span>
                        </div>
                        <span className={getStatusBadgeClass(account.status)} style={{ flexShrink: 0 }}>
                          {account.status}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </article>

              <article className="sub-panel tone-sun">
                <h3>Quick actions</h3>
                <div className="action-row">
                  <button type="button" className="primary-button" onClick={() => setActiveTab('photo')}>
                    Open photo creator
                  </button>
                  <button type="button" className="primary-button" onClick={() => setActiveTab('studio')}>
                    Open video studio
                  </button>
                  <button type="button" className="ghost-button" onClick={() => setActiveTab('scheduler')}>
                    Open scheduler
                  </button>
                </div>
                {canViewManagementBoard && (
                  <div className="action-row" style={{ marginTop: '0.6rem' }}>
                    <button type="button" className="ghost-button" onClick={() => setActiveTab('admin')}>
                      Open IT panel
                    </button>
                  </div>
                )}
                <h3 style={{ marginTop: '1rem' }}>Upcoming queue</h3>
                {scheduledPosts.slice(0, 4).map((post) => (
                  <div key={post.id} className="list-row">
                    <div>
                      <p>{post.campaign}</p>
                      <span>{post.channels.join(', ')}</span>
                    </div>
                    <span>{new Date(post.scheduledAt).toLocaleString()}</span>
                  </div>
                ))}
              </article>
            </div>
          </section>
        )}

        {activeTab === 'listening' && (
          <Suspense fallback={loadingPanel}>
            <SocialListeningPanel
              connectedAccounts={connectedAccounts}
              aiAgentConfig={aiAgentConfig}
              onCreateResponseDraft={(mention) => {
                const signal = mention.text.length > 180 ? `${mention.text.slice(0, 177)}...` : mention.text
                setComposer({
                  campaign: `Response to ${mention.keyword || mention.hashtag || mention.platform} conversation`,
                  message: `Thanks for sharing this, ${mention.author}. ${signal}`,
                  imageIdea: `Create a helpful social response visual addressing ${mention.keyword || 'this customer conversation'}.`,
                  scheduledAt: '',
                  channels: [],
                  mediaAssetIds: [],
                })
                setActiveTab('scheduler')
              }}
              onCreateCampaignDraft={(mention) => {
                setAiInput(`Create a sales and marketing campaign inspired by this public ${mention.sourceType} signal: "${mention.text}". Focus on the demand, audience need, trigger terms, and a useful offer. Do not copy the original post verbatim.`)
                setActiveTab('assistant')
              }}
            />
          </Suspense>
        )}

        {activeTab === 'repost' && (
          <section className="panel panel-repost">
            <h2>Company Repost Center</h2>
            <p className="panel-note">
              Review company posts, approve or decline syndication, and auto-repost for non-technical users.
            </p>

            <article className="sub-panel tone-indigo">
              <div className="toggle-row">
                <div>
                  <h3>Auto approval for company posts</h3>
                  <p className="muted">
                    When enabled, new company posts are automatically rebranded and reposted.
                  </p>
                </div>
                <button
                  type="button"
                  className={autoApproveCompanyPosts ? 'primary-button' : 'ghost-button'}
                  onClick={handleToggleAutoApproval}
                >
                  {autoApproveCompanyPosts ? 'Auto approval: On' : 'Auto approval: Off'}
                </button>
              </div>
            </article>

            {isAdminUser && (
              <div className="split">
                <article className="sub-panel tone-sunrise">
                  <h3>Publish Company Main Post</h3>
                  <form className="composer" onSubmit={handlePublishCompanyPost}>
                    <label>
                      Post title
                      <input
                        type="text"
                        value={companyPostDraft.title}
                        onChange={(event) =>
                          setCompanyPostDraft((prev) => ({ ...prev, title: event.target.value }))
                        }
                        placeholder="Back-to-school flyer"
                      />
                    </label>

                    <label>
                      Post content
                      <textarea
                        rows="3"
                        value={companyPostDraft.content}
                        onChange={(event) =>
                          setCompanyPostDraft((prev) => ({ ...prev, content: event.target.value }))
                        }
                        placeholder="New sale information for all team members to repost."
                      />
                    </label>

                    <div>
                      <p className="small-title">Default channels</p>
                      <div className="chip-row">
                        {['instagram', 'facebook', 'tiktok', 'linkedin'].map((channel) => (
                          <button
                            key={channel}
                            type="button"
                            className={
                              companyPostDraft.channels.includes(channel) ? 'chip active' : 'chip'
                            }
                            onClick={() => toggleDraftChannel(channel)}
                          >
                            {channel}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button type="submit" className="primary-button" disabled={publishLoading}>
                      {publishLoading ? 'Publishing...' : 'Publish company post'}
                    </button>
                  </form>
                </article>

                <article className="sub-panel tone-ocean">
                  <h3>Add Company Social Account</h3>
                  <form className="composer" onSubmit={handleAddCompanySocialAccount}>
                    <label>
                      Platform
                      <input
                        type="text"
                        value={companyAccountDraft.platform}
                        onChange={(event) =>
                          setCompanyAccountDraft((prev) => ({
                            ...prev,
                            platform: event.target.value,
                          }))
                        }
                        placeholder="Instagram"
                      />
                    </label>

                    <label>
                      Account name
                      <input
                        type="text"
                        value={companyAccountDraft.accountName}
                        onChange={(event) =>
                          setCompanyAccountDraft((prev) => ({
                            ...prev,
                            accountName: event.target.value,
                          }))
                        }
                        placeholder="@nike"
                      />
                    </label>

                    <button type="submit" className="primary-button" disabled={publishLoading}>
                      {publishLoading ? 'Saving...' : 'Add social account'}
                    </button>
                  </form>
                </article>
              </div>
            )}

            {repostNotice && <p className="auth-message">{repostNotice}</p>}
            {repostError && <p className="auth-message auth-error">{repostError}</p>}

            <div className="split">
              <article className="sub-panel tone-violet">
                <h3>Company social accounts</h3>
                {companySocialAccounts.map((account) => (
                  <div key={account.id} className="list-row">
                    <div>
                      <p>{account.companyName}</p>
                      <span>
                        {account.platform} • {account.accountName}
                      </span>
                    </div>
                    <span className="badge info">main account</span>
                  </div>
                ))}
              </article>

              <article className="sub-panel tone-amber">
                <h3>Approval board</h3>
                <p className="muted text-pending">Pending notifications: {pendingRepostCount}</p>
                {repostQueue.length === 0 && (
                  <p className="muted">No company posts have been submitted yet.</p>
                )}

                {repostQueue.map((item) => {
                  const post = getCompanyPostById(item.companyPostId)
                  if (!post) {
                    return null
                  }

                  return (
                    <div key={item.id} className="list-row">
                      <div>
                        <p>{post.title}</p>
                        <span>
                          {post.companyName} • {post.channels.join(', ')}
                        </span>
                      </div>
                      <div className="queue-meta">
                        <span className={getStatusBadgeClass(item.status)}>{item.status}</span>
                        {item.status === 'pending' ? (
                          <div className="action-row">
                            <button
                              type="button"
                              className="primary-button"
                              onClick={() => handleRepostDecision(item.id, 'approved')}
                            >
                              Approve repost
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => handleRepostDecision(item.id, 'declined')}
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          <span>{item.decisionAt ? new Date(item.decisionAt).toLocaleString() : ''}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </article>
            </div>

            <article className="sub-panel tone-ocean">
              <h3>Company main page posts</h3>
              {companyMainPosts.map((post) => (
                <div key={post.id} className="list-row">
                  <div>
                    <p>{post.title}</p>
                    <span>{post.content}</span>
                    <small>
                      {post.companyName} • {new Date(post.publishedAt).toLocaleString()}
                    </small>
                  </div>
                  <div className="queue-meta">
                    <span>{post.channels.join(', ')}</span>
                    <div className="action-row">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => handleCopyCompanyPost(post)}
                      >
                        Copy post
                      </button>
                      {isAdminUser && (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleBroadcastCompanyPost(post.id)}
                          disabled={broadcastingPostId === post.id}
                        >
                          {broadcastingPostId === post.id ? 'Broadcasting...' : 'Broadcast to team'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => handleSendToApprovalBoard(post)}
                      >
                        {autoApproveCompanyPosts ? 'Auto repost now' : 'Send to approvals'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </article>

            <article className="sub-panel tone-mint">
              <h3>My repost history</h3>
              {userReposts.length === 0 && (
                <p className="muted">Approved company posts will appear here after reposting.</p>
              )}

              {userReposts.map((repost) => {
                const post = getCompanyPostById(repost.companyPostId)
                return (
                  <div key={repost.id} className="list-row">
                    <div>
                      <p>{post?.title || 'Company post'}</p>
                      <span>{repost.caption}</span>
                    </div>
                    <div className="queue-meta">
                      <span className={getStatusBadgeClass(repost.status)}>{repost.status}</span>
                      <span>{new Date(repost.postedAt).toLocaleString()}</span>
                    </div>
                  </div>
                )
              })}
            </article>
          </section>
        )}

        {activeTab === 'scheduler' && (
          <section className="panel panel-scheduler">
            <h2>Post Scheduler</h2>
            <p className="panel-note">
              Draft once and publish to every selected channel on your target date and time.
            </p>

            <form className="composer" onSubmit={handleSchedulePost}>
              <label>
                Campaign name
                <input
                  type="text"
                  value={composer.campaign}
                  onChange={(event) => handleComposerChange('campaign', event.target.value)}
                  placeholder="Summer sale highlights"
                />
              </label>

              <label>
                Message
                <textarea
                  rows="4"
                  value={composer.message}
                  onChange={(event) => handleComposerChange('message', event.target.value)}
                  placeholder="Tell followers what is launching and why it matters..."
                />
              </label>

              <label>
                Image brief
                <input
                  type="text"
                  value={composer.imageIdea}
                  onChange={(event) => handleComposerChange('imageIdea', event.target.value)}
                  placeholder="Product flat-lay with warm tones"
                />
              </label>

              <div>
                <p className="small-title">Photos and videos</p>
                <p className="muted">Attach media from your private workspace. Upload more from the Media library.</p>
                <div style={{ marginTop: '12px' }}>
                  <label className="field-label" htmlFor="scheduler-media-upload">Upload media</label>
                  <input
                    id="scheduler-media-upload"
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleUploadAsset}
                  />
                </div>
                <div className="chip-row">
                  {workspaceAssets.filter((asset) => ['image', 'video'].includes(asset.type)).map((asset) => {
                    const selected = composer.mediaAssetIds.includes(asset.id)
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        className={selected ? 'chip active' : 'chip'}
                        onClick={() => setComposer((prev) => ({
                          ...prev,
                          mediaAssetIds: selected
                            ? prev.mediaAssetIds.filter((id) => id !== asset.id)
                            : [...prev.mediaAssetIds, asset.id],
                        }))}
                      >
                        {asset.type === 'video' ? 'Video' : 'Image'}: {asset.name}
                      </button>
                    )
                  })}
                  {workspaceAssets.every((asset) => !['image', 'video'].includes(asset.type)) && (
                    <span className="muted">No media available yet.</span>
                  )}
                </div>
                {composer.mediaAssetIds.length > 0 && (
                  <div className="attached-media-list" aria-label="Media attached to this post">
                    {workspaceAssets
                      .filter((asset) => composer.mediaAssetIds.includes(asset.id))
                      .map((asset) => (
                        <div key={asset.id} className="attached-media-item">
                          <span>{asset.type === 'video' ? 'Video' : 'Image'}: {asset.name}</span>
                          <button
                            type="button"
                            className="attached-media-remove"
                            aria-label={`Remove ${asset.name} from this post`}
                            title="Remove from this post"
                            onClick={() => setComposer((prev) => ({
                              ...prev,
                              mediaAssetIds: prev.mediaAssetIds.filter((id) => id !== asset.id),
                            }))}
                          >
                            <X size={16} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <label>
                Deployment date/time
                <input
                  type="datetime-local"
                  value={composer.scheduledAt}
                  onChange={(event) => handleComposerChange('scheduledAt', event.target.value)}
                />
              </label>

              <div>
                <p className="small-title">Publish channels</p>
                <div className="chip-row">
                  {connectedAccounts.map((account) => {
                    const meta = getPlatformMeta(account.platform)
                    const key = account.platform.toLowerCase()
                    const active = composer.channels.includes(key)
                    return (
                      <button
                        key={account.id}
                        type="button"
                        className={active ? 'chip active' : 'chip'}
                        style={active ? { borderColor: meta.color, color: meta.color, background: meta.bg } : {}}
                        onClick={() => toggleChannel(key)}
                      >
                        <span>{meta.icon}</span> {meta.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="composer-actions">
                <button className="primary-button" type="button" onClick={handlePostNow}>
                  Post now
                </button>
                <button className="ghost-button" type="submit">
                  Queue post
                </button>
              </div>
              {schedulerError && <span className="field-error">{schedulerError}</span>}
            </form>

            <article className="sub-panel tone-sun">
              <h3>Scheduled queue</h3>
              {scheduledPosts.map((post) => (
                <div key={post.id} className="list-row">
                  <div>
                    <p>{post.campaign}</p>
                    <span>{post.message}</span>
                    {post.media?.length > 0 && <small>{post.media.length} media attachment{post.media.length === 1 ? '' : 's'}</small>}
                  </div>
                  <div className="queue-meta">
                    <span>{new Date(post.scheduledAt).toLocaleString()}</span>
                    <span className={getStatusBadgeClass(post.status === 'scheduled' ? 'pending' : post.status)}>
                      {post.status}
                    </span>
                  </div>
                </div>
              ))}
            </article>
          </section>
        )}

        {activeTab === 'assistant' && (
          <section className="panel panel-assistant">
            <div className="create-hub-heading">
              <div>
                <p className="small-title">Create</p>
                <h2>Turn an idea into a finished campaign</h2>
                <p className="panel-note">
                  Start with a brief, files, or a prompt. Generate, edit, and send the result to Scheduler.
                </p>
              </div>
              <div className="create-hub-actions">
                <button type="button" className="ghost-button" onClick={() => setActiveTab('photo')}>Edit an image</button>
                <button type="button" className="ghost-button" onClick={() => setActiveTab('studio')}>Create a video</button>
                <button type="button" className="primary-button" onClick={() => setActiveTab('scheduler')}>Open Scheduler</button>
              </div>
            </div>

            <Suspense fallback={loadingPanel}>
              <CreativeBrief
                agentConfig={aiAgentConfig}
                workspaceAssets={workspaceAssets}
                onEditProject={handleEditCreativeProject}
                onUseDraft={handleUseCreativeDraft}
                onSaveToWorkspace={handleSaveCreativeProjectToWorkspace}
              />
            </Suspense>

            <div className="split assistant-quick-copy">
              <article className="sub-panel tone-indigo">
                <h3>Prompt builder</h3>
                <textarea
                  rows="5"
                  value={aiInput}
                  onChange={(event) => setAiInput(event.target.value)}
                  placeholder="Example: Write 3 Instagram captions for a weekend flash sale with an upbeat tone."
                />

                <div className="chip-row">
                  {aiPromptIdeas.map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      className="chip"
                      onClick={() => setAiInput(idea)}
                    >
                      {idea}
                    </button>
                  ))}
                </div>

                <button type="button" className="primary-button" onClick={handleGenerateAi}>
                  {aiLoading ? 'Generating...' : 'Generate suggestions'}
                </button>
              </article>

              <article className="sub-panel tone-mint">
                <h3>AI output</h3>
                {aiSuggestions.length === 0 && (
                  <p className="muted">Generate content to see campaign-ready ideas here.</p>
                )}

                {aiSuggestions.map((suggestion, index) => (
                  <div key={`${suggestion.title}-${index}`} className="suggestion">
                    <p>{suggestion.title}</p>
                    <span>{suggestion.copy}</span>
                    <small>Image idea: {suggestion.image}</small>
                  </div>
                ))}
              </article>
            </div>
            <div className="create-hub-advanced">
              <div className="create-hub-advanced-heading">
                <div>
                  <p className="section-label">Advanced creation</p>
                  <h3>Use your in-house AI engine</h3>
                </div>
                <span>For characters, image editing, video, audio, vision, and specialist models</span>
              </div>
              <Suspense fallback={loadingPanel}>
                <InhouseAiStudio
                  agentConfig={aiAgentConfig}
                  assets={workspaceAssets}
                  onSaveConfig={saveInhouseAiConfig}
                  onAddAsset={handleInhouseAiAsset}
                />
              </Suspense>
            </div>
          </section>
        )}

        {activeTab === 'studio' && (
          <Suspense fallback={loadingPanel}>
            <section style={{ display: 'flex', height: '100%', flexDirection: 'column', gap: 0 }}>
              <VideoEditor
                assets={workspaceAssets}
                brief={creativeProject?.outputType === 'video' ? creativeProject : null}
                agentConfig={aiAgentConfig}
                onAddAsset={handleInhouseAiAsset}
                onExport={(project) => {
                  const exportedAsset = {
                    id: `asset_${Date.now()}`,
                    name: project.exportName || 'video-studio-export.webm',
                    type: 'video',
                    mime: 'video/webm',
                    size: project.sizeBytes || 0,
                    folderId: selectedFolderId,
                    createdAt: new Date().toISOString(),
                    previewUrl: project.previewUrl,
                    summary: project.summary || 'Exported from the video studio',
                  }

                  setWorkspaceAssets((prev) => [exportedAsset, ...prev])
                  setComposer((prev) => ({
                    ...prev,
                    message: `Video: ${project.totalClips} clips, ${project.durationSeconds}s`,
                    imageIdea: project.exportName || prev.imageIdea,
                    campaign: prev.campaign || 'Video campaign',
                  }))
                  setActiveTab('scheduler')
                }}
              />
            </section>
          </Suspense>
        )}

        {activeTab === 'photo' && (
          <Suspense fallback={loadingPanel}>
            <section style={{ display: 'flex', height: '100%', flexDirection: 'column', gap: 0 }}>
              <PhotoEditor
                key={creativeProject?.imageSrc || 'photo-editor'}
                assets={workspaceAssets}
                onExport={handlePhotoExport}
                  onGeneratedAsset={handleInhouseAiAsset}
                agentConfig={aiAgentConfig}
                brandKit={brandKit}
                initialProject={creativeProject?.outputType !== 'video' ? creativeProject : null}
              />
            </section>
          </Suspense>
        )}

        {activeTab === 'help' && (
          <Suspense fallback={loadingPanel}>
            <HelpCenter onContactSupport={openSupportModal} />
          </Suspense>
        )}

        {activeTab === 'integrations' && (
          <section className="panel panel-integrations">
            <h2>Integrations &amp; Connected Accounts</h2>
            <p className="panel-note">
              Link your social media accounts and third-party tools. Each channel you connect
              becomes available in the Scheduler and AI Studio.
            </p>

            <h3 className="section-label">Your company brand kit</h3>
            <p className="panel-note">
              Use your company&apos;s approved colours, fonts, and logos in creative work. This does not change EchoAI&apos;s application styling.
            </p>
            <div className="list-row">
              <div>
                <p>{brandKit.companyName || 'Your company'} brand resources</p>
                <span className="muted">
                  {brandKit.colors.length} colours • {brandKit.fonts.length} fonts • {brandKit.logos.length} logos
                </span>
              </div>
              <button type="button" className="ghost-button" onClick={loadBrandKit}>
                Refresh
              </button>
            </div>
            {(brandKit.colors.length || brandKit.fonts.length || brandKit.logos.length || brandKit.guidelines) ? (
              <div className="brand-kit-resource-grid">
                {brandKit.colors.length > 0 && (
                  <div>
                    <p className="small-title">Colours</p>
                    <div className="chip-row">
                      {brandKit.colors.map((color) => (
                        <span key={color.id} className="chip">
                          <span className="brand-kit-swatch" style={{ background: color.value }} />
                          {color.label || color.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {brandKit.fonts.length > 0 && (
                  <div>
                    <p className="small-title">Fonts</p>
                    <div className="chip-row">
                      {brandKit.fonts.map((font) => (
                        <span key={font.id} className="chip" style={{ fontFamily: `${font.family}, ${font.fallback || 'sans-serif'}` }}>
                          {font.label || font.family}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {brandKit.logos.length > 0 && (
                  <div>
                    <p className="small-title">Logos</p>
                    <div className="chip-row">
                      {brandKit.logos.map((logo) => (
                        <span key={logo.id} className="chip brand-kit-logo">
                          <img src={logo.dataUrl} alt={logo.label || 'Company logo'} />
                          {logo.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {brandKit.guidelines && (
                  <div>
                    <p className="small-title">Usage notes</p>
                    <p className="muted">{brandKit.guidelines}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="muted">Your company has not added brand resources yet.</p>
            )}

            {canManageBrandKit && <>
            <h3 className="section-label">Manage company brand kit</h3>
            <p className="panel-note">
              Your company&apos;s colours, licensed fonts, and logos. Everything here is available in
              the Photo Creator and Video Studio so every post stays on brand.
            </p>

            <div className="list-row">
              <div>
                <p>
                  {brandKit.colors.length} colours • {brandKit.fonts.length} fonts •{' '}
                  {brandKit.logos.length} logos
                </p>
                <span className="muted">
                  {brandKit.updatedAt
                    ? `Last updated ${new Date(brandKit.updatedAt).toLocaleDateString()}`
                    : 'Not set up yet.'}
                </span>
              </div>
              <button type="button" className="ghost-button" onClick={loadBrandKit}>
                Reload
              </button>
            </div>

            <h4 className="section-label">Colours</h4>
            {brandDraft.colors.map((color) => (
              <div key={color.id} className="list-row" style={{ gap: '0.5rem' }}>
                <input
                  type="color"
                  value={color.value}
                  onChange={(event) => updateBrandColor(color.id, { value: event.target.value })}
                />
                <input
                  type="text"
                  value={color.label}
                  placeholder="Primary"
                  onChange={(event) => updateBrandColor(color.id, { label: event.target.value })}
                  style={{ flex: 1 }}
                />
                <input
                  type="text"
                  value={color.value}
                  onChange={(event) => updateBrandColor(color.id, { value: event.target.value })}
                  style={{ width: '7rem', fontFamily: 'monospace' }}
                />
                <button type="button" className="chip" onClick={() => removeBrandItem('colors', color.id)}>
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="ghost-button" onClick={addBrandColor}>
              + Add colour
            </button>

            <h4 className="section-label">Licensed fonts</h4>
            <p className="muted">
              Host your licensed font file (woff2 recommended) and paste its URL. EchoAI loads it at
              runtime — the file is never redistributed, so your licence terms are respected.
            </p>
            {brandDraft.fonts.map((font) => (
              <div key={font.id} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.4rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={font.label}
                    placeholder="Heading font"
                    onChange={(event) => updateBrandFont(font.id, { label: event.target.value })}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="chip" onClick={() => removeBrandItem('fonts', font.id)}>
                    ✕
                  </button>
                </div>
                <input
                  type="text"
                  value={font.family}
                  placeholder="Font family name, e.g. Acme Grotesk"
                  onChange={(event) => updateBrandFont(font.id, { family: event.target.value })}
                />
                <input
                  type="url"
                  value={font.sourceUrl}
                  placeholder="https://cdn.yourbrand.com/AcmeGrotesk.woff2"
                  onChange={(event) => updateBrandFont(font.id, { sourceUrl: event.target.value })}
                />
                {font.family && (
                  <span style={{ fontFamily: `${font.family}, ${font.fallback}`, fontSize: '1.25rem' }}>
                    The quick brown fox — 0123456789
                  </span>
                )}
              </div>
            ))}
            <button type="button" className="ghost-button" onClick={addBrandFont}>
              + Add font
            </button>

            <h4 className="section-label">Logos</h4>
            <div className="chip-row">
              {brandDraft.logos.map((logo) => (
                <div key={logo.id} className="chip" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <img src={logo.dataUrl} alt={logo.label} style={{ height: 28, width: 'auto' }} />
                  <span>{logo.label}</span>
                  <button type="button" className="text-button" onClick={() => removeBrandItem('logos', logo.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <label>
              Upload a logo (PNG, SVG, or JPG — under {Math.round(MAX_LOGO_BYTES / 1024)} KB)
              <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" onChange={handleBrandLogoUpload} />
            </label>

            <label>
              Brand guidelines / voice notes
              <textarea
                rows={3}
                value={brandDraft.guidelines}
                placeholder="Tone of voice, do's and don'ts, logo clear space rules..."
                onChange={(event) => setBrandDraft((prev) => ({ ...prev, guidelines: event.target.value }))}
              />
            </label>

            {brandError && <span className="field-error">{brandError}</span>}
            {brandNotice && <p className="muted">{brandNotice}</p>}
            <button type="button" className="primary-button" onClick={handleSaveBrandKit} disabled={brandBusy}>
              {brandBusy ? 'Saving...' : 'Save brand kit'}
            </button>
            </>}

            <h3 className="section-label">Security</h3>
            <div className="list-row">
              <div>
                <p>Two-factor authentication</p>
                <span className="muted">
                  Require a 6-digit code from Google Authenticator, Authy, 1Password, or any TOTP
                  app in addition to your password.
                </span>
              </div>
              <button
                type="button"
                className="ghost-button"
                disabled={!isSupabaseConfigured}
                onClick={() => {
                  setMfaRecoveryCodes([])
                  setMfaEnrollment(null)
                  setMfaError('')
                  setMfaEnrollOpen(true)
                }}
              >
                Manage 2FA
              </button>
            </div>

            <h3 className="section-label">Subscription &amp; billing</h3>
            <div className="list-row">
              <div>
                <p>
                  {myEntitlement?.plan
                    ? `${getPlan(myEntitlement.plan).label} — ${myEntitlement.storageGb} GB storage`
                    : 'Your EchoAI subscription'}
                </p>
                <span className="muted">
                  {myEntitlement
                    ? myEntitlement.status === 'none'
                      ? 'No subscription on file.'
                      : `Status: ${myEntitlement.status}${
                          myEntitlement.billingInterval ? ` • billed ${myEntitlement.billingInterval}` : ''
                        }${
                          myEntitlement.currentPeriodEnd
                            ? ` • renews ${new Date(myEntitlement.currentPeriodEnd).toLocaleDateString()}`
                            : ''
                        }`
                    : 'Change plan, update your card, or cancel at any time.'}
                </span>
              </div>
              <button
                type="button"
                className="ghost-button"
                disabled={billingPortalLoading || !isSupabaseConfigured}
                onClick={handleOpenBillingPortal}
              >
                {billingPortalLoading ? 'Opening…' : 'Manage billing'}
              </button>
            </div>
            {billingPortalError && <span className="field-error">{billingPortalError}</span>}

            <h3 className="section-label">Refer &amp; earn</h3>
            <div className="list-row">
              <div>
                <p>Share your link — earn a free month</p>
                <span className="muted">
                  They get 20% off their first month or 10% off their first year. You get one free
                  month once their subscription goes through, applied automatically.
                </span>
              </div>
              <button type="button" className="ghost-button" onClick={handleLoadReferral}>
                {referralSummary ? 'Refresh' : 'Get my link'}
              </button>
            </div>

            {referralSummary?.code && (
              <div className="list-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ overflowWrap: 'anywhere' }}>
                    {billingService.referralLink(referralSummary.code)}
                  </p>
                  <span className="muted">
                    {referralSummary.converted} referred • {referralSummary.rewardsGranted} free
                    month(s) earned
                  </span>
                </div>
                <button type="button" className="ghost-button" onClick={handleCopyReferralLink}>
                  {referralCopied ? 'Copied' : 'Copy link'}
                </button>
              </div>
            )}

            <h3 className="section-label">Social media accounts</h3>
            <article className="quick-connect-card">
              <div className="quick-connect-heading">
                <div>
                  <p className="small-title">Quick connect</p>
                  <h3>Connect your social accounts in one guided flow</h3>
                </div>
                <button type="button" className="primary-button" onClick={openQuickConnect}>
                  {quickConnectOpen ? 'Quick connect open' : 'Start quick connect'}
                </button>
              </div>
              <p className="muted">
                EchoAI cannot search private social networks by email. We use these details to label your setup, then each provider confirms the account through its own secure OAuth sign-in.
              </p>
              {quickConnectOpen && (
                <div className="quick-connect-wizard">
                  <div className="quick-connect-fields">
                    <label className="field-label">
                      Your name
                      <input value={quickConnectName} onChange={(event) => setQuickConnectName(event.target.value)} placeholder="Jordan Lee" />
                    </label>
                    <label className="field-label">
                      Email used for your accounts
                      <input type="email" value={quickConnectEmail} onChange={(event) => setQuickConnectEmail(event.target.value)} placeholder="you@example.com" />
                    </label>
                  </div>
                  <div>
                    <p className="small-title">Choose providers</p>
                    <div className="quick-connect-providers">
                      {[
                        { key: 'instagram', available: true },
                        { key: 'facebook', available: true },
                        { key: 'youtube', available: true },
                        { key: 'tiktok', available: false },
                        { key: 'x', available: false },
                        { key: 'linkedin', available: false },
                      ].map(({ key, available }) => {
                        const meta = getPlatformMeta(key)
                        const connected = connectedAccounts.some((account) => account.platform.toLowerCase() === key && account.status === 'healthy')
                        const selected = quickConnectSelected.includes(key)
                        return (
                          <button
                            key={key}
                            type="button"
                            className={`quick-connect-provider ${selected ? 'selected' : ''}`}
                            disabled={!available}
                            onClick={() => setQuickConnectSelected((prev) => selected ? prev.filter((item) => item !== key) : [...prev, key])}
                          >
                            <span className="quick-connect-provider-icon" style={{ color: meta.color }}>{meta.icon}</span>
                            <span>{meta.label}</span>
                            <small>{connected ? 'Connected' : available ? 'Available' : 'Coming soon'}</small>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="quick-connect-footer">
                    <span className="muted">Selected providers connect one at a time so each account can approve its own access.</span>
                    <div className="integration-actions">
                      <button type="button" className="ghost-button" onClick={() => setQuickConnectOpen(false)}>Close</button>
                      <button type="button" className="primary-button" onClick={startQuickConnect}>Connect next selected account</button>
                    </div>
                  </div>
                  {quickConnectNotice && <p className="auth-message">{quickConnectNotice}</p>}
                </div>
              )}
            </article>
            <div className="integration-grid">
              {[
                { key: 'instagram', accountPlaceholder: '@youraccount', desc: 'Publish posts, stories, and reels. Read insights and story metrics.' },
                { key: 'facebook',  accountPlaceholder: 'Your page name', desc: 'Schedule posts, publish to pages, and track ad-level reach.' },
                { key: 'tiktok',    accountPlaceholder: '@youraccount', desc: 'Queue short-form videos, read performance data and comment trends.' },
                { key: 'snapchat',  accountPlaceholder: 'Your Snapchat', desc: 'Upload creative content and track Snap campaign metrics.' },
                { key: 'x',         accountPlaceholder: '@youraccount', desc: 'Post to X (formerly Twitter), schedule threads, and monitor mentions.' },
                { key: 'youtube',   accountPlaceholder: 'Your channel', desc: 'Upload videos, schedule premieres, and read subscriber analytics.' },
                { key: 'linkedin',  accountPlaceholder: 'Your profile / page', desc: 'Publish professional content and read engagement metrics.' },
              ].map(({ key, accountPlaceholder, desc }) => {
                const meta = getPlatformMeta(key)
                const linked = connectedAccounts.find((a) => a.platform.toLowerCase() === key)
                const inputValue = accountHandleDrafts[key] ?? linked?.accountName ?? accountPlaceholder
                const selectedScopes = accountScopeDrafts[key] ?? linked?.publishingScopes ?? ['posts']
                return (
                  <div
                    key={key}
                    className="integration-platform-card"
                    style={{ borderColor: meta.border }}
                  >
                    <div className="integration-platform-header" style={{ background: meta.bg, borderColor: meta.border }}>
                      <span className="integration-platform-icon" style={{ color: meta.color }}>{meta.icon}</span>
                      <div>
                        <strong style={{ color: meta.color }}>{meta.label}</strong>
                        {linked && <span className="integration-linked-handle">{linked.accountName}</span>}
                      </div>
                      {linked && (
                        <span className={`integration-status-badge ${linked.status === 'healthy' ? 'good' : 'warn'}`}>
                          {linked.status === 'healthy' ? '● OAuth connected' : 'OAuth access required'}
                        </span>
                      )}
                    </div>
                    <div className="integration-platform-body">
                      <p>{desc}</p>
                      {linked ? (
                        <>
                          <label className="field-label">
                            Handle / profile name
                            <input
                              type="text"
                              value={inputValue}
                              onChange={(event) => setAccountHandleDrafts((prev) => ({ ...prev, [key]: event.target.value }))}
                              placeholder={accountPlaceholder}
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <label className="field-label">
                            Handle / profile name
                            <input
                              type="text"
                              value={inputValue}
                              onChange={(event) => setAccountHandleDrafts((prev) => ({ ...prev, [key]: event.target.value }))}
                              placeholder={accountPlaceholder}
                            />
                          </label>
                        </>
                      )}
                      <div>
                        <p className="small-title">Requested access</p>
                        <div className="chip-row">
                          {SOCIAL_PUBLISHING_SCOPES.map((scope) => {
                            const selected = selectedScopes.includes(scope)
                            return (
                              <button
                                key={scope}
                                type="button"
                                className={selected ? 'chip active' : 'chip'}
                                onClick={() => setAccountScopeDrafts((prev) => ({
                                  ...prev,
                                  [key]: selected
                                    ? selectedScopes.filter((item) => item !== scope)
                                    : [...selectedScopes, scope],
                                }))}
                              >
                                {scope}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      <p className="muted">Your account profile and access preferences are private. Publishing stays disabled until this account completes OAuth authorization.</p>
                      <div className="integration-actions">
                        <button
                          type="button"
                          className="primary-button"
                          style={{ background: meta.color, borderColor: meta.color }}
                          onClick={() => saveSocialAccount({
                            platform: key,
                            accountName: inputValue,
                            publishingScopes: selectedScopes,
                          })}
                        >
                          Save account profile
                        </button>
                        {['instagram', 'facebook', 'youtube'].includes(key) && (
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => connectSocialAccount({
                              platform: key,
                              requestedScopes: selectedScopes,
                            })}
                          >
                            {linked?.status === 'healthy' ? 'Reconnect OAuth' : `Authorize ${meta.label}`}
                          </button>
                        )}
                        {linked && (
                          <button
                            type="button"
                            className="ghost-button"
                            style={{ color: '#ef4444' }}
                            onClick={() => removeSocialAccount(linked)}
                          >
                            Remove account
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {integrationError && <span className="field-error">{integrationError}</span>}

            <AiToolManager
              connections={aiAgentConnections}
              userId={session.id}
              onSave={saveAiAgentConnection}
              onDelete={deleteAiAgentConnection}
              onResync={resyncAiAgentConnection}
            />

            <article className="sub-panel tone-indigo" style={{ marginTop: '1.2rem', marginBottom: '1rem' }}>
              <div className="inhouse-engine-heading">
                <div><h3>In-house AI engine</h3><p className="muted">Connect one orchestrator endpoint, declare its specialist abilities, and use it across writing, documents, images, characters, video, audio, vision, and safety review.</p></div>
                <button type="button" className="openai-guide-button" onClick={() => setOpenAiGuideOpen(true)}>OpenAI connection guide <span aria-hidden="true">↗</span></button>
              </div>
              <div className="agent-connection-note">
                <strong>How connection works</strong>
                <p>EchoAI connects to an API bridge, not a provider&apos;s public website. OpenArt, ChatGPT, and similar dashboard URLs cannot be pasted here because browsers block cross-site requests and those pages do not implement EchoAI&apos;s API contract.</p>
                <p>Your bridge should call the provider server-side, allow this app&apos;s origin with CORS, accept <code>POST</code> plus <code>OPTIONS</code>, and return the version 2 response shown below.</p>
                <a href="https://github.com/tjdvorak37/EchoAI/blob/main/docs/INHOUSE_AI_AGENT.md" target="_blank" rel="noreferrer">View the endpoint contract</a>
              </div>
              <div className="agent-setup-guide">
                <div className="agent-guide-card hero">
                  <p className="section-label">Quick setup</p>
                  <h4>Connect your AI in 4 steps</h4>
                  <ol className="agent-steps">
                    <li>Give the bot a name users recognize.</li>
                    <li>Paste the endpoint that receives AI requests.</li>
                    <li>Enable only the capabilities your endpoint actually supports.</li>
                    <li>Test the connection, then save the profile.</li>
                  </ol>
                </div>

                <div className="agent-guide-card">
                  <p className="section-label">What to enter</p>
                  <ul className="agent-checklist">
                    <li><strong>Agent name:</strong> a friendly label like “Creative Bot”.</li>
                    <li><strong>Endpoint URL:</strong> the HTTPS address that accepts POST requests.</li>
                    <li><strong>API key:</strong> only if your bot requires authorization.</li>
                    <li><strong>Model or route:</strong> optional name if your endpoint supports it.</li>
                  </ul>
                </div>
              </div>
              <div className="list-row">
                <div>
                  <p>{aiAgentConfig.name}</p>
                  <span>{aiAgentConfig.message}</span>
                </div>
                <span className={getStatusBadgeClass(aiAgentConfig.status)}>{aiAgentConfig.status}</span>
              </div>
              <form className="auth-form" onSubmit={handleSaveAiAgent}>
                <label>
                  Agent name
                  <input
                    type="text"
                    value={aiAgentDraft.name}
                    onChange={(event) => handleAiAgentDraftChange('name', event.target.value)}
                    placeholder="My AI Agent"
                  />
                </label>
                <label>
                  Preferred AI tool
                  <select
                    value={aiAgentDraft.provider || 'custom_router'}
                    onChange={(event) => handleAiAgentDraftChange('provider', event.target.value)}
                  >
                    <option value="echoai">EchoAI hosted tools</option>
                    <option value="openai">OpenAI / ChatGPT image tools</option>
                    <option value="openart">OpenArt</option>
                    <option value="anthropic">Anthropic / Claude</option>
                    <option value="custom_router">My AI router or custom bridge</option>
                  </select>
                  <small className="muted">This label is sent to your bridge. The endpoint must route to the selected provider server-side.</small>
                </label>
                <label>
                  Endpoint URL
                  <input
                    type="url"
                    value={aiAgentDraft.endpoint}
                    onChange={(event) => handleAiAgentDraftChange('endpoint', event.target.value)}
                    placeholder="https://your-agent.example.com/run"
                  />
                </label>
                <label>
                  API key
                  <input
                    type="password"
                    value={aiAgentDraft.apiKey}
                    onChange={(event) => handleAiAgentDraftChange('apiKey', event.target.value)}
                    placeholder="Optional bearer token"
                  />
                </label>
                <label>
                  Model or route
                  <input
                    type="text"
                    value={aiAgentDraft.model}
                    onChange={(event) => handleAiAgentDraftChange('model', event.target.value)}
                    placeholder="default or your model name"
                  />
                </label>
                <div className="split" style={{ marginTop: 0 }}>
                  <label>
                    Routing strategy
                    <select
                      value={aiAgentDraft.routing?.strategy || 'best_quality'}
                      onChange={(event) => handleAiAgentDraftChange('routing', { ...aiAgentDraft.routing, strategy: event.target.value })}
                    >
                      <option value="best_quality">Best quality</option>
                      <option value="balanced">Balanced</option>
                      <option value="lowest_cost">Lowest cost</option>
                      <option value="fastest">Fastest</option>
                      <option value="private_only">Private models only</option>
                    </select>
                  </label>
                  <label>
                    Default visual style
                    <input
                      value={aiAgentDraft.defaultStyle || ''}
                      onChange={(event) => handleAiAgentDraftChange('defaultStyle', event.target.value)}
                      placeholder="Editorial, photoreal, illustrated..."
                    />
                  </label>
                </div>
                <label>
                  Global negative prompt
                  <textarea
                    rows="3"
                    value={aiAgentDraft.negativePrompt || ''}
                    onChange={(event) => handleAiAgentDraftChange('negativePrompt', event.target.value)}
                    placeholder="Traits, artifacts, subjects, or styles the agent should avoid."
                  />
                </label>
                <label className="toggle-row" style={{ alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={aiAgentDraft.routing?.allowFallback !== false}
                    onChange={(event) => handleAiAgentDraftChange('routing', { ...aiAgentDraft.routing, allowFallback: event.target.checked })}
                  />
                  Allow an approved fallback provider when the preferred model is unavailable
                </label>
                <div className="agent-capability-grid">
                  {AI_AGENT_CAPABILITIES.map((capability) => {
                    const checked = (aiAgentDraft.capabilities || []).includes(capability.key)
                    return (
                      <label key={capability.key} className={`agent-capability-card ${checked ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleAiAgentCapabilityToggle(capability.key)}
                        />
                        <span>
                          <strong>{capability.title}</strong>
                          <small>{capability.description}</small>
                        </span>
                      </label>
                    )
                  })}
                </div>
                <label className="toggle-row" style={{ alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={aiAgentDraft.enabled}
                    onChange={(event) => handleAiAgentDraftChange('enabled', event.target.checked)}
                  />
                  Enable this agent for AI tools
                </label>
                <div className="action-row">
                  <button type="button" className="ghost-button" onClick={handleTestAiAgent} disabled={aiAgentTesting}>
                    {aiAgentTesting ? 'Testing...' : 'Test connection'}
                  </button>
                  <button type="submit" className="primary-button" disabled={aiAgentSaving}>
                    {aiAgentSaving ? 'Saving...' : 'Save agent settings'}
                  </button>
                </div>
                {aiAgentFeedback && (
                  <p className={aiAgentFeedbackTone === 'error' ? 'auth-message auth-error' : 'auth-message'}>
                    {aiAgentFeedback}
                  </p>
                )}

                <div className="agent-payload-preview">
                  <p className="section-label">Request preview</p>
                  <pre>{JSON.stringify({
                    contractVersion: '2.0',
                    mode: 'image | image_edit | character | video | audio | vision | document | message',
                    capability: 'selected capability',
                    agentName: aiAgentDraft.name || 'My AI Agent',
                    model: aiAgentDraft.model || 'default',
                    capabilities: aiAgentDraft.capabilities || [],
                    routing: aiAgentDraft.routing,
                    persona: '{ reusable character profile or null }',
                    references: '[ workspace assets ]',
                    output: '{ aspectRatio, durationSeconds, quality, style }',
                    prompt: 'What do you want the bot to help with?',
                  }, null, 2)}</pre>
                </div>
              </form>

              <OpenAiSetupGuide open={openAiGuideOpen} onClose={() => setOpenAiGuideOpen(false)} />
            </article>

            {canViewManagementBoard && <>
            <h3 className="section-label" style={{ marginTop: '2rem' }}>Third-party tools</h3>
            <div className="cards">
              {[
                { name: 'Slack + Teams', icon: '💬', color: '#4A154B', desc: 'Send deployment alerts and campaign summaries to your ops channel.' },
                { name: 'Zapier / Make', icon: '⚡', color: '#FF4A00', desc: 'Trigger workflows from CRM updates, forms, and ecommerce events.' },
                { name: 'AI Image Tools', icon: '🎨', color: '#7C3AED', desc: 'Connect image generation APIs for campaign graphics at scale.' },
                { name: 'Google Analytics', icon: '📊', color: '#E37400', desc: 'Pull traffic and conversion data alongside your social metrics.' },
                { name: 'Shopify', icon: '🛍️', color: '#96BF48', desc: 'Sync product launches and inventory events to social posts automatically.' },
              ].map((item) => (
                <article key={item.name} className="integration-card" style={{ borderTopColor: item.color }}>
                  <div className="integration-card-header">
                    <span className="integration-card-icon" style={{ color: item.color }}>{item.icon}</span>
                    <h3>{item.name}</h3>
                  </div>
                  <p>{item.desc}</p>
                  <span className="muted">Managed by IT / Management</span>
                </article>
              ))}
            </div>
            </>}
          </section>
        )}

        {activeTab === 'account' && (
          <section className="panel">
            <h2>Manage account</h2>
            <p className="panel-note">Update your information, manage billing, or control your EchoAI account.</p>

            <h3 className="section-label">Personal information</h3>
            <div className="list-row">
              <div>
                <p>{contactCard?.fullName || session?.email}</p>
                <span className="muted">{session?.email} {contactCard?.company ? `• ${contactCard.company}` : ''}</span>
              </div>
              <button type="button" className="ghost-button" onClick={openContactCard}>Edit information</button>
            </div>

            <h3 className="section-label">Subscription and payments</h3>
            <div className="list-row">
              <div>
                <p>{myEntitlement?.plan ? `${getPlan(myEntitlement.plan).label} plan` : 'Your EchoAI subscription'}</p>
                <span className="muted">Update payment method, upgrade, downgrade, or cancel your subscription.</span>
              </div>
              <button type="button" className="ghost-button" disabled={billingPortalLoading || !isSupabaseConfigured} onClick={handleOpenBillingPortal}>
                {billingPortalLoading ? 'Opening...' : 'Manage billing'}
              </button>
            </div>
            {billingPortalError && <span className="field-error">{billingPortalError}</span>}

            <h3 className="section-label">Account access</h3>
            <div className="list-row">
              <div><p>Deactivate account</p><span className="muted">Sign out and disable access until support restores the account.</span></div>
              <button type="button" className="ghost-button" disabled={accountActionLoading || !isSupabaseConfigured} onClick={handleDeactivateAccount}>Deactivate</button>
            </div>
            <div className="list-row">
              <div><p>Delete account and data</p><span className="muted">Permanently remove your account and associated records.</span></div>
              <button type="button" className="danger-button" disabled={accountActionLoading || !isSupabaseConfigured} onClick={handleDeleteAccount}>Delete account</button>
            </div>
            {accountActionError && <span className="field-error">{accountActionError}</span>}
          </section>
        )}

        {activeTab === 'admin' && ['admin', 'manager', 'it'].includes(session?.role || '') && (
          <Suspense fallback={loadingPanel}>
            <AdminPanel
              teamMembers={teamMembers}
              setTeamMembers={setTeamMembers}
              accessRequests={accessRequests}
              setAccessRequests={setAccessRequests}
              alerts={alerts}
              setAlerts={setAlerts}
              licenses={licenses}
              setLicenses={setLicenses}
              tickets={tickets}
              setTickets={setTickets}
              purchaseHistory={purchaseHistory}
              setPurchaseHistory={setPurchaseHistory}
              featureFlags={featureFlags}
              setFeatureFlags={setFeatureFlags}
              announcements={announcements}
              onSaveAnnouncement={handleSaveAnnouncement}
              billingLive={isSupabaseConfigured}
              promoCodes={promoCodes}
              setPromoCodes={setPromoCodes}
              expenses={expenses}
              setExpenses={setExpenses}
              payroll={payroll}
              setPayroll={setPayroll}
              taxRecords={taxRecords}
              setTaxRecords={setTaxRecords}
              refunds={refunds}
              setRefunds={setRefunds}
              financialTasks={financialTasks}
              setFinancialTasks={setFinancialTasks}
              quotaEditingUserId={quotaEditingUserId}
              setQuotaEditingUserId={setQuotaEditingUserId}
              quotaDraftMb={quotaDraftMb}
              setQuotaDraftMb={setQuotaDraftMb}
              handleQuotaUpdate={handleQuotaUpdate}
              handleToggleUserAccess={handleToggleUserAccess}
              handleUpdateUserRole={handleUpdateUserRole}
              companySeatPackage={companySeatPackage}
              companySeats={companySeats}
              handleCreateCompanySeatPackage={handleCreateCompanySeatPackage}
              handleUpdateCompanySeatPackage={handleUpdateCompanySeatPackage}
              handleRespondToSupportTicket={handleRespondToSupportTicket}
              handleUpdateSupportTicketStatus={handleUpdateSupportTicketStatus}
              onAdminUserAction={handleAdminUserAction}
              handleAssignCompanySeat={handleAssignCompanySeat}
              handleRevokeCompanySeat={handleRevokeCompanySeat}
              socialPlatformReadiness={socialPlatformReadiness}
              socialPlatformReadinessLoading={socialPlatformReadinessLoading}
              socialPlatformReadinessError={socialPlatformReadinessError}
              handleRefreshSocialPlatformReadiness={loadSocialPlatformReadiness}
              adminLoading={adminLoading}
              adminError={adminError}
              currentUser={session}
            />
          </Suspense>
        )}

        {activeTab === 'admin' && session?.role === 'accountant' && (
          <Suspense fallback={loadingPanel}>
            <FinancePanel
              purchaseHistory={purchaseHistory}
              expenses={expenses} setExpenses={setExpenses}
              payroll={payroll} setPayroll={setPayroll}
              taxRecords={taxRecords} setTaxRecords={setTaxRecords}
              refunds={refunds} setRefunds={setRefunds}
              financialTasks={financialTasks} setFinancialTasks={setFinancialTasks}
            />
          </Suspense>
        )}
      </main>

      {supportModalOpen && (
        <div className="modal-overlay" role="presentation" onClick={closeSupportModal}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Support ticket"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Support ticket</h2>
            <p className="panel-note">Tell us what went wrong and our team will follow up.</p>

            <form className="auth-form" onSubmit={handleSubmitSupportTicket}>
              <label>
                Issue category
                <select
                  value={supportTicket.category}
                  onChange={(event) => handleSupportTicketChange('category', event.target.value)}
                >
                  {[
                    'Technical issue',
                    'Billing question',
                    'Access problem',
                    'Integration help',
                    'Feature request',
                  ].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                What happened?
                <textarea
                  rows="4"
                  value={supportTicket.details}
                  onChange={(event) => handleSupportTicketChange('details', event.target.value)}
                  placeholder="Share steps, expected result, and what you saw instead."
                />
              </label>

              {supportError && <p className="auth-message auth-error">{supportError}</p>}
              {supportSuccess && <p className="auth-message">{supportSuccess}</p>}

              <label>
                Screenshots (optional)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  onChange={handleSupportAttachmentChange}
                  disabled={supportUploading}
                />
              </label>
              {supportUploading && <p className="panel-note">Uploading screenshot…</p>}
              {supportAttachments.length > 0 && (
                <ul className="support-attachment-list">
                  {supportAttachments.map((attachment) => (
                    <li key={attachment.path}>
                      <span>{attachment.name}</span>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setSupportAttachments((prev) => prev.filter((item) => item.path !== attachment.path))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="action-row">
                <button type="button" className="ghost-button" onClick={closeSupportModal}>
                  Close
                </button>
                <button type="submit" className="primary-button" disabled={supportLoading}>
                  {supportLoading ? 'Sending...' : 'Send ticket'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

function AppRoot() {
  const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/'
  if (normalizedPath === '/privacy-policy') {
    return (
      <Suspense fallback={<div className="loading-panel">Loading privacy policy...</div>}>
        <PrivacyPolicy />
      </Suspense>
    )
  }
  return <App />
}
export default AppRoot
