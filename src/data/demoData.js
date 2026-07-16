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
