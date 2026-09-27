import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_MEDIA_FILE_BYTES,
  VIDEO_MAX_DURATION_SECONDS,
  INSTAGRAM_REELS_MAX_DURATION_SECONDS,
  getVideoTrimForChannel,
  getVideoPostError,
  validateMediaFile,
} from './mediaUploadPolicy.js'

const file = (type, size = 1024) => ({ type, size, name: 'media' })

test('accepts videos through eight minutes within remaining quota', () => {
  assert.doesNotThrow(() => validateMediaFile({
    file: file('video/mp4', 100 * 1024 * 1024),
    durationSeconds: VIDEO_MAX_DURATION_SECONDS,
    availableQuotaBytes: 200 * 1024 * 1024,
  }))
})

test('rejects videos longer than eight minutes with a clear message', () => {
  assert.throws(() => validateMediaFile({
    file: file('video/mp4'),
    durationSeconds: VIDEO_MAX_DURATION_SECONDS + 1,
    availableQuotaBytes: 1024,
  }), /up to 8 minutes/)
})

test('allows a media file up to two GiB and rejects larger files', () => {
  assert.doesNotThrow(() => validateMediaFile({
    file: file('video/mp4', MAX_MEDIA_FILE_BYTES),
    durationSeconds: 30,
    availableQuotaBytes: MAX_MEDIA_FILE_BYTES,
  }))
  assert.throws(() => validateMediaFile({
    file: file('video/mp4', MAX_MEDIA_FILE_BYTES + 1),
    durationSeconds: 30,
    availableQuotaBytes: MAX_MEDIA_FILE_BYTES * 2,
  }), /up to 2 GB per file/)
})

test('preserves the user storage quota when the file itself is otherwise valid', () => {
  assert.throws(() => validateMediaFile({
    file: file('video/mp4', 50 * 1024 * 1024),
    durationSeconds: 60,
    availableQuotaBytes: 10 * 1024 * 1024,
  }), /remaining 10 MB storage space/)
})

test('rejects unsupported file types before storage upload', () => {
  assert.throws(() => validateMediaFile({
    file: file('video/avi'),
    durationSeconds: 60,
    availableQuotaBytes: MAX_MEDIA_FILE_BYTES,
  }), /PNG, JPEG, WebP, GIF, MP4, MOV, or WebM/)
})

test('allows an eight-minute stored video to YouTube and Facebook', () => {
  assert.equal(getVideoPostError({
    media: [{ type: 'video', durationSeconds: VIDEO_MAX_DURATION_SECONDS, size: 300_000_000, storagePath: 'user/clip.mp4' }],
    channels: ['youtube', 'facebook'],
    supabaseConfigured: true,
  }), '')
})

test('defaults a multi-social source to independent full / 8-minute / 3-minute clips', () => {
  const source = { type: 'video', durationSeconds: 480 }
  assert.deepEqual(getVideoTrimForChannel(source, 'youtube'), { startSeconds: 0, endSeconds: 480, durationSeconds: 480 })
  assert.deepEqual(getVideoTrimForChannel(source, 'facebook'), { startSeconds: 0, endSeconds: 480, durationSeconds: 480 })
  assert.deepEqual(getVideoTrimForChannel(source, 'instagram'), { startSeconds: 0, endSeconds: 180, durationSeconds: 180 })
})

test('independent user trims retain their own starts and respect each destination cap', () => {
  const source = {
    type: 'video',
    durationSeconds: 480,
    trimByPlatform: {
      youtube: { startSeconds: 12, endSeconds: 400 },
      facebook: { startSeconds: 60, endSeconds: 500 },
      instagram: { startSeconds: 30, endSeconds: 250 },
    },
  }
  assert.deepEqual(getVideoTrimForChannel(source, 'youtube'), { startSeconds: 12, endSeconds: 400, durationSeconds: 388 })
  assert.deepEqual(getVideoTrimForChannel(source, 'facebook'), { startSeconds: 60, endSeconds: 480, durationSeconds: 420 })
  assert.deepEqual(getVideoTrimForChannel(source, 'instagram'), { startSeconds: 30, endSeconds: 210, durationSeconds: 180 })
})

test('allows a long source when its Instagram trim is within the Reel limit', () => {
  assert.equal(getVideoPostError({
    media: [{ type: 'video', durationSeconds: 480, trimByPlatform: { instagram: { startSeconds: 0, endSeconds: 180 } }, storagePath: 'user/clip.mp4' }],
    channels: ['instagram', 'facebook', 'youtube'],
    supabaseConfigured: true,
  }), '')
})

test('automatically caps Instagram trims while still accepting an eight-minute source', () => {
  const video = { type: 'video', durationSeconds: 480, trimByPlatform: { instagram: { startSeconds: 0, endSeconds: INSTAGRAM_REELS_MAX_DURATION_SECONDS + 1 } }, storagePath: 'user/clip.mp4' }
  assert.equal(getVideoTrimForChannel(video, 'instagram').durationSeconds, INSTAGRAM_REELS_MAX_DURATION_SECONDS)
  assert.equal(getVideoPostError({ media: [video], channels: ['instagram'], supabaseConfigured: true }), '')

  const unsupportedError = getVideoPostError({
    media: [{ type: 'video', durationSeconds: 30, storagePath: 'user/clip.mp4' }],
    channels: ['linkedin'],
    supabaseConfigured: true,
  })
  assert.match(unsupportedError, /Facebook video posts, Instagram Reels, and YouTube/)
})
