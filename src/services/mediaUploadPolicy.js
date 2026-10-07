export const MAX_MEDIA_FILE_BYTES = 2 * 1024 * 1024 * 1024
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024
export const VIDEO_MAX_DURATION_SECONDS = 8 * 60
export const INSTAGRAM_REELS_MAX_DURATION_SECONDS = 3 * 60
export const SOCIAL_VIDEO_CLIP_LIMITS = {
  youtube: Number.POSITIVE_INFINITY,
  facebook: 8 * 60,
  instagram: 3 * 60,
}
export const SUPPORTED_MEDIA_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm',
])

export const getVideoTrimProfile = ({ media = [], channels = [] }) => {
  const videos = media.filter((item) => item.type === 'video')
  if (!videos.length) {
    return {
      activeVideo: null,
      maxClipSeconds: null,
      channelLimits: [],
      defaultStart: 0,
      defaultEnd: 0,
    }
  }

  const activeVideo = videos[0]
  const duration = Number(activeVideo.durationSeconds || activeVideo.duration || 0)
  const channelLimits = channels.map((channel) => ({
    channel,
    limit: Number.isFinite(SOCIAL_VIDEO_CLIP_LIMITS[channel]) ? SOCIAL_VIDEO_CLIP_LIMITS[channel] : Infinity,
  }))
  const maxClipSeconds = channelLimits.length
    ? Math.min(...channelLimits.map((entry) => entry.limit))
    : duration || Infinity

  return {
    activeVideo,
    maxClipSeconds: Number.isFinite(maxClipSeconds) ? Math.max(1, Math.min(duration || maxClipSeconds, maxClipSeconds)) : duration || 0,
    channelLimits,
    defaultStart: 0,
    defaultEnd: duration ? Math.min(duration, maxClipSeconds || duration) : 0,
  }
}

export const getVideoTrimForChannel = (video, channel) => {
  const sourceDuration = Math.max(0, Number(video?.durationSeconds || video?.duration || 0))
  const cap = SOCIAL_VIDEO_CLIP_LIMITS[channel] ?? sourceDuration
  const saved = video?.trimByPlatform?.[channel]
  const legacyStart = video?.trimStartSeconds
  const legacyEnd = video?.trimEndSeconds
  const requestedStart = Number(saved?.startSeconds ?? legacyStart ?? 0)
  const startSeconds = Math.min(Math.max(Number.isFinite(requestedStart) ? requestedStart : 0, 0), sourceDuration)
  const requestedEnd = Number(saved?.endSeconds ?? legacyEnd ?? sourceDuration)
  const maximumEnd = Math.min(sourceDuration, startSeconds + cap)
  const endSeconds = Math.max(startSeconds, Math.min(Number.isFinite(requestedEnd) ? requestedEnd : maximumEnd, maximumEnd))
  return { startSeconds, endSeconds, durationSeconds: endSeconds - startSeconds }
}

export const validateMediaFile = ({ file, durationSeconds, availableQuotaBytes }) => {
  if (!file || !SUPPORTED_MEDIA_TYPES.has(file.type)) {
    throw new Error('Use PNG, JPEG, WebP, GIF, MP4, MOV, or WebM media files.')
  }
  if (file.size > MAX_MEDIA_FILE_BYTES) {
    throw new Error('Videos and images can be up to 2 GB per file. Compress or export a smaller copy and try again.')
  }
  if (Number.isFinite(availableQuotaBytes) && file.size > availableQuotaBytes) {
    const remainingMb = Math.max(0, Math.floor(availableQuotaBytes / (1024 * 1024)))
    throw new Error(`This file is larger than your remaining ${remainingMb} MB storage space. Remove unused assets or upgrade your storage plan.`)
  }
  if (file.type.startsWith('video/') && Number.isFinite(durationSeconds) && durationSeconds > VIDEO_MAX_DURATION_SECONDS) {
    throw new Error('Post videos can be up to 8 minutes long. Trim this video and try again.')
  }
}

export const getVideoPostError = ({ media = [], channels = [], supabaseConfigured = false }) => {
  const videos = media.filter((item) => item.type === 'video')
  if (!videos.length) return ''
  const unsupported = channels.filter((channel) => !['facebook', 'instagram', 'youtube'].includes(channel))
  if (unsupported.length) {
    return `Video publishing is available for Facebook video posts, Instagram Reels, and YouTube. Remove video media or deselect ${unsupported.join(', ')}.`
  }
  if (videos.length > 1 || (media.length > 1 && channels.some((channel) => ['facebook', 'instagram'].includes(channel)))) {
    return 'Facebook video posts and Instagram Reels currently support one video per post. Remove extra attachments or publish them separately.'
  }
  const invalidTrim = videos.some((video) => channels.some((channel) => {
    const trim = getVideoTrimForChannel(video, channel)
    return trim.durationSeconds < 1
      || trim.durationSeconds > (SOCIAL_VIDEO_CLIP_LIMITS[channel] ?? VIDEO_MAX_DURATION_SECONDS)
  }))
  if (invalidTrim) {
    return 'Choose a valid trim range for every selected social channel.'
  }
  if (supabaseConfigured && videos.some((video) => !video.storagePath)) {
    return 'Re-upload the video to workspace storage before scheduling it.'
  }
  return ''
}

export const getImagePostError = ({ media = [], channels = [], supabaseConfigured = false }) => {
  const images = media.filter((item) => item.type === 'image')
  if (!images.length) return ''

  const unsupported = channels.filter((channel) => !['facebook', 'instagram'].includes(channel))
  if (unsupported.length) {
    return `Image publishing is available for Facebook and Instagram. Remove image media or deselect ${unsupported.join(', ')}.`
  }
  if (images.length > 1) {
    return 'Facebook and Instagram currently support one image per post. Remove extra image attachments or publish them separately.'
  }
  if (supabaseConfigured && channels.some((channel) => {
    const image = images[0]
    return channel === 'facebook'
      ? !image.storagePath
      : channel === 'instagram' && !image.storagePath && !image.webUrl
  })) {
    return 'Re-upload the image to workspace storage before scheduling it.'
  }
  return ''
}
