import demoPosterImage from '../assets/demo-poster.svg'

export const postTypeChips = [
  'Social calendar planning',
  'Post creation',
  'Caption writing',
  'Asset production',
  'Competitor tracking',
  'Performance reporting',
  'Page optimization',
  'Promotion reminders',
]

export const starterStats = [
  { label: 'Engagement growth', value: '+18.4%' },
  { label: 'Queued posts', value: '12' },
  { label: 'Connected channels', value: '4' },
  { label: 'Delivery success', value: '99.2%' },
]

export const connectedAccountsSeed = [
  {
    id: 'acc_1',
    platform: 'Instagram',
    accountName: '@echo.fashion',
    status: 'healthy',
  },
  {
    id: 'acc_2',
    platform: 'Facebook',
    accountName: 'Echo Fashion Co.',
    status: 'healthy',
  },
  {
    id: 'acc_3',
    platform: 'Snapchat',
    accountName: 'Echo Stories',
    status: 'token refresh due',
  },
  {
    id: 'acc_4',
    platform: 'TikTok',
    accountName: '@echo.launches',
    status: 'healthy',
  },
  {
    id: 'acc_5',
    platform: 'X',
    accountName: '@echo_brand',
    status: 'healthy',
  },
]

export const scheduledPostsSeed = [
  {
    id: 'post_101',
    campaign: 'Morning Promo Blast',
    message: 'Weekend drop is live. Tap in before noon for early access.',
    channels: ['instagram', 'facebook'],
    scheduledAt: '2026-07-16T09:00:00',
    status: 'scheduled',
  },
  {
    id: 'post_102',
    campaign: 'Feature Spotlight',
    message: 'New product demo at 1 PM. Save your seat now.',
    channels: ['tiktok', 'snapchat'],
    scheduledAt: '2026-07-16T13:00:00',
    status: 'scheduled',
  },
  {
    id: 'post_103',
    campaign: 'Evening Reminder',
    message: 'Last call on summer bundles. Offer ends at midnight.',
    channels: ['instagram', 'facebook', 'tiktok'],
    scheduledAt: '2026-07-16T19:30:00',
    status: 'scheduled',
  },
]

export const aiPromptIdeas = [
  'Create 3 Instagram captions for a weekend sale with urgency and energy.',
  'Write a Facebook reminder for a flash sale ending tonight at midnight.',
  'Draft Snapchat copy for a behind-the-scenes product reveal.',
]

export const adminAlerts = [
  {
    id: 'issue_1',
    title: 'Snapchat token refresh failed',
    owner: 'IT Ops',
    priority: 'high',
    status: 'open',
  },
  {
    id: 'issue_2',
    title: 'Delayed publish on Facebook campaign #3491',
    owner: 'Campaign QA',
    priority: 'medium',
    status: 'open',
  },
  {
    id: 'issue_3',
    title: 'Customer requested billing audit export',
    owner: 'Management',
    priority: 'medium',
    status: 'open',
  },
]

export const accessRequestsSeed = [
  {
    id: 'req_1001',
    userId: 'demo-user-2',
    fullName: 'Jordan Lee',
    email: 'jordan@company.com',
    company: 'EchoAI Media',
    status: 'pending',
    requestedAt: '2026-07-16T08:45:00',
    reviewedAt: null,
  },
]

export const teamMembersSeed = [
  {
    id: 'demo-admin-1',
    fullName: 'Admin User',
    email: 'admin@company.com',
    company: 'EchoAI Media',
    role: 'admin',
    accessStatus: 'active',
  },
  {
    id: 'demo-user-2',
    fullName: 'Jordan Lee',
    email: 'jordan@company.com',
    company: 'EchoAI Media',
    role: 'user',
    accessStatus: 'pending',
  },
]

export const companySocialAccountsSeed = [
  {
    id: 'corp_acc_1',
    companyName: 'Nike',
    platform: 'Instagram',
    accountName: '@nike',
  },
  {
    id: 'corp_acc_2',
    companyName: 'Nike',
    platform: 'TikTok',
    accountName: '@nike',
  },
  {
    id: 'corp_acc_3',
    companyName: 'Nike',
    platform: 'Facebook',
    accountName: 'Nike',
  },
]

export const companyMainPostsSeed = [
  {
    id: 'corp_post_1',
    companyName: 'Nike',
    title: 'Summer Flyer Drop',
    content: 'Summer flyer is now live. Save 20% on selected running shoes through Sunday.',
    channels: ['instagram', 'facebook'],
    publishedAt: '2026-07-16T08:30:00',
  },
  {
    id: 'corp_post_2',
    companyName: 'Nike',
    title: 'Weekend Event Reminder',
    content: 'Join us Saturday at 10 AM for an in-store athlete clinic and exclusive giveaway.',
    channels: ['instagram', 'tiktok'],
    publishedAt: '2026-07-16T11:00:00',
  },
]

export const repostQueueSeed = [
  {
    id: 'queue_1',
    companyPostId: 'corp_post_1',
    status: 'pending',
    queuedAt: '2026-07-16T09:10:00',
    decisionAt: null,
  },
]

export const userRepostsSeed = [
  {
    id: 'repost_1',
    companyPostId: 'corp_post_2',
    status: 'posted',
    caption:
      'Reposted by alex.rivera: Join us Saturday at 10 AM for an in-store athlete clinic and exclusive giveaway.',
    postedAt: '2026-07-16T11:15:00',
  },
]

export const workspaceFoldersSeed = [
  {
    id: 'folder-root',
    name: 'My workspace',
    parentId: null,
    createdAt: '2026-07-16T08:00:00',
  },
  {
    id: 'folder-ideas',
    name: 'Reel ideas',
    parentId: 'folder-root',
    createdAt: '2026-07-16T08:15:00',
  },
]

export const workspaceAssetsSeed = [
  {
    id: 'asset-hero',
    name: 'Hero clip.mp4',
    type: 'video',
    mime: 'video/mp4',
    size: 3_480_000,
    folderId: 'folder-root',
    createdAt: '2026-07-16T08:05:00',
    previewUrl: '',
    summary: 'Launch teaser clip',
  },
  {
    id: 'asset-poster',
    name: 'Spring flyer.png',
    type: 'image',
    mime: 'image/png',
    size: 840_000,
    folderId: 'folder-root',
    createdAt: '2026-07-16T08:10:00',
    previewUrl: demoPosterImage,
    summary: 'Brand visual for the campaign',
  },
  {
    id: 'asset-pitch',
    name: 'Launch brief.pdf',
    type: 'document',
    mime: 'application/pdf',
    size: 640_000,
    folderId: 'folder-ideas',
    createdAt: '2026-07-16T08:20:00',
    previewUrl: '',
    summary: 'Talking points for the reel',
  },
]

export const licensesSeed = [
  {
    id: 'lic-001',
    userId: 'demo-admin-1',
    userEmail: 'admin@company.com',
    userFullName: 'Admin User',
    plan: 'annual',
    priceUsd: 120,
    storageLimitGb: 2,
    status: 'active',
    purchasedAt: '2026-01-01T09:00:00',
    expiresAt: '2027-01-01T09:00:00',
    venmoTxnId: 'venmo-txn-9001',
    paymentConfirmed: true,
    notes: '',
  },
  {
    id: 'lic-002',
    userId: 'demo-user-3',
    userEmail: 'taylor@company.com',
    userFullName: 'Taylor Morgan',
    plan: 'monthly',
    priceUsd: 15,
    storageLimitGb: 2,
    status: 'active',
    purchasedAt: '2026-07-01T10:15:00',
    expiresAt: '2026-08-01T10:15:00',
    venmoTxnId: 'venmo-txn-9002',
    paymentConfirmed: true,
    notes: '',
  },
  {
    id: 'lic-003',
    userId: 'pending-001',
    userEmail: 'newuser@gmail.com',
    userFullName: 'Casey Brooks',
    plan: 'monthly',
    priceUsd: 15,
    storageLimitGb: 2,
    status: 'pending_payment',
    purchasedAt: '2026-08-04T14:30:00',
    expiresAt: null,
    venmoTxnId: '',
    paymentConfirmed: false,
    notes: 'Awaiting Venmo payment confirmation',
  },
  {
    id: 'lic-004',
    userId: 'expired-001',
    userEmail: 'olduser@gmail.com',
    userFullName: 'Drew Hassan',
    plan: 'monthly',
    priceUsd: 15,
    storageLimitGb: 2,
    status: 'expired',
    purchasedAt: '2026-06-01T09:00:00',
    expiresAt: '2026-07-01T09:00:00',
    venmoTxnId: 'venmo-txn-8899',
    paymentConfirmed: true,
    notes: 'Did not renew',
  },
]

export const supportTicketsSeed = [
  {
    id: 'tkt-001',
    subject: 'Cannot upload videos over 50 MB',
    category: 'Technical issue',
    priority: 'high',
    status: 'open',
    userId: 'demo-user-3',
    userEmail: 'taylor@company.com',
    userFullName: 'Taylor Morgan',
    createdAt: '2026-08-03T11:22:00',
    updatedAt: '2026-08-03T11:22:00',
    messages: [
      {
        id: 'msg-001',
        author: 'Taylor Morgan',
        role: 'user',
        body: 'When I try to upload a file larger than 50 MB I get a quota error even though my plan says 2 GB.',
        sentAt: '2026-08-03T11:22:00',
      },
    ],
  },
  {
    id: 'tkt-002',
    subject: 'Billing question about annual renewal',
    category: 'Billing',
    priority: 'medium',
    status: 'open',
    userId: 'demo-admin-1',
    userEmail: 'admin@company.com',
    userFullName: 'Admin User',
    createdAt: '2026-08-02T09:00:00',
    updatedAt: '2026-08-02T09:00:00',
    messages: [
      {
        id: 'msg-002',
        author: 'Admin User',
        role: 'user',
        body: 'When will my annual license auto-renew and will I receive an invoice?',
        sentAt: '2026-08-02T09:00:00',
      },
    ],
  },
  {
    id: 'tkt-003',
    subject: 'Snapchat integration not connecting',
    category: 'Integration',
    priority: 'medium',
    status: 'resolved',
    userId: 'demo-user-3',
    userEmail: 'taylor@company.com',
    userFullName: 'Taylor Morgan',
    createdAt: '2026-07-28T14:10:00',
    updatedAt: '2026-07-29T09:00:00',
    messages: [
      {
        id: 'msg-003',
        author: 'Taylor Morgan',
        role: 'user',
        body: 'Snapchat shows "token refresh due" and I cannot re-authenticate.',
        sentAt: '2026-07-28T14:10:00',
      },
      {
        id: 'msg-004',
        author: 'Admin User',
        role: 'admin',
        body: 'Token has been refreshed from our end. Please try disconnecting and reconnecting your Snapchat account.',
        sentAt: '2026-07-29T09:00:00',
      },
    ],
  },
]

export const purchaseHistorySeed = [
  {
    id: 'pmt-001',
    licenseId: 'lic-001',
    userEmail: 'admin@company.com',
    userFullName: 'Admin User',
    plan: 'annual',
    amountUsd: 120,
    method: 'Venmo',
    venmoTxnId: 'venmo-txn-9001',
    status: 'confirmed',
    paidAt: '2026-01-01T09:00:00',
  },
  {
    id: 'pmt-002',
    licenseId: 'lic-002',
    userEmail: 'taylor@company.com',
    userFullName: 'Taylor Morgan',
    plan: 'monthly',
    amountUsd: 15,
    method: 'Venmo',
    venmoTxnId: 'venmo-txn-9002',
    status: 'confirmed',
    paidAt: '2026-07-01T10:15:00',
  },
  {
    id: 'pmt-003',
    licenseId: 'lic-003',
    userEmail: 'newuser@gmail.com',
    userFullName: 'Casey Brooks',
    plan: 'monthly',
    amountUsd: 15,
    method: 'Venmo',
    venmoTxnId: '',
    status: 'pending',
    paidAt: null,
  },
]

export const siteFeatureFlagsSeed = [
  { id: 'ff-video-studio', label: 'Video Studio', description: 'Timeline-based video editor', enabled: true },
  { id: 'ff-ai-assistant', label: 'AI Assistant', description: 'AI caption and content generation', enabled: true },
  { id: 'ff-repost-hub', label: 'Repost Hub', description: 'Company post rebroadcast system', enabled: true },
  { id: 'ff-scheduler', label: 'Scheduler', description: 'Post scheduling and calendar', enabled: true },
  { id: 'ff-integrations', label: 'Integrations', description: '3rd party connector marketplace', enabled: true },
  { id: 'ff-screen-record', label: 'Screen Recording', description: 'Capture screen video for reels', enabled: true },
  { id: 'ff-analytics', label: 'Advanced Analytics', description: 'Detailed post performance reports', enabled: false },
]

export const promoCodesSeed = [
  {
    id: 'promo-001',
    code: 'ECHO-FREE30',
    description: 'Free 30-day trial for new users',
    createdAt: '2026-08-01T09:00:00',
    expiresAt: null,
    maxUses: null,
    usedCount: 0,
    usedBy: [],
    active: true,
    createdBy: 'admin@company.com',
  },
  {
    id: 'promo-002',
    code: 'LAUNCH2026',
    description: 'Launch week promotion',
    createdAt: '2026-08-01T09:00:00',
    expiresAt: '2026-09-01T00:00:00',
    maxUses: 50,
    usedCount: 3,
    usedBy: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
    active: true,
    createdBy: 'admin@company.com',
  },
  {
    id: 'promo-003',
    code: 'PARTNER-VIP',
    description: 'Partner referral code',
    createdAt: '2026-07-15T09:00:00',
    expiresAt: '2026-08-01T00:00:00',
    maxUses: 10,
    usedCount: 10,
    usedBy: [],
    active: false,
    createdBy: 'admin@company.com',
  },
]

export const expensesSeed = [
  { id: 'exp-001', category: 'Hosting', vendor: 'DigitalOcean', description: 'App server + DB', amountUsd: 48, date: '2026-08-01', recurring: true, recurringPeriod: 'monthly', status: 'paid' },
  { id: 'exp-002', category: 'Hosting', vendor: 'Cloudflare', description: 'CDN + DNS', amountUsd: 20, date: '2026-08-01', recurring: true, recurringPeriod: 'monthly', status: 'paid' },
  { id: 'exp-003', category: 'Marketing', vendor: 'Meta Ads', description: 'Instagram & Facebook ad spend', amountUsd: 150, date: '2026-08-03', recurring: false, recurringPeriod: null, status: 'paid' },
  { id: 'exp-004', category: 'Software', vendor: 'Supabase', description: 'Pro database plan', amountUsd: 25, date: '2026-08-01', recurring: true, recurringPeriod: 'monthly', status: 'paid' },
  { id: 'exp-005', category: 'Legal', vendor: 'LegalZoom', description: 'Terms of service update', amountUsd: 200, date: '2026-07-20', recurring: false, recurringPeriod: null, status: 'paid' },
  { id: 'exp-006', category: 'Marketing', vendor: 'TikTok Ads', description: 'TikTok campaign spend', amountUsd: 80, date: '2026-08-04', recurring: false, recurringPeriod: null, status: 'pending' },
]

export const payrollSeed = [
  {
    id: 'pr-001', name: 'Jordan Lee', email: 'jordan@company.com',
    type: 'employee', jobTitle: 'Full-Stack Developer',
    grossPayUsd: 4500, taxWithheldUsd: 990, netPayUsd: 3510,
    payPeriod: 'monthly', lastPaidDate: '2026-08-01',
    ytdGrossUsd: 36000, ytdTaxUsd: 7920,
    status: 'active', notes: '',
  },
  {
    id: 'pr-002', name: 'Morgan Ellis', email: 'morgan@company.com',
    type: 'partner', jobTitle: 'Design Partner',
    grossPayUsd: 1200, taxWithheldUsd: 0, netPayUsd: 1200,
    payPeriod: 'monthly', lastPaidDate: '2026-08-01',
    ytdGrossUsd: 9600, ytdTaxUsd: 0,
    status: 'active', notes: 'Issues own invoices — no withholding',
  },
  {
    id: 'pr-003', name: 'Alex Torres', email: 'alex@company.com',
    type: 'contractor', jobTitle: 'Marketing Contractor',
    grossPayUsd: 800, taxWithheldUsd: 0, netPayUsd: 800,
    payPeriod: 'monthly', lastPaidDate: '2026-07-15',
    ytdGrossUsd: 4800, ytdTaxUsd: 0,
    status: 'active', notes: '1099 contractor',
  },
]

export const taxRecordsSeed = [
  { id: 'tax-001', category: 'Federal Income Tax', period: 'Q2 2026', estimatedUsd: 480, paidUsd: 480, dueDate: '2026-07-15', filedDate: '2026-07-12', status: 'paid' },
  { id: 'tax-002', category: 'Self-Employment Tax', period: 'Q2 2026', estimatedUsd: 210, paidUsd: 210, dueDate: '2026-07-15', filedDate: '2026-07-12', status: 'paid' },
  { id: 'tax-003', category: 'Federal Income Tax', period: 'Q3 2026', estimatedUsd: 520, paidUsd: 0, dueDate: '2026-09-15', filedDate: null, status: 'pending' },
  { id: 'tax-004', category: 'Self-Employment Tax', period: 'Q3 2026', estimatedUsd: 230, paidUsd: 0, dueDate: '2026-09-15', filedDate: null, status: 'pending' },
  { id: 'tax-005', category: 'State Income Tax', period: 'Q3 2026', estimatedUsd: 160, paidUsd: 0, dueDate: '2026-09-15', filedDate: null, status: 'pending' },
  { id: 'tax-006', category: 'Sales Tax', period: 'Aug 2026', estimatedUsd: 0, paidUsd: 0, dueDate: '2026-09-20', filedDate: null, status: 'exempt', notes: 'SaaS exempt in most states — verify by state' },
]

export const refundsSeed = [
  { id: 'ref-001', licenseId: 'lic-002', userEmail: 'taylor@company.com', userFullName: 'Taylor Morgan', amountUsd: 15, reason: 'Requested cancellation within 3 days', requestedAt: '2026-08-04T09:00:00', status: 'pending', processedAt: null, notes: '' },
  { id: 'ref-002', licenseId: 'lic-004', userEmail: 'olduser@gmail.com', userFullName: 'Drew Hassan', amountUsd: 15, reason: 'Account expired — prorated refund requested', requestedAt: '2026-07-28T14:00:00', status: 'approved', processedAt: '2026-07-29T10:00:00', notes: 'Processed via Venmo' },
]

export const financialTasksSeed = [
  { id: 'ftask-001', title: 'File Q3 estimated tax payment', category: 'Taxes', dueDate: '2026-09-15', priority: 'high', status: 'open', notes: 'Federal + State + SE tax' },
  { id: 'ftask-002', title: 'Follow up on pending Venmo payment — Casey Brooks', category: 'Collections', dueDate: '2026-08-10', priority: 'high', status: 'open', notes: 'License lic-003 awaiting confirmation' },
  { id: 'ftask-003', title: 'Review August ad spend vs. ROI', category: 'Marketing', dueDate: '2026-08-31', priority: 'medium', status: 'open', notes: '' },
  { id: 'ftask-004', title: 'Send pay stubs to Jordan Lee', category: 'Payroll', dueDate: '2026-08-05', priority: 'medium', status: 'done', notes: '' },
  { id: 'ftask-005', title: 'Renew Cloudflare domain', category: 'Hosting', dueDate: '2026-10-01', priority: 'low', status: 'open', notes: 'Annual renewal' },
]
