import { useMemo, useRef, useState } from 'react'
import './App.css'
import {
  accessRequestsSeed,
  adminAlerts,
  aiPromptIdeas,
  companyMainPostsSeed,
  companySocialAccountsSeed,
  connectedAccountsSeed,
  postTypeChips,
  repostQueueSeed,
  scheduledPostsSeed,
  starterStats,
  teamMembersSeed,
  userRepostsSeed,
} from './data/demoData'
import { authService } from './services/authService'
import { platformService } from './services/platformService'
import { repostService } from './services/repostService'
import { isSupabaseConfigured } from './lib/supabase'

function App() {
  const [authView, setAuthView] = useState('signin')
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
  const [mfaPending, setMfaPending] = useState(false)
  const [pendingEmail, setPendingEmail] = useState('')
  const [session, setSession] = useState(null)

  const [activeTab, setActiveTab] = useState('dashboard')
  const [connectedAccounts] = useState(connectedAccountsSeed)
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
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [employeeSortBy, setEmployeeSortBy] = useState('name')
  const [employeeSortOrder, setEmployeeSortOrder] = useState('asc')
  const [employeePage, setEmployeePage] = useState(1)
  const [employeePageSize, setEmployeePageSize] = useState(8)
  const [supportModalOpen, setSupportModalOpen] = useState(false)
  const [supportLoading, setSupportLoading] = useState(false)
  const [supportError, setSupportError] = useState('')
  const [supportSuccess, setSupportSuccess] = useState('')
  const [supportTicket, setSupportTicket] = useState({
    category: 'Technical issue',
    details: '',
  })
  const [composer, setComposer] = useState({
    campaign: '',
    message: '',
    imageIdea: '',
    scheduledAt: '',
    channels: ['instagram'],
  })
  const [aiInput, setAiInput] = useState('')
  const [aiSuggestions, setAiSuggestions] = useState([])
  const [aiLoading, setAiLoading] = useState(false)

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

  const filteredTeamMembers = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase()
    if (!query) {
      return teamMembers
    }

    return teamMembers.filter((member) => {
      const searchable = [
        member.fullName,
        member.email,
        member.company,
        member.role,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchable.includes(query)
    })
  }, [employeeSearch, teamMembers])

  const sortedTeamMembers = useMemo(() => {
    const sorted = [...filteredTeamMembers]

    const toSortable = (member) => {
      if (employeeSortBy === 'email') {
        return member.email || ''
      }

      if (employeeSortBy === 'role') {
        return member.role || ''
      }

      if (employeeSortBy === 'status') {
        return member.accessStatus || ''
      }

      return member.fullName || ''
    }

    sorted.sort((a, b) => {
      const first = toSortable(a).toLowerCase()
      const second = toSortable(b).toLowerCase()

      if (first < second) {
        return employeeSortOrder === 'asc' ? -1 : 1
      }

      if (first > second) {
        return employeeSortOrder === 'asc' ? 1 : -1
      }

      return 0
    })

    return sorted
  }, [employeeSortBy, employeeSortOrder, filteredTeamMembers])

  const totalEmployeePages = Math.max(1, Math.ceil(sortedTeamMembers.length / employeePageSize))
  const currentEmployeePage = Math.min(employeePage, totalEmployeePages)

  const pagedTeamMembers = useMemo(() => {
    const start = (currentEmployeePage - 1) * employeePageSize
    return sortedTeamMembers.slice(start, start + employeePageSize)
  }, [currentEmployeePage, employeePageSize, sortedTeamMembers])

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
  const canViewManagementBoard = ['admin', 'manager', 'it'].includes(session?.role || '')

  const loadAdminData = async () => {
    setAdminError('')
    setAdminLoading(true)

    try {
      const [requests, members] = await Promise.all([
        authService.getAccessRequests(),
        authService.getManagedUsers(),
      ])

      if (requests.length) {
        setAccessRequests(requests)
      }

      if (members.length) {
        setTeamMembers(members)
      }
    } catch (error) {
      setAdminError(error.message)
    } finally {
      setAdminLoading(false)
    }
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
        setMfaPending(true)
        return
      }

      setSession(result.user)
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
      await authService.signUp({
        email: authState.email,
        password: authState.password,
        fullName: authState.fullName,
        company: authState.company,
      })
      setAuthNotice(
        'Account request submitted. Management or IT must approve before your first login.',
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

  const handleVerifyMfa = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthNotice('')
    setAuthLoading(true)

    try {
      const result = await authService.verifyMfaCode({
        email: pendingEmail,
        code: authState.otpCode,
      })
      setSession(result.user)
      await loadRepostWorkspace()
      if (result.user?.role === 'admin') {
        await loadAdminData()
      }
      setMfaPending(false)
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

  const handleSchedulePost = async (event) => {
    event.preventDefault()
    if (!composer.message.trim() || !composer.scheduledAt || !composer.channels.length) {
      return
    }

    const newPost = await platformService.schedulePost({
      campaign: composer.campaign || 'Daily Campaign',
      message: composer.message,
      imageIdea: composer.imageIdea,
      scheduledAt: composer.scheduledAt,
      channels: composer.channels,
    })

    setScheduledPosts((prev) => [newPost, ...prev])
    setComposer({
      campaign: '',
      message: '',
      imageIdea: '',
      scheduledAt: '',
      channels: ['instagram'],
    })
  }

  const handleGenerateAi = async () => {
    if (!aiInput.trim()) {
      return
    }

    setAiLoading(true)
    const suggestions = await platformService.generateMessageIdeas(aiInput)
    setAiSuggestions(suggestions)
    setAiLoading(false)
  }

  const handleResolveAlert = (alertId) => {
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.id === alertId ? { ...alert, status: 'resolved' } : alert,
      ),
    )
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
    setSupportError('')
    setSupportSuccess('')
    setSupportTicket({
      category: 'Technical issue',
      details: '',
    })
    setSupportModalOpen(true)
  }

  const closeSupportModal = () => {
    setSupportModalOpen(false)
    setSupportError('')
    setSupportSuccess('')
  }

  const handleSupportTicketChange = (field, value) => {
    setSupportTicket((prev) => ({ ...prev, [field]: value }))
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
    } catch (error) {
      setSupportError(error.message)
    } finally {
      setSupportLoading(false)
    }
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

  const handleReviewAccessRequest = async (requestId, decision) => {
    setAdminError('')
    setAdminLoading(true)

    try {
      const result = await authService.reviewAccessRequest({ requestId, decision })

      setAccessRequests((prev) =>
        prev.map((request) =>
          request.id === requestId ? { ...request, ...result.request } : request,
        ),
      )

      if (result.member) {
        setTeamMembers((prev) => {
          const exists = prev.some((member) => member.id === result.member.id)
          if (exists) {
            return prev.map((member) =>
              member.id === result.member.id ? { ...member, ...result.member } : member,
            )
          }

          return [result.member, ...prev]
        })
      }
    } catch (error) {
      setAdminError(error.message)
    } finally {
      setAdminLoading(false)
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

  const signOut = async () => {
    await authService.signOut()
    setSession(null)
    setActiveTab('dashboard')
    setSupportModalOpen(false)
  }

  if (!session) {
    return (
      <div className="auth-page">
        <header className="auth-header">
          <p className="brand">EchoAI</p>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setAuthView(authView === 'signin' ? 'signup' : 'signin')}
          >
            {authView === 'signin' ? 'Create account' : 'Sign in'}
          </button>
        </header>

        <section className="auth-panel">
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
            <form className="auth-form" onSubmit={handleVerifyMfa}>
              <h2>Two-factor verification</h2>
              <p>Enter the one-time code sent to {pendingEmail}.</p>
              <label>
                One-time code
                <input
                  type="text"
                  value={authState.otpCode}
                  onChange={(event) => handleAuthChange('otpCode', event.target.value)}
                  placeholder="123456"
                />
              </label>
              <button type="submit" disabled={authLoading}>
                {authLoading ? 'Verifying...' : 'Verify and continue'}
              </button>
            </form>
          ) : (
            <>
              {authView === 'signin' && (
                <form className="auth-form" onSubmit={handleSignIn}>
                  <h2>Login</h2>
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
      <header className="top-bar">
        <div>
          <p className="brand">EchoAI</p>
          <h1>Campaign command center</h1>
        </div>
        <div className="top-actions">
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
          ['repost', 'Repost Hub'],
          ['scheduler', 'Scheduler'],
          ['assistant', 'AI Studio'],
          ['integrations', 'Integrations'],
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

      <main>
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
                {connectedAccounts.map((account) => (
                  <div key={account.id} className="list-row">
                    <div>
                      <p>{account.platform}</p>
                      <span>{account.accountName}</span>
                    </div>
                    <span className={getStatusBadgeClass(account.status)}>
                      {account.status}
                    </span>
                  </div>
                ))}
              </article>

              <article className="sub-panel tone-sun">
                <h3>Upcoming queue</h3>
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
                  {connectedAccounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      className={
                        composer.channels.includes(account.platform.toLowerCase())
                          ? 'chip active'
                          : 'chip'
                      }
                      onClick={() => toggleChannel(account.platform.toLowerCase())}
                    >
                      {account.platform}
                    </button>
                  ))}
                </div>
              </div>

              <button className="primary-button" type="submit">
                Queue post
              </button>
            </form>

            <article className="sub-panel tone-sun">
              <h3>Scheduled queue</h3>
              {scheduledPosts.map((post) => (
                <div key={post.id} className="list-row">
                  <div>
                    <p>{post.campaign}</p>
                    <span>{post.message}</span>
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
            <h2>AI Message Studio</h2>
            <p className="panel-note">
              Generate marketing copy, image concepts, and app suggestions from a single prompt.
            </p>

            <div className="split">
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
          </section>
        )}

        {activeTab === 'integrations' && (
          <section className="panel panel-integrations">
            <h2>Integrations and 3rd Party Tools</h2>
            <p className="panel-note">
              Extend workflows with sync connectors, webhook triggers, and analytics tools.
            </p>

            <div className="cards">
              {[
                {
                  name: 'Meta Graph API',
                  desc: 'Publish Facebook and Instagram posts, stories, and reels.',
                },
                {
                  name: 'Snap Kit',
                  desc: 'Support Snapchat creative upload and campaign tracking.',
                },
                {
                  name: 'TikTok Business',
                  desc: 'Queue short-form promotions and read ad-level metrics.',
                },
                {
                  name: 'Slack + Teams',
                  desc: 'Send internal deployment alerts to your operations channel.',
                },
                {
                  name: 'Zapier / Make',
                  desc: 'Trigger workflows from CRM updates, forms, and ecommerce events.',
                },
                {
                  name: 'AI Image Tools',
                  desc: 'Connect image generation APIs for campaign graphics at scale.',
                },
              ].map((item) => (
                <article key={item.name} className="integration-card">
                  <h3>{item.name}</h3>
                  <p>{item.desc}</p>
                  <button type="button" className="ghost-button">Connect</button>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'admin' && canViewManagementBoard && (
          <section className="panel panel-admin">
            <h2>IT / Management Oversight</h2>
            <p className="panel-note">
              Monitor incidents, review risk, and resolve technical issues before campaigns fail.
            </p>

            <article className="sub-panel tone-ocean">
              <h3>Employee Search</h3>
              <label>
                Search by name, email, company, or role
                <input
                  type="text"
                  value={employeeSearch}
                  onChange={(event) => {
                    setEmployeeSearch(event.target.value)
                    setEmployeePage(1)
                  }}
                  placeholder="Search employees..."
                />
              </label>
              <div className="admin-controls">
                <label>
                  Sort by
                  <select
                    value={employeeSortBy}
                    onChange={(event) => {
                      setEmployeeSortBy(event.target.value)
                      setEmployeePage(1)
                    }}
                  >
                    <option value="name">Name</option>
                    <option value="email">Email</option>
                    <option value="role">Role</option>
                    <option value="status">Access status</option>
                  </select>
                </label>

                <label>
                  Page size
                  <select
                    value={employeePageSize}
                    onChange={(event) => {
                      setEmployeePageSize(Number(event.target.value))
                      setEmployeePage(1)
                    }}
                  >
                    {[5, 8, 12, 20].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setEmployeeSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
                    setEmployeePage(1)
                  }}
                >
                  Order: {employeeSortOrder === 'asc' ? 'Ascending' : 'Descending'}
                </button>
              </div>
              <p className="muted text-info">Matching employees: {filteredTeamMembers.length}</p>
              <div className="admin-pagination">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setEmployeePage((prev) => Math.max(1, prev - 1))}
                  disabled={currentEmployeePage === 1}
                >
                  Previous
                </button>
                <span>
                  Page {currentEmployeePage} of {totalEmployeePages}
                </span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    setEmployeePage((prev) => Math.min(totalEmployeePages, prev + 1))
                  }
                  disabled={currentEmployeePage >= totalEmployeePages}
                >
                  Next
                </button>
              </div>
            </article>

            {adminError && <p className="auth-message auth-error">{adminError}</p>}

            <article className="sub-panel tone-rose">
              <h3>Issue desk</h3>
              {alerts.map((alert) => (
                <div key={alert.id} className="list-row">
                  <div>
                    <p>{alert.title}</p>
                    <span>{alert.owner}</span>
                  </div>
                  <div className="queue-meta">
                    <span className={getStatusBadgeClass(alert.priority)}>
                      {alert.priority}
                    </span>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => handleResolveAlert(alert.id)}
                      disabled={alert.status === 'resolved'}
                    >
                      {alert.status === 'resolved' ? 'Resolved' : 'Resolve'}
                    </button>
                  </div>
                </div>
              ))}
            </article>

            <article className="sub-panel tone-amber">
              <h3>Account access requests</h3>
              {accessRequests.length === 0 && (
                <p className="muted">No access requests are waiting for review.</p>
              )}

              {accessRequests.map((request) => (
                <div key={request.id} className="list-row">
                  <div>
                    <p>{request.fullName}</p>
                    <span>
                      {request.email} • {request.company || 'No company provided'}
                    </span>
                  </div>
                  <div className="queue-meta">
                    <span
                      className={getStatusBadgeClass(request.status)}
                    >
                      {request.status}
                    </span>
                    {request.status === 'pending' ? (
                      <div className="action-row">
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => handleReviewAccessRequest(request.id, 'approved')}
                          disabled={adminLoading}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleReviewAccessRequest(request.id, 'denied')}
                          disabled={adminLoading}
                        >
                          Deny
                        </button>
                      </div>
                    ) : (
                      <span>{request.reviewedAt ? 'Reviewed' : 'Closed'}</span>
                    )}
                  </div>
                </div>
              ))}
            </article>

            <article className="sub-panel tone-mint">
              <h3>Employee access lifecycle</h3>
              {pagedTeamMembers.length === 0 && (
                <p className="muted">No employee records available.</p>
              )}

              {pagedTeamMembers.map((member) => (
                <div key={member.id} className="list-row">
                  <div>
                    <p>
                      {member.fullName} • {member.role}
                    </p>
                    <span>
                      {member.email} • {member.company || 'No company provided'}
                    </span>
                  </div>
                  <div className="queue-meta">
                    <span
                      className={getStatusBadgeClass(member.accessStatus)}
                    >
                      {member.accessStatus}
                    </span>
                    {member.role === 'admin' ? (
                      <span className="text-info">Admin lock</span>
                    ) : (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => handleToggleUserAccess(member)}
                        disabled={adminLoading}
                      >
                        {member.accessStatus === 'deactivated'
                          ? 'Reactivate account'
                          : 'Deactivate account'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </article>

            {isAdminUser && (
              <article className="sub-panel tone-indigo">
                <h3>Manager / IT Role Access</h3>
                <p className="panel-note">
                  Promote trusted users to Management or IT so they can access this board.
                </p>
                {pagedTeamMembers.map((member) => (
                  <div key={`role-${member.id}`} className="list-row">
                    <div>
                      <p>{member.fullName}</p>
                      <span>{member.email}</span>
                    </div>
                    <div className="queue-meta role-actions">
                      <span className={member.role === 'user' ? 'badge pending' : 'badge info'}>
                        {member.role}
                      </span>
                      <div className="action-row">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleUpdateUserRole(member, 'manager')}
                          disabled={adminLoading || member.role === 'manager'}
                        >
                          Set Manager
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleUpdateUserRole(member, 'it')}
                          disabled={adminLoading || member.role === 'it'}
                        >
                          Set IT
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleUpdateUserRole(member, 'user')}
                          disabled={adminLoading || member.role === 'user'}
                        >
                          Set User
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </article>
            )}
          </section>
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
export default App
