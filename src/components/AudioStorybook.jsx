import { useState, useEffect, useRef, useCallback } from 'react'
import '../styles/AudioStorybook.css'

function generateCoverArt(book) {
  const title = book.title || 'Audiobook'
  const charCode = title.charCodeAt(0) + (title.charCodeAt(1) || 0)
  const themes = [
    { bg1: '#1a1a2e', bg2: '#16213e', accent: '#e94560', glow: '#ff6b9d' },
    { bg1: '#0f0f23', bg2: '#1a1a3e', accent: '#ffd700', glow: '#ffed4a' },
    { bg1: '#0a1628', bg2: '#1c3a5e', accent: '#4ecdc4', glow: '#7ee8e2' },
    { bg1: '#1a0a1a', bg2: '#3d1f3d', accent: '#f4a261', glow: '#ffc078' },
    { bg1: '#0d1117', bg2: '#161b22', accent: '#58a6ff', glow: '#79c0ff' },
    { bg1: '#1a1625', bg2: '#2d2640', accent: '#bb86fc', glow: '#d4b5ff' },
    { bg1: '#0a192f', bg2: '#112240', accent: '#64ffda', glow: '#9efff1' },
    { bg1: '#1f1c2c', bg2: '#302b63', accent: '#ff6b6b', glow: '#ff9999' },
  ]
  return themes[charCode % themes.length]
}

// Resolve the archive ID from a book object (handles all source shapes)
function resolveArchiveId(book) {
  if (book.archiveId) return book.archiveId
  if (book.id?.startsWith('archive-') && book.infoLink) return book.infoLink.split('/').pop()
  if (book.id?.startsWith('librivox-')) return book.id.replace('librivox-', '')
  if (book.source === 'LibriVox' && book.infoLink) return book.infoLink.split('/').pop()
  return null
}

function AudioStorybook({ book, onBack }) {
  const [currentChapter, setCurrentChapter] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [chapters, setChapters] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)   // null | 'no_audio' | 'restricted' | 'network'
  const [volume, setVolume] = useState(1)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showChapters, setShowChapters] = useState(false)
  const [audioLoading, setAudioLoading] = useState(false)
  const [chapterErrors, setChapterErrors] = useState({}) // index → true if broken

  const audioRef = useRef(null)
  const progressRef = useRef(null)
  const API_BASE = import.meta.env.VITE_API_BASE || ''

  const theme = generateCoverArt(book)

  // ── Load chapters via /api/audio/resolve ──────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setChapters([])
    setCurrentChapter(0)
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)
    setChapterErrors({})

    const archiveId = resolveArchiveId(book)
    const title = book.title || ''

    if (!archiveId && !title) {
      setLoading(false)
      setLoadError('no_audio')
      return
    }

    const params = new URLSearchParams()
    if (archiveId) params.set('archiveId', archiveId)
    if (title) params.set('title', title)

    fetch(`${API_BASE}/api/audio/resolve?${params}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => {
        if (cancelled) return
        if (data.restricted) {
          setLoadError('restricted')
        } else if (!data.chapters || data.chapters.length === 0) {
          setLoadError('no_audio')
        } else {
          setChapters(data.chapters)
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError('network')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [API_BASE, book])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); togglePlay() }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); skipTime(-15) }
      if (e.key === 'ArrowRight') { e.preventDefault(); skipTime(15) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  // ── Particles (stable, deterministic) ────────────────────────────────────
  const particleStyles = Array.from({ length: 20 }, (_, i) => {
    const seed = (book.title?.length || 1) * (i + 1)
    const x = ((Math.sin(seed * 12.9898) + 1) / 2) * 100
    const dur = 15 + ((Math.sin(seed * 7.1234) + 1) / 2) * 10
    return { '--delay': `${i * 0.5}s`, '--x': `${x.toFixed(2)}%`, '--duration': `${dur.toFixed(2)}s` }
  })

  // ── Audio event handlers ──────────────────────────────────────────────────
  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime)
  }
  const handleLoadedMetadata = () => {
    if (audioRef.current) { setDuration(audioRef.current.duration); setAudioLoading(false) }
  }
  const handleEnded = useCallback(() => {
    setIsPlaying(false)
    if (currentChapter < chapters.length - 1) {
      setCurrentChapter(prev => prev + 1)
      setTimeout(() => { audioRef.current?.play(); setIsPlaying(true) }, 400)
    }
  }, [currentChapter, chapters.length])

  const handleAudioError = useCallback(() => {
    // Mark chapter as broken and skip to next
    setChapterErrors(prev => ({ ...prev, [currentChapter]: true }))
    setAudioLoading(false)
    if (currentChapter < chapters.length - 1) {
      setTimeout(() => {
        setCurrentChapter(prev => prev + 1)
        setCurrentTime(0)
        setDuration(0)
      }, 600)
    }
  }, [currentChapter, chapters.length])

  const handleWaiting  = () => setAudioLoading(true)
  const handleCanPlay  = () => setAudioLoading(false)

  const togglePlay = () => {
    if (!audioRef.current || chapters.length === 0) return
    if (isPlaying) { audioRef.current.pause() } else { audioRef.current.play() }
    setIsPlaying(p => !p)
  }

  const skipTime = (delta) => {
    if (!audioRef.current || !duration) return
    audioRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + delta))
  }

  const handleProgressClick = (e) => {
    if (!progressRef.current || !audioRef.current || !duration) return
    const rect = progressRef.current.getBoundingClientRect()
    audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value)
    setVolume(v)
    if (audioRef.current) audioRef.current.volume = v
  }

  const handleSpeedChange = (speed) => {
    setPlaybackRate(speed)
    if (audioRef.current) audioRef.current.playbackRate = speed
  }

  const changeChapter = (index) => {
    setCurrentChapter(index)
    setCurrentTime(0)
    setDuration(0)
    setAudioLoading(true)
    if (audioRef.current) audioRef.current.currentTime = 0
    setShowChapters(false)
    setTimeout(() => { audioRef.current?.play(); setIsPlaying(true) }, 300)
  }

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const hrs  = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getBookCover = () => {
    if (book.coverUrl && !book.coverUrl.includes('undefined')) return book.coverUrl
    if (book.cover   && !book.cover.includes('undefined'))    return book.cover
    if (book.image   && !book.image.includes('undefined'))    return book.image
    if (book.archiveImage) return book.archiveImage
    return null
  }

  const progress      = duration ? (currentTime / duration) * 100 : 0
  const currentAudio  = chapters[currentChapter]
  const hasValidAudio = Boolean(currentAudio?.audioUrl)

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="audio-player-page" style={{ '--accent': theme.accent, '--glow': theme.glow }}>
        <div className="animated-bg">
          <div className="bg-gradient"></div>
          <div className="bg-glow"></div>
        </div>
        <header className="player-header">
          <button className="back-button" onClick={onBack}>
            <span className="back-icon">←</span>
            <span className="back-text">Library</span>
          </button>
        </header>
        <div className="loading-screen">
          <div className="loading-vinyl"><div className="vinyl-disc"></div></div>
          <p>Searching LibriVox &amp; Internet Archive…</p>
          <small style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            {book.title}
          </small>
        </div>
      </div>
    )
  }

  // ── No-audio state ────────────────────────────────────────────────────────
  if (loadError) {
    const messages = {
      no_audio:   { icon: '🎙️', heading: 'No Audiobook Found', body: 'We couldn\'t find audio chapters for this title. It may not have a LibriVox recording yet.' },
      restricted: { icon: '🔒', heading: 'Audio Restricted',   body: 'This audio is access-restricted on Internet Archive and cannot be streamed here.' },
      network:    { icon: '📡', heading: 'Connection Error',   body: 'Could not reach the audio library. Check your connection and try again.' },
    }
    const { icon, heading, body } = messages[loadError] || messages.no_audio
    const archiveId = resolveArchiveId(book)

    return (
      <div className="audio-player-page" style={{ '--accent': theme.accent, '--glow': theme.glow }}>
        <div className="animated-bg">
          <div className="bg-gradient"></div>
          <div className="bg-glow"></div>
        </div>
        <header className="player-header">
          <button className="back-button" onClick={onBack}>
            <span className="back-icon">←</span>
            <span className="back-text">Library</span>
          </button>
        </header>
        <div className="no-audio-state">
          <div className="no-audio-icon">{icon}</div>
          <h2>{heading}</h2>
          <p>{body}</p>
          <div className="no-audio-actions">
            {archiveId && (
              <a
                href={`https://archive.org/details/${archiveId}`}
                target="_blank" rel="noreferrer"
                className="no-audio-btn primary"
              >
                🎵 Open on Internet Archive
              </a>
            )}
            <a
              href={`https://librivox.org/?q=${encodeURIComponent(book.title || '')}&type=title&sort=alpha&search_form=advanced`}
              target="_blank" rel="noreferrer"
              className="no-audio-btn secondary"
            >
              🔍 Search LibriVox
            </a>
            <button className="no-audio-btn tertiary" onClick={onBack}>← Back to Library</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main player ───────────────────────────────────────────────────────────
  return (
    <div className="audio-player-page" style={{ '--accent': theme.accent, '--glow': theme.glow }}>
      {/* Animated Background */}
      <div className="animated-bg">
        <div className="bg-gradient"></div>
        <div className="bg-particles">
          {particleStyles.map((style, i) => (
            <div key={i} className="particle" style={style}></div>
          ))}
        </div>
        <div className="bg-glow"></div>
      </div>

      {/* Header */}
      <header className="player-header">
        <button className="back-button" onClick={onBack}>
          <span className="back-icon">←</span>
          <span className="back-text">Library</span>
        </button>
        <div className="header-badge">
          <span className="badge-icon">🎧</span>
          <span className="badge-text">Now Playing</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="player-main">
        {/* Album Art */}
        <div className="album-section">
          <div className={`album-container ${isPlaying ? 'playing' : ''}`}>
            <div className="album-glow"></div>
            <div className="album-ring ring-1"></div>
            <div className="album-ring ring-2"></div>
            <div className="album-ring ring-3"></div>
            <div className="album-art">
              {getBookCover() ? (
                <img
                  src={getBookCover()} alt={book.title}
                  onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                />
              ) : null}
              <div className="album-fallback" style={{ display: getBookCover() ? 'none' : 'flex' }}>
                <span className="fallback-icon">📚</span>
                <span className="fallback-title">{book.title?.substring(0, 30)}</span>
              </div>
            </div>
            {isPlaying && (
              <div className="sound-waves">
                <span></span><span></span><span></span><span></span><span></span>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="info-section">
          <h1 className="book-title">{book.title || 'Audiobook'}</h1>
          <p className="book-author">by {book.author || book.authors || 'Unknown Author'}</p>

          <div className="chapter-info" onClick={() => setShowChapters(!showChapters)} role="button" tabIndex={0}>
            <span className="chapter-label">Chapter {currentChapter + 1} of {chapters.length}</span>
            <span className="chapter-name">
              {chapterErrors[currentChapter] ? '⚠️ Broken link — skipping' : (currentAudio?.title || 'Loading…')}
            </span>
            <span className="chapter-toggle">{showChapters ? '▼' : '▶'}</span>
          </div>
        </div>

        {/* Hidden audio element — only rendered when valid URL exists */}
        {hasValidAudio && (
          <audio
            ref={audioRef}
            src={currentAudio.audioUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onWaiting={handleWaiting}
            onCanPlay={handleCanPlay}
            onError={handleAudioError}
            preload="metadata"
          />
        )}

        {/* Progress */}
        <div className="progress-section">
          <div className="progress-bar" ref={progressRef} onClick={handleProgressClick}>
            <div className="progress-bg"></div>
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            <div className="progress-thumb" style={{ left: `${progress}%` }}>
              {audioLoading && <div className="thumb-loading"></div>}
            </div>
          </div>
          <div className="time-display">
            <span className="time-current">{formatTime(currentTime)}</span>
            <span className="time-total">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="controls-section">
          <div className="main-controls">
            <button className="control-btn skip-back" onClick={() => skipTime(-15)} title="Back 15s">
              <span className="skip-icon">↺</span>
              <span className="skip-label">15</span>
            </button>
            <button
              className="control-btn prev-chapter"
              onClick={() => currentChapter > 0 && changeChapter(currentChapter - 1)}
              disabled={currentChapter === 0} title="Previous Chapter"
            >⏮</button>
            <button
              className={`control-btn play-pause ${isPlaying ? 'playing' : ''}`}
              onClick={togglePlay}
              disabled={!hasValidAudio && !audioLoading}
            >
              <span className="play-icon">
                {audioLoading ? '⏳' : isPlaying ? '❚❚' : '▶'}
              </span>
            </button>
            <button
              className="control-btn next-chapter"
              onClick={() => currentChapter < chapters.length - 1 && changeChapter(currentChapter + 1)}
              disabled={currentChapter >= chapters.length - 1} title="Next Chapter"
            >⏭</button>
            <button className="control-btn skip-forward" onClick={() => skipTime(15)} title="Forward 15s">
              <span className="skip-icon">↻</span>
              <span className="skip-label">15</span>
            </button>
          </div>

          {/* Secondary Controls */}
          <div className="secondary-controls">
            <div className="volume-control">
              <span className="volume-icon">{volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}</span>
              <input
                type="range" min="0" max="1" step="0.05" value={volume}
                onChange={handleVolumeChange} className="volume-slider"
              />
            </div>
            <div className="speed-control">
              {[0.75, 1, 1.25, 1.5, 2].map(speed => (
                <button
                  key={speed}
                  className={`speed-btn ${playbackRate === speed ? 'active' : ''}`}
                  onClick={() => handleSpeedChange(speed)}
                >{speed}x</button>
              ))}
            </div>
          </div>
        </div>

        {/* Chapter List Modal */}
        {showChapters && (
          <div className="chapters-modal">
            <div className="chapters-backdrop" onClick={() => setShowChapters(false)}></div>
            <div className="chapters-content">
              <div className="chapters-header">
                <h3>📚 All Chapters ({chapters.length})</h3>
                <button className="close-chapters" onClick={() => setShowChapters(false)}>✕</button>
              </div>
              <div className="chapters-list">
                {chapters.map((chapter, index) => (
                  <button
                    key={chapter.id}
                    className={`chapter-item ${currentChapter === index ? 'active' : ''} ${chapterErrors[index] ? 'broken' : ''}`}
                    onClick={() => !chapterErrors[index] && changeChapter(index)}
                    disabled={chapterErrors[index]}
                  >
                    <span className="chapter-num">{index + 1}</span>
                    <span className="chapter-title">
                      {chapterErrors[index] ? <s style={{ opacity: 0.4 }}>{chapter.title}</s> : chapter.title}
                    </span>
                    {currentChapter === index && isPlaying && !chapterErrors[index] && (
                      <span className="chapter-playing">
                        <span></span><span></span><span></span>
                      </span>
                    )}
                    {chapterErrors[index] && <span style={{ fontSize: '0.75rem', color: '#ff9999' }}>⚠️</span>}
                    {chapter.duration > 0 && !chapterErrors[index] && (
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginLeft: 'auto' }}>
                        {formatTime(chapter.duration)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts Hint */}
        <div className="shortcuts-hint">
          <span>Space: Play/Pause</span>
          <span>← →: Skip 15s</span>
        </div>
      </main>
    </div>
  )
}

export default AudioStorybook
