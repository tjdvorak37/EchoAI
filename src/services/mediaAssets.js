export const removeStoredAsset = async ({ asset, storageClient }) => {
  const storagePath = typeof asset?.storagePath === 'string' ? asset.storagePath.trim() : ''
  if (!storagePath) {
    return { removed: false, skipped: true }
  }

  if (!storageClient || typeof storageClient.from !== 'function') {
    return { removed: false, skipped: true }
  }

  const { error } = await storageClient.from('social-media').remove([storagePath])
  if (error) {
    throw new Error(error.message || 'Unable to remove the stored media file.')
  }

  return { removed: true, skipped: false }
}
