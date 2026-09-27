-- Allow longer, higher-bitrate social videos; project-level storage limits still apply.
update storage.buckets
set file_size_limit = 2147483648,
    allowed_mime_types = array[
      'image/png', 'image/jpeg', 'image/webp', 'image/gif',
      'video/mp4', 'video/quicktime', 'video/webm'
    ]
where id = 'social-media';
