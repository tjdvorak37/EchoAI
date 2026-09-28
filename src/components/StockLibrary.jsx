import { useEffect, useRef, useState } from 'react'
import { Clapperboard, ImageIcon, Layers, Loader2, Music2, Pause, Play, Plus, Search, X } from 'lucide-react'
import { searchMediaLibrary } from '../services/mediaLibraryService'

const CATEGORIES = {
  sound: ['Whoosh', 'Swoosh', 'Impact', 'Riser', 'Pop', 'Click', 'Glitch', 'Notification', 'Applause', 'Laugh', 'Camera shutter', 'Typing'],
  video: ['Transition', 'Light leak', 'Glitch', 'Smoke', 'Particles', 'Ink', 'Countdown', 'Film burn', 'Bokeh', 'Abstract background'],
  image: ['Background', 'Nature', 'Business', 'Food', 'Technology', 'People', 'Texture', 'Abstract', 'Travel', 'Sky', 'Flowers', 'Fitness'],
}

const DEFAULT_QUERY = { sound: 'Whoosh', video: 'Transition', image: 'Background' }

const IMAGE_TYPES = [
  ['all', 'All'],
  ['photo', 'Photos'],
  ['illustration', 'Illustrations'],
  ['vector', 'Vectors'],
]

const QUALITIES = [
  ['uhd', '4K'],
  ['hd', 'HD'],
  ['sd', 'SD'],
]

const formatDuration = (seconds) => {
  if (!seconds) return ''
  if (seconds < 10) return `${seconds.toFixed(1)}s`
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}

const formatSize = (bytes) => (bytes ? `${(bytes / (1024 * 1024)).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB` : '')

export function StockLibrary({ initialKind = 'sound', initialQuery, initialImageType = 'all', kinds = ['sound', 'video'], onClose, onAdd }) {
  const [kind, setKind] = useState(initialKind)
  const [query, setQuery] = useState(initialQuery || DEFAULT_QUERY[initialKind])
  const [imageType, setImageType] = useState(initialImageType)
  const [results, setResults] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [configured, setConfigured] = useState(true)
  const [quality, setQuality] = useState('hd')
  const [addingId, setAddingId] = useState('')
  const [playingId, setPlayingId] = useState('')
  const audioRef = useRef(null)
  const requestRef = useRef(0)
  const searchInputRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  const runSearch = (nextKind, nextQuery, nextPage = 1, nextImageType = imageType) => {
    const requestId = (requestRef.current += 1)
    setLoading(true)
    setError('')
    if (nextPage === 1) setResults([])
    return searchMediaLibrary({ kind: nextKind, query: nextQuery, page: nextPage, imageType: nextImageType })
      .then((data) => {
        if (requestId !== requestRef.current) return
        setConfigured(data.configured !== false)
        setResults((current) => (nextPage === 1 ? data.items : [...current, ...data.items]))
        setHasMore(Boolean(data.hasMore))
        setPage(nextPage)
      })
      .catch((searchError) => {
        if (requestId === requestRef.current) setError(searchError.message)
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false)
      })
  }

  useEffect(() => {
    const requestId = (requestRef.current += 1)
    searchMediaLibrary({ kind: initialKind, query: initialQuery || DEFAULT_QUERY[initialKind], page: 1, imageType: initialImageType })
      .then((data) => {
        if (requestId !== requestRef.current) return
        setConfigured(data.configured !== false)
        setResults(data.items)
        setHasMore(Boolean(data.hasMore))
      })
      .catch((searchError) => {
        if (requestId === requestRef.current) setError(searchError.message)
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false)
      })
    searchInputRef.current?.focus()
    const onKey = (event) => { if (event.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', onKey)
    const audio = audioRef.current
    return () => {
      window.removeEventListener('keydown', onKey)
      audio?.pause()
    }
  }, [initialKind, initialQuery, initialImageType])

  const stopPreview = () => {
    audioRef.current?.pause()
    setPlayingId('')
  }

  const switchKind = (nextKind) => {
    if (nextKind === kind) return
    stopPreview()
    const nextQuery = DEFAULT_QUERY[nextKind]
    setKind(nextKind)
    setQuery(nextQuery)
    runSearch(nextKind, nextQuery)
  }

  const toggleSoundPreview = (item) => {
    const audio = audioRef.current
    if (!audio) return
    if (playingId === item.id) {
      stopPreview()
      return
    }
    audio.src = item.url
    audio.play().then(() => setPlayingId(item.id)).catch(() => setError('This preview could not be played.'))
  }

  const addItem = async (item, option = quality) => {
    setAddingId(item.id)
    setError('')
    try {
      await onAdd(item, option)
      stopPreview()
    } catch (addError) {
      setError(addError.message)
    } finally {
      setAddingId('')
    }
  }

  const renditionFor = (item) => item.renditions?.[quality] ?? item.renditions?.hd ?? item.renditions?.sd ?? null

  return (
    <div className="stock-library-backdrop" onClick={onClose}>
      <aside className="stock-library" role="dialog" aria-modal="true" aria-label="Stock library" onClick={(event) => event.stopPropagation()}>
        <header className="stock-library-head">
          <div>
            <h3>Stock library</h3>
            <p>{kinds.includes('image') ? 'Millions of royalty-free photos, illustrations, and vectors. Use one as your background or add it as a layer.' : 'Royalty-free sound effects and stock videos. Pick one to drop it at the playhead.'}</p>
          </div>
          <button type="button" className="stock-library-close" onClick={onClose} aria-label="Close stock library"><X size={18} /></button>
        </header>

        {kinds.length > 1 && (
          <div className="stock-library-tabs" role="tablist">
            {kinds.includes('sound') && <button type="button" role="tab" aria-selected={kind === 'sound'} className={kind === 'sound' ? 'active' : ''} onClick={() => switchKind('sound')}><Music2 size={15} /> Sound effects</button>}
            {kinds.includes('video') && <button type="button" role="tab" aria-selected={kind === 'video'} className={kind === 'video' ? 'active' : ''} onClick={() => switchKind('video')}><Clapperboard size={15} /> Transitions &amp; stock video</button>}
            {kinds.includes('image') && <button type="button" role="tab" aria-selected={kind === 'image'} className={kind === 'image' ? 'active' : ''} onClick={() => switchKind('image')}><ImageIcon size={15} /> Stock images</button>}
          </div>
        )}

        <form className="stock-library-search" onSubmit={(event) => { event.preventDefault(); stopPreview(); runSearch(kind, query) }}>
          <Search size={16} aria-hidden="true" />
          <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={{ sound: 'Search sounds, e.g. whoosh, door, crowd', video: 'Search videos, e.g. transition, smoke, city', image: 'Search images, e.g. coffee, sunset, office' }[kind]} aria-label="Search the stock library" />
          <button type="submit">Search</button>
        </form>

        {kind === 'image' && configured && (
          <div className="stock-library-quality" role="radiogroup" aria-label="Image type">
            <span>Type</span>
            {IMAGE_TYPES.map(([key, label]) => (
              <button key={key} type="button" role="radio" aria-checked={imageType === key} className={imageType === key ? 'active' : ''} onClick={() => { setImageType(key); runSearch(kind, query, 1, key) }}>{label}</button>
            ))}
          </div>
        )}

        <div className="stock-library-chips">
          {CATEGORIES[kind].map((category) => (
            <button key={category} type="button" className={query.toLowerCase() === category.toLowerCase() ? 'active' : ''} onClick={() => { stopPreview(); setQuery(category); runSearch(kind, category) }}>{category}</button>
          ))}
        </div>

        {kind === 'video' && configured && (
          <div className="stock-library-quality" role="radiogroup" aria-label="Download quality">
            <span>Quality</span>
            {QUALITIES.map(([key, label]) => (
              <button key={key} type="button" role="radio" aria-checked={quality === key} className={quality === key ? 'active' : ''} onClick={() => setQuality(key)}>{label}</button>
            ))}
            <small>4K files are large and take longer to add.</small>
          </div>
        )}

        <div className="stock-library-results">
          {error && <p className="stock-library-error">{error}</p>}
          {!configured && (
            <div className="stock-library-empty">
              <strong>Stock {kind === 'image' ? 'images' : 'videos'} aren&apos;t switched on yet.</strong>
              <p>This library needs a free Pixabay API key. An administrator can add it in IT / Management → Integrations → Stock media library.</p>
            </div>
          )}
          {configured && !loading && !error && results.length === 0 && (
            <div className="stock-library-empty"><strong>No results.</strong><p>Try a broader word like &ldquo;whoosh&rdquo; or &ldquo;transition&rdquo;.</p></div>
          )}

          {kind === 'sound' && (
            <ul className="stock-sound-list">
              {results.map((item) => (
                <li key={item.id} className={playingId === item.id ? 'playing' : ''}>
                  <button type="button" className="stock-play" onClick={() => toggleSoundPreview(item)} aria-label={playingId === item.id ? `Stop ${item.title}` : `Preview ${item.title}`}>
                    {playingId === item.id ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <div className="stock-sound-meta">
                    <strong title={item.title}>{item.title}</strong>
                    <small>{formatDuration(item.duration)} · {item.creator}</small>
                  </div>
                  <button type="button" className="stock-add" disabled={Boolean(addingId)} onClick={() => addItem(item)}>
                    {addingId === item.id ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Add
                  </button>
                </li>
              ))}
            </ul>
          )}

          {kind === 'video' && (
            <div className="stock-video-grid">
              {results.map((item) => {
                const rendition = renditionFor(item)
                return (
                  <article key={item.id} className="stock-video-card">
                    <video
                      src={item.previewUrl}
                      poster={item.thumbnail}
                      muted
                      loop
                      playsInline
                      preload="none"
                      onMouseEnter={(event) => event.currentTarget.play().catch(() => {})}
                      onMouseLeave={(event) => event.currentTarget.pause()}
                    />
                    <div className="stock-video-meta">
                      <strong title={item.title}>{item.title}</strong>
                      <small>{formatDuration(item.duration)}{item.renditions?.uhd ? ' · 4K' : ''}{rendition ? ` · ${formatSize(rendition.size)}` : ''}</small>
                    </div>
                    <button type="button" className="stock-add" disabled={Boolean(addingId) || !rendition} onClick={() => addItem(item)}>
                      {addingId === item.id ? <><Loader2 size={14} className="spin" /> Adding…</> : <><Plus size={14} /> Add{quality === 'uhd' && !item.renditions?.uhd ? ' (HD)' : ''}</>}
                    </button>
                  </article>
                )
              })}
            </div>
          )}

          {kind === 'image' && (
            <div className="stock-image-grid">
              {results.map((item) => (
                <article key={item.id} className="stock-image-card">
                  <img src={item.thumbnail} alt={item.title} loading="lazy" />
                  <div className="stock-video-meta">
                    <strong title={item.title}>{item.title}</strong>
                    <small>{item.width && item.height ? `${item.width}×${item.height}` : ''} · {item.type}</small>
                  </div>
                  <div className="stock-image-actions">
                    {addingId === item.id ? (
                      <span className="stock-library-loading"><Loader2 size={14} className="spin" /> Adding…</span>
                    ) : (
                      <>
                        <button type="button" className="stock-add" disabled={Boolean(addingId)} onClick={() => addItem(item, 'background')} title="Replace the canvas background with this image"><ImageIcon size={13} /> Background</button>
                        <button type="button" className="stock-add stock-add-alt" disabled={Boolean(addingId)} onClick={() => addItem(item, 'layer')} title="Place this image as a movable layer"><Layers size={13} /> Layer</button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {loading && <p className="stock-library-loading"><Loader2 size={16} className="spin" /> Loading…</p>}
          {hasMore && !loading && <button type="button" className="stock-library-more" onClick={() => runSearch(kind, query, page + 1)}>Load more</button>}
        </div>

        <footer className="stock-library-foot">
          {kind === 'sound'
            ? <>Sounds from <a href="https://freesound.org" target="_blank" rel="noreferrer">Freesound</a> via <a href="https://openverse.org" target="_blank" rel="noreferrer">Openverse</a> · CC0, free for commercial use</>
            : <>{kind === 'image' ? 'Images' : 'Videos'} from <a href="https://pixabay.com" target="_blank" rel="noreferrer">Pixabay</a> · free under the Pixabay Content License</>}
        </footer>
        <audio ref={audioRef} onEnded={() => setPlayingId('')} />
      </aside>
    </div>
  )
}
