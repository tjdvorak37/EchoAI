import { Upload } from 'tus-js-client'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { RESUMABLE_UPLOAD_THRESHOLD_BYTES } from './mediaUploadPolicy.js'

export { INSTAGRAM_REELS_MAX_DURATION_SECONDS, MAX_MEDIA_FILE_BYTES, VIDEO_MAX_DURATION_SECONDS, validateMediaFile } from './mediaUploadPolicy.js'

export const MEDIA_BUCKET = 'social-media'

const safeObjectName = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100)

export const getVideoDuration = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.onloadedmetadata = () => {
    URL.revokeObjectURL(url)
    resolve(video.duration)
  }
  video.onerror = () => {
    URL.revokeObjectURL(url)
    reject(new Error('This video could not be read. Try an MP4 or MOV file.'))
  }
  video.src = url
})

const uploadResumable = async (file, storagePath, onProgress) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sign in before uploading media.')
  const baseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!baseUrl || !apiKey) throw new Error('Resumable uploads need a configured Supabase project.')

  return new Promise((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${baseUrl}/storage/v1/upload/resumable`,
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'false',
      },
      metadata: {
        bucketName: MEDIA_BUCKET,
        objectName: storagePath,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      onError: (error) => {
        if (/exceed|too large|payload|limit/i.test(error.message)) {
          reject(new Error('The storage service rejected this file size. This project allows up to 2 GB per media file; check the Supabase project storage limit.'))
          return
        }
        reject(new Error(`Upload failed: ${error.message}`))
      },
      onProgress: (sent, total) => onProgress?.(total ? sent / total : 0),
      onSuccess: () => resolve(storagePath),
    })
    upload.start()
  })
}

export const uploadMediaFile = async ({ file, userId, onProgress }) => {
  if (!isSupabaseConfigured) return ''
  if (!userId) throw new Error('Sign in before uploading media.')
  const storagePath = `${userId}/${crypto.randomUUID()}-${safeObjectName(file.name)}`
  if (file.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES) {
    return uploadResumable(file, storagePath, onProgress)
  }
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(storagePath, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) throw new Error(error.message)
  onProgress?.(1)
  return storagePath
}

export const makeMediaPreview = ({ file, useEphemeralUrl = false }) => {
  if (useEphemeralUrl || file.type.startsWith('video/') || file.size > 4 * 1024 * 1024) {
    return URL.createObjectURL(file)
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read the selected image.'))
    reader.readAsDataURL(file)
  })
}

export const createTrimmedVideoClip = async (sourceFile, { startSeconds = 0, endSeconds = null } = {}) => {
  if (!sourceFile || !sourceFile.type.startsWith('video/')) {
    throw new Error('Only video files can be clipped.')
  }

  const url = URL.createObjectURL(sourceFile)
  const video = document.createElement('video')
  video.src = url
  video.muted = false
  video.volume = 0
  video.playsInline = true
  video.preload = 'auto'

  let stream
  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('This video could not be read for clipping.'))
    })

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
    const trimStart = Math.max(0, Number(startSeconds) || 0)
    const trimEnd = Number.isFinite(endSeconds) && endSeconds !== null
      ? Math.min(Math.max(Number(endSeconds), trimStart + 0.1), duration || Number(endSeconds))
      : duration

    const actualEnd = Math.max(trimStart + 0.1, Math.min(trimEnd, duration || trimEnd))
    const capture = video.captureStream || video.mozCaptureStream
    if (!capture) throw new Error('This browser cannot create a trimmed video with audio. Try current Chrome, Firefox, or Safari.')
    stream = capture.call(video)
    if (!stream.getVideoTracks().length) throw new Error('The browser could not capture the video stream.')
    const mimeType = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ].find((type) => MediaRecorder.isTypeSupported(type))
    if (!mimeType) throw new Error('This browser cannot encode a trimmed video. Try a current Chrome, Firefox, or Safari browser.')
    const recorder = new MediaRecorder(stream, { mimeType })
    const chunks = []

    await new Promise((resolve, reject) => {
      let stopped = false
      let safetyTimer
      const stopRecording = () => {
        if (stopped) return
        stopped = true
        clearTimeout(safetyTimer)
        video.pause()
        if (recorder.state === 'recording') recorder.stop()
      }
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data)
      }
      recorder.onerror = () => reject(new Error('The browser could not record the trimmed clip.'))
      recorder.onstop = () => resolve()
      const handleSeek = async () => {
        video.removeEventListener('seeked', handleSeek)
        try {
          recorder.start(500)
          safetyTimer = setTimeout(stopRecording, Math.max(5000, (actualEnd - trimStart) * 1000 + 5000))
          await video.play()
        } catch (error) {
          stopRecording()
          reject(new Error(`Could not play the source while creating its trimmed clip: ${error.message}`))
        }
      }
      const handleTimeUpdate = () => {
        if (video.currentTime >= actualEnd || video.ended) stopRecording()
      }
      video.addEventListener('timeupdate', handleTimeUpdate)
      video.addEventListener('seeked', handleSeek, { once: true })
      video.currentTime = trimStart
      if (Math.abs(video.currentTime - trimStart) < 0.01 && video.readyState >= 2) void handleSeek()
    })

    if (!chunks.length) throw new Error('The browser produced an empty trimmed clip.')
    return new File(chunks, `${sourceFile.name.replace(/\.[^.]+$/, '')}-trimmed.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`, { type: mimeType.split(';')[0] })
  } finally {
    video.pause()
    stream?.getTracks().forEach((track) => track.stop())
    URL.revokeObjectURL(url)
  }
}
