import { useState, useEffect, useRef } from 'react'
import '../styles/AudioStorybook.css'

// Generate beautiful cover art based on book title
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
  
  const theme = themes[charCode % themes.length]
  
  return { theme, title }
}

function AudioStorybook({ book, onBack }) {
  const [currentChapter, setCurrentChapter] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [chapters, setChapters] = useState([])
  const [loading, setLoading] = useState(true)
  const [volume, setVolume] = useState(1)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showChapters, setShowChapters] = useState(false)
  const [audioLoading, setAudioLoading] = useState(false)
  
  const audioRef = useRef(null)
  const progressRef = useRef(null)
  const API_BASE = import.meta.env.VITE_API_BASE || ''

  const { theme } = generateCoverArt(book)

  // Load audio sources from Internet Archive
  useEffect(() => {
    const loadAudioSources = async () => {
      const archiveId = book.archiveId || (book.id?.startsWith('archive-') && book.infoLink
        ? book.infoLink.split('/').pop()
        : null)
      if (!archiveId) {
        setLoading(false)
        return
      }

      try {
        const response = await fetch(`${API_BASE}/api/ia/metadata/${archiveId}`)
        const data = await response.json()
        
        if (data.files) {
          const audioFiles = data.files
            .filter(f => /\.(mp3|m4a|ogg|opus)$/i.test(f.name))
            .sort((a, b) => {
              const trackA = parseInt(a.track) || parseInt(a.name.match(/(\d+)/)?.[1]) || 0
              const trackB = parseInt(b.track) || parseInt(b.name.match(/(\d+)/)?.[1]) || 0
              return trackA - trackB
            })
            .map((f, index) => ({
              name: f.name.replace(/\.(mp3|m4a|ogg|opus)$/i, '').replace(/_/g, ' '),
              url: `https://archive.org/download/${archiveId}/${encodeURIComponent(f.name)}`,
              duration: f.length ? parseFloat(f.length) : 0,
              title: f.title || f.name.replace(/\.(mp3|m4a|ogg|opus)$/i, '').replace(/_/g, ' ') || `Chapter ${index + 1}`
            }))
          
          const chapterList = audioFiles.map((file, index) => ({
            id: index,
            title: file.title || file.name || `Chapter ${index + 1}`,
            audioUrl: file.url,
            duration: file.duration
          }))
          setChapters(chapterList)
        }
      } catch (err) {
        console.error('Failed to load audio sources:', err)
      }
      
      setLoading(false)
    }

    loadAudioSources()
  }, [API_BASE, book])

  const particleStyles = Array.from({ length: 20 }, (_, i) => {
    const seed = (book.title?.length || 1) * (i + 1)
    const x = ((Math.sin(seed * 12.9898) + 1) / 2) * 100
    const durationOffset = ((Math.sin(seed * 7.1234) + 1) / 2) * 10
    return {
      '--delay': `${i * 0.5}s`,
      '--x': `${x.toFixed(2)}%`,
      '--duration': `${(15 + durationOffset).toFixed(2)}s`,
    }
  })

  // Audio event handlers
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
      setAudioLoading(false)
    }
  }

  const handleEnded = () => {
    setIsPlaying(false)
    // Auto-play next chapter
    if (currentChapter < chapters.length - 1) {
      setCurrentChapter(prev => prev + 1)
      setTimeout(() => {
        audioRef.current?.play()
        setIsPlaying(true)
      }, 500)
    }
  }

  const handleWaiting = () => setAudioLoading(true)
  const handleCanPlay = () => setAudioLoading(false)

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleProgressClick = (e) => {
    if (progressRef.current && audioRef.current && duration) {
      const rect = progressRef.current.getBoundingClientRect()
      const percent = (e.clientX - rect.left) / rect.width
      audioRef.current.currentTime = percent * duration
    }
  }

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
  }

  const handleSpeedChange = (speed) => {
    setPlaybackRate(speed)
    if (audioRef.current) {
      audioRef.current.playbackRate = speed
    }
  }

  const changeChapter = (index) => {
    setCurrentChapter(index)
    setCurrentTime(0)
    setAudioLoading(true)
    if (audioRef.current) {
      audioRef.current.currentTime = 0
    }
    setShowChapters(false)
    // Auto-play when changing chapters
    setTimeout(() => {
      audioRef.current?.play()
      setIsPlaying(true)
    }, 300)
  }

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const skipTime = (delta) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + delta))
    }
  }

  // Get book cover
  const getBookCover = () => {
    if (book.coverUrl && !book.coverUrl.includes('undefined')) return book.coverUrl
    if (book.cover && !book.cover.includes('undefined')) return book.cover
    if (book.archiveImage) return book.archiveImage
    return null
  }

  const progress = duration ? (currentTime / duration) * 100 : 0
  const currentAudio = chapters[currentChapter]

  if (loading) {
    return (
      <div className="audio-player-page" style={{ '--accent': theme.accent, '--glow': theme.glow }}>
        <div className="loading-screen">
          <div className="loading-vinyl">
            <div className="vinyl-disc"></div>
          </div>
          <p>Loading your audiobook...</p>
        </div>
      </div>
    )
  }

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
        {/* Album Art Section */}
        <div className="album-section">
          <div className={`album-container ${isPlaying ? 'playing' : ''}`}>
            <div className="album-glow"></div>
            <div className="album-ring ring-1"></div>
            <div className="album-ring ring-2"></div>
            <div className="album-ring ring-3"></div>
            <div className="album-art">
              {getBookCover() ? (
                <img src={getBookCover()} alt={book.title} onError={(e) => {
                  e.target.style.display = 'none'
                  e.target.nextSibling.style.display = 'flex'
                }} />
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

        {/* Info Section */}
        <div className="info-section">
          <h1 className="book-title">{book.title || 'Audiobook'}</h1>
          <p className="book-author">by {book.author || 'Unknown Author'}</p>
          
          <div className="chapter-info" onClick={() => setShowChapters(!showChapters)}>
            <span className="chapter-label">Chapter {currentChapter + 1} of {chapters.length}</span>
            <span className="chapter-name">{currentAudio?.title || 'Loading...'}</span>
            <span className="chapter-toggle">{showChapters ? '▼' : '▶'}</span>
          </div>
        </div>

        {/* Audio Element */}
        <audio
          ref={audioRef}
          src={currentAudio?.audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onWaiting={handleWaiting}
          onCanPlay={handleCanPlay}
        />

        {/* Progress Section */}
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

        {/* Controls Section */}
        <div className="controls-section">
          <div className="main-controls">
            <button className="control-btn skip-back" onClick={() => skipTime(-15)} title="Back 15s">
              <span className="skip-icon">↺</span>
              <span className="skip-label">15</span>
            </button>
            
            <button 
              className="control-btn prev-chapter" 
              onClick={() => currentChapter > 0 && changeChapter(currentChapter - 1)}
              disabled={currentChapter === 0}
              title="Previous Chapter"
            >
              ⏮
            </button>
            
            <button className={`control-btn play-pause ${isPlaying ? 'playing' : ''}`} onClick={togglePlay}>
              <span className="play-icon">{isPlaying ? '❚❚' : '▶'}</span>
            </button>
            
            <button 
              className="control-btn next-chapter" 
              onClick={() => currentChapter < chapters.length - 1 && changeChapter(currentChapter + 1)}
              disabled={currentChapter >= chapters.length - 1}
              title="Next Chapter"
            >
              ⏭
            </button>
            
            <button className="control-btn skip-forward" onClick={() => skipTime(15)} title="Forward 15s">
              <span className="skip-icon">↻</span>
              <span className="skip-label">15</span>
            </button>
          </div>

          {/* Secondary Controls */}
          <div className="secondary-controls">
            <div className="volume-control">
              <span className="volume-icon">
                {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={handleVolumeChange}
                className="volume-slider"
              />
            </div>

            <div className="speed-control">
              {[0.75, 1, 1.25, 1.5, 2].map(speed => (
                <button
                  key={speed}
                  className={`speed-btn ${playbackRate === speed ? 'active' : ''}`}
                  onClick={() => handleSpeedChange(speed)}
                >
                  {speed}x
                </button>
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
                <h3>📚 All Chapters</h3>
                <button className="close-chapters" onClick={() => setShowChapters(false)}>✕</button>
              </div>
              <div className="chapters-list">
                {chapters.map((chapter, index) => (
                  <button
                    key={chapter.id}
                    className={`chapter-item ${currentChapter === index ? 'active' : ''}`}
                    onClick={() => changeChapter(index)}
                  >
                    <span className="chapter-num">{index + 1}</span>
                    <span className="chapter-title">{chapter.title}</span>
                    {currentChapter === index && isPlaying && (
                      <span className="chapter-playing">
                        <span></span><span></span><span></span>
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
