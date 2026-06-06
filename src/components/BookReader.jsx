import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import HTMLFlipBook from 'react-pageflip'
import '../styles/BookReader.css'
import { addBookmark, removeBookmark, getBookmarks, isBookmarked, saveProgress, getProgress } from '../utils/userLib'

function BookReader({ book, onBack }) {
  const [activeTab, setActiveTab] = useState('read')
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [audioSources, setAudioSources] = useState([])
  const [resolvedArchiveId, setResolvedArchiveId] = useState(null)
  const [audioChapters, setAudioChapters] = useState([])      // from /api/audio/resolve
  const [audioChaptersLoading, setAudioChaptersLoading] = useState(false)
  const [audioChapterIndex, setAudioChapterIndex] = useState(0)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [audioTime, setAudioTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioBuffering, setAudioBuffering] = useState(false)
  const [audioChapterErrors, setAudioChapterErrors] = useState({})
  const audioTabRef = useRef(null)
  const [textContent, setTextContent] = useState('')
  const [chapters, setChapters] = useState([])
  const [selectedChapter, setSelectedChapter] = useState(0)
  const [textLoading, setTextLoading] = useState(false)
  const [textError, setTextError] = useState(false)
  const [textRetry, setTextRetry] = useState(0)
  const [embeddedUrl, setEmbeddedUrl] = useState('')
  const [googleViewerError, setGoogleViewerError] = useState(false)
  const [archiveAccessRestricted, setArchiveAccessRestricted] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [bookmarked, setBookmarked] = useState(false)
  const [bookmarkSaving, setBookmarkSaving] = useState(false)
  const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('reader-font-size') || '16', 10))
  const [readerTheme, setReaderTheme] = useState(() => localStorage.getItem('reader-theme') || 'light')
  const [plainMode, setPlainMode] = useState(() => localStorage.getItem('reader-plain-mode') === 'true')
  const plainScrollRef = useRef(null)

  const flipBookRef = useRef(null)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  const API_BASE = import.meta.env.VITE_API_BASE || ''

  // Load bookmark status on mount
  useEffect(() => {
    const checkBookmark = async () => {
      const bms = await getBookmarks()
      setBookmarked(isBookmarked(bms, book.id))
    }
    checkBookmark()
  }, [book.id])

  // Load saved reading progress
  useEffect(() => {
    const loadProgress = async () => {
      if (!book.id?.startsWith('gutenberg-')) return
      const prog = await getProgress(book.id)
      if (prog && prog.chapter != null) {
        setSelectedChapter(prog.chapter)
      }
    }
    loadProgress()
  }, [book.id])

  // Save progress when chapter changes (debounced via timeout)
  useEffect(() => {
    if (!book.id?.startsWith('gutenberg-')) return
    const timer = setTimeout(() => {
      saveProgress(book.id, book.title, selectedChapter, currentPage)
    }, 1500)
    return () => clearTimeout(timer)
  }, [book.id, book.title, selectedChapter, currentPage])

  // Persist reading preferences
  useEffect(() => { localStorage.setItem('reader-font-size', fontSize) }, [fontSize])
  useEffect(() => { localStorage.setItem('reader-theme', readerTheme) }, [readerTheme])
  useEffect(() => { localStorage.setItem('reader-plain-mode', plainMode) }, [plainMode])

  // Keyboard page navigation
  useEffect(() => {
    const handleKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goToNextPage()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goToPreviousPage()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })


  const toggleBookmark = useCallback(async () => {
    setBookmarkSaving(true)
    if (bookmarked) {
      await removeBookmark(book.id)
      setBookmarked(false)
    } else {
      await addBookmark(book)
      setBookmarked(true)
    }
    setBookmarkSaving(false)
  }, [book, bookmarked])

  const fetchWithTimeout = async (url, timeout = 12000) => {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await fetch(url, { signal: controller.signal })
      return response
    } finally {
      clearTimeout(id)
    }
  }

  const fetchWithRetry = async (url, attempts = 2, timeout = 12000) => {
    let lastError
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await fetchWithTimeout(url, timeout)
      } catch (err) {
        lastError = err
      }
    }
    throw lastError
  }

  const normalizeReadableText = (rawText) => {
    if (typeof rawText !== 'string') return ''

    const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = normalized.split('\n')

    let start = 0
    let end = lines.length

    const startMarkers = [
      /^\*\*\*\s*START OF (THIS|THE) PROJECT GUTENBERG EBOOK/i,
      /^\*\*\*\s*START OF THE PROJECT GUTENBERG/i,
      /^START OF (THIS|THE) PROJECT GUTENBERG EBOOK/i,
    ]

    const endMarkers = [
      /^\*\*\*\s*END OF (THIS|THE) PROJECT GUTENBERG EBOOK/i,
      /^\*\*\*\s*END OF THE PROJECT GUTENBERG/i,
      /^END OF (THIS|THE) PROJECT GUTENBERG EBOOK/i,
    ]

    for (let i = 0; i < lines.length; i += 1) {
      if (startMarkers.some((marker) => marker.test(lines[i]))) {
        start = i + 1
        break
      }
    }

    for (let i = start; i < lines.length; i += 1) {
      if (endMarkers.some((marker) => marker.test(lines[i]))) {
        end = i
        break
      }
    }

    return lines.slice(start, end).join('\n').trim()
  }

  const detectChapters = (rawText) => {
    if (!rawText || typeof rawText !== 'string') return []

    const lines = rawText.split('\n')
    const chapterMarkers = []
    const chapterRegexes = [
      /^\s*(chapter|chap\.|book|part)\s+([\divxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|first|second|third|fourth|fifth)\b[\s:.-]*(.*)$/i,
      /^\s*(prologue|epilogue|preface|introduction|foreword|afterword)\b[\s:.-]*(.*)$/i,
    ]

    for (let idx = 0; idx < lines.length; idx += 1) {
      const line = lines[idx]?.trim() || ''
      if (!line || line.length > 120) continue

      for (const regex of chapterRegexes) {
        const match = line.match(regex)
        if (match) {
          const prefix = match[1] || ''
          const numberPart = match[2] || ''
          const suffix = match[3] ? ` ${match[3].trim()}` : ''
          const title = `${prefix} ${numberPart}${suffix}`.trim().replace(/\s+/g, ' ')
          chapterMarkers.push({
            lineIndex: idx,
            title,
          })
          break
        }
      }
    }

    if (chapterMarkers.length < 2) return []

    return chapterMarkers
      .map((marker, index) => {
        const startIndex = marker.lineIndex
        const endIndex = index + 1 < chapterMarkers.length ? chapterMarkers[index + 1].lineIndex : lines.length
        return {
          title: marker.title,
          content: lines.slice(startIndex, endIndex).join('\n').trim(),
        }
      })
      .filter((chapter) => chapter.content)
  }

  useEffect(() => {
    setIframeLoaded(false)
    setLoadError(false)
    setGoogleViewerError(false)
    setAudioSources([])
    setResolvedArchiveId(null)
    setTextContent('')
    setChapters([])
    setSelectedChapter(0)
    setEmbeddedUrl('')
    setArchiveAccessRestricted(false)
    setTextError(false)
    setTextRetry(0)

    if (book?.hasAudio && !book?.hasText) {
      setActiveTab('audio')
    } else {
      setActiveTab('read')
    }

    if (book.id?.startsWith('archive-') && book.infoLink) {
      const archiveId = book.infoLink.split('/').pop()
      setResolvedArchiveId(archiveId)
      return
    }

    if (book.source === 'LibriVox' && book.archiveId) {
      setResolvedArchiveId(book.archiveId)
      return
    }

    if (book.id?.startsWith('openlibrary-') && book.editionKey) {
      const loadOpenLibraryEdition = async () => {
        try {
          const response = await fetch(`https://openlibrary.org/books/${book.editionKey}.json`)
          const data = await response.json()
          if (data?.ocaid) {
            setResolvedArchiveId(data.ocaid)
          }
        } catch (err) {
          console.error('Failed to resolve Open Library edition:', err)
        }
      }
      loadOpenLibraryEdition()
    }
  }, [book])

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (resolvedArchiveId) {
      loadArchiveMetadata(resolvedArchiveId)
    }
  }, [resolvedArchiveId])
  /* eslint-enable react-hooks/exhaustive-deps */

  // Load clean chapter list via /api/audio/resolve whenever the audio tab is opened
  useEffect(() => {
    if (activeTab !== 'audio') return
    if (audioChapters.length > 0 || audioChaptersLoading) return

    const archiveId = resolvedArchiveId
      || (book.id?.startsWith('archive-') && book.infoLink ? book.infoLink.split('/').pop() : null)
      || (book.id?.startsWith('librivox-') ? book.id.replace('librivox-', '') : null)
      || (book.source === 'LibriVox' ? book.archiveId : null)

    const title = book.title || ''
    if (!archiveId && !title) return

    setAudioChaptersLoading(true)
    setAudioChapterIndex(0)
    setAudioPlaying(false)
    setAudioTime(0)
    setAudioDuration(0)
    setAudioChapterErrors({})

    const params = new URLSearchParams()
    if (archiveId) params.set('archiveId', archiveId)
    if (title) params.set('title', title)

    fetch(`${API_BASE}/api/audio/resolve?${params}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => {
        if (Array.isArray(data.chapters)) setAudioChapters(data.chapters)
      })
      .catch(() => {})
      .finally(() => setAudioChaptersLoading(false))
  }, [activeTab, resolvedArchiveId, book, API_BASE])

  useEffect(() => {
    const loadGutenbergText = async () => {
      if (!book.id?.startsWith('gutenberg-')) return
      const targetLink = book.textProxyLink || book.textLink
      if (!targetLink) return
      setTextLoading(true)
      setTextError(false)
      try {
        let text = ''
        try {
          const response = await fetch(`${API_BASE}/api/gutenberg/file?url=${encodeURIComponent(targetLink)}`)
          if (!response.ok) {
            throw new Error(`Gutenberg proxy responded ${response.status}`)
          }
          text = await response.text()
        } catch {
          const directResponse = await fetch(targetLink)
          if (!directResponse.ok) {
            throw new Error(`Direct Gutenberg text responded ${directResponse.status}`)
          }
          text = await directResponse.text()
        }
        const normalized = normalizeReadableText(text)
        if (!normalized || normalized.length < 100) {
          throw new Error('Text response was empty or too short')
        }
        setTextContent(normalized)
      } catch (err) {
        console.error('Error loading Gutenberg text:', err)
        setTextError(true)
      } finally {
        setTextLoading(false)
      }
    }
    loadGutenbergText()
  }, [API_BASE, book, textRetry])

  useEffect(() => {
    if (!textContent || typeof textContent !== 'string') {
      setChapters([])
      setSelectedChapter(0)
      return
    }

    const parsedChapters = detectChapters(textContent)

    if (parsedChapters.length > 0) {
      setChapters(parsedChapters)
      setSelectedChapter(0)
    } else {
      setChapters([])
      setSelectedChapter(0)
    }
  }, [textContent])

  const activeText = selectedChapter >= 0 && chapters[selectedChapter]
    ? chapters[selectedChapter].content
    : textContent

  const paginatedText = useMemo(() => {
    const text = String(activeText || '').replace(/\r\n/g, '\n').trim()
    if (!text) {
      return []
    }

    const paragraphs = text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)

    const maxCharsPerPage = 1800
    const pages = []
    let currentChunk = ''

    paragraphs.forEach((paragraph) => {
      const block = `${paragraph}\n\n`
      if ((currentChunk + block).length > maxCharsPerPage && currentChunk.trim()) {
        pages.push(currentChunk.trim())
        currentChunk = block
      } else {
        currentChunk += block
      }
    })

    if (currentChunk.trim()) {
      pages.push(currentChunk.trim())
    }

    return pages.length > 0 ? pages : [text]
  }, [activeText])

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedChapter, textContent])

  // Auto-switch to plain reader for very large books
  useEffect(() => {
    if (paginatedText.length > 120) setPlainMode(true)
  }, [paginatedText.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const progressPercent = paginatedText.length > 0
    ? Math.min(100, Math.round((currentPage / paginatedText.length) * 100))
    : 0

  const clampFontSize = (size) => Math.min(26, Math.max(13, size))

  useEffect(() => {
    if (book.source !== 'Google Books' || !book.googleId) return

    const loadGoogleBooksApi = () => {
      if (window.google?.books) return Promise.resolve()

      if (!window._googleBooksApiPromise) {
        window._googleBooksApiPromise = new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://www.google.com/books/jsapi.js'
          script.async = true
          script.onload = () => {
            try {
              window.google.books.load()
              window.google.books.setOnLoadCallback(() => resolve())
            } catch (err) {
              reject(err)
            }
          }
          script.onerror = reject
          document.body.appendChild(script)
        })
      }

      return window._googleBooksApiPromise
    }

    loadGoogleBooksApi()
      .then(() => {
        const container = document.getElementById('google-viewer')
        if (!container) return
        const viewer = new window.google.books.DefaultViewer(container)
        viewer.load(book.googleId)
        setIframeLoaded(true)
      })
      .catch((err) => {
        console.error('Failed to load Google Books viewer:', err)
        setGoogleViewerError(true)
      })
  }, [book])

  const loadArchiveMetadata = async (archiveId) => {
    try {
      const response = await fetchWithRetry(
        `${API_BASE}/api/ia/metadata/${archiveId}`
      )
      const data = await response.json()
      const restricted = data?.metadata?.['access-restricted'] === 'true' || data?.metadata?.access_restricted === 'true'
      setArchiveAccessRestricted(Boolean(restricted))
      if (data?.files && Array.isArray(data.files)) {
        const archiveAudioFiles = data.files
          .filter(f => (f.name && /\.(mp3|m4a|ogg|opus)$/i.test(f.name)) || (f.format && /mp3|audio|ogg|m4a/i.test(f.format)))
          .map(f => ({
            name: f.name,
            url: `https://archive.org/download/${archiveId}/${f.name}`,
            format: f.format || ''
          }))
        setAudioSources(archiveAudioFiles)
      }
      if (data?.files && Array.isArray(data.files)) {
        const textFile = data.files.find(f => f.name && /\.txt$/i.test(f.name))
        const pdfFile = data.files.find(f => f.name && /\.pdf$/i.test(f.name))

        if (textFile) {
          setTextLoading(true)
          try {
            const textUrl = `${API_BASE}/api/ia/download?item=${encodeURIComponent(archiveId)}&file=${encodeURIComponent(textFile.name)}`
            const textResponse = await fetch(textUrl)
            const text = await textResponse.text()
            const normalizedText = normalizeReadableText(text)
            if (book.isFullAvailable) {
              setTextContent(normalizedText)
            } else {
              setTextContent(normalizedText.slice(0, 5000))
            }
          } catch (err) {
            console.error('Error loading text file:', err)
          } finally {
            setTextLoading(false)
          }
        } else if (pdfFile) {
          setEmbeddedUrl(`${API_BASE}/api/ia/download?item=${encodeURIComponent(archiveId)}&file=${encodeURIComponent(pdfFile.name)}`)
        } else {
          setEmbeddedUrl(`https://archive.org/embed/${archiveId}`)
        }
      }
      console.log('Archive metadata:', data)
    } catch (err) {
      console.error('Error loading archive metadata:', err)
    }
  }

  const handleFullscreen = () => {
    const iframeElement = document.querySelector('.reader-iframe')
    if (iframeElement) {
      if (iframeElement.requestFullscreen) {
        iframeElement.requestFullscreen()
      } else if (iframeElement.mozRequestFullScreen) {
        iframeElement.mozRequestFullScreen()
      } else if (iframeElement.webkitRequestFullscreen) {
        iframeElement.webkitRequestFullscreen()
      } else if (iframeElement.msRequestFullscreen) {
        iframeElement.msRequestFullscreen()
      }
    }
  }

  const goToPreviousPage = () => {
    flipBookRef.current?.pageFlip()?.flipPrev()
  }

  const goToNextPage = () => {
    flipBookRef.current?.pageFlip()?.flipNext()
  }

  const getReadUrl = () => {
    const normalizeHttps = (url) => (typeof url === 'string' ? url.replace(/^http:\/\//i, 'https://') : url)
    if (embeddedUrl) return embeddedUrl

    if (resolvedArchiveId && !archiveAccessRestricted) {
      return `https://archive.org/embed/${resolvedArchiveId}`
    }

    if (book.id?.startsWith('gutenberg-')) return ''

    if (book.previewLink && book.source !== 'Open Library' && book.source !== 'Google Books') {
      return normalizeHttps(book.previewLink)
    }

    return ''
  }

  const getCoverSrc = () => {
    if (!book.image || book.image.includes('placeholder') || book.image.includes('via.placeholder')) {
      return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22%3E%3Crect fill=%234f46e5%22 width=%22200%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2245%25%22 font-size=%2248%22 fill=%22white%22 text-anchor=%22middle%22%3E📖%3C/text%3E%3C/svg%3E'
    }
    return book.image
  }

  const readUrl = getReadUrl()

  return (
    <div className="book-reader-full">
      {/* Header */}
      <header className="reader-header">
        <div className="header-left">
          <button className="back-btn" onClick={onBack} title="Back to library">
            ← Back to Library
          </button>
          <div className="book-header-info">
            <h1>{book.title}</h1>
            <p>{book.authors}</p>
            <span className={`source-badge ${book.isFullAvailable ? 'full' : 'preview'}`}>
              {book.isFullAvailable ? '📖 Full Book' : '👁️ Preview'}
            </span>
          </div>
        </div>
        <div className="header-right">
          <button
            className={`bookmark-btn ${bookmarked ? 'bookmarked' : ''}`}
            onClick={toggleBookmark}
            disabled={bookmarkSaving}
            title={bookmarked ? 'Remove bookmark' : 'Save to My Library'}
          >
            {bookmarkSaving ? '...' : bookmarked ? '🔖 Saved' : '🔖 Save'}
          </button>
          <span className="source-label">Source: {book.source}</span>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="reader-tabs">
        <button
          className={`tab-button ${activeTab === 'read' ? 'active' : ''}`}
          onClick={() => setActiveTab('read')}
        >
          📖 Read
        </button>
        <button
          className={`tab-button ${activeTab === 'audio' ? 'active' : ''}`}
          onClick={() => setActiveTab('audio')}
        >
          🎧 Audio
        </button>
        <button
          className={`tab-button ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          ℹ️ Info
        </button>
      </nav>

      {/* Main Content */}
      <div className="reader-main">
        {/* Read Tab */}
        {activeTab === 'read' && (
          <div className="reader-content">
            <div className="reader-viewer">
              <div className="iframe-topbar">
                <div className="iframe-title">
                  <strong>{book.title}</strong>
                  <span className="iframe-sub">{book.authors}</span>
                </div>
                <div className="iframe-actions">
                  {readUrl ? (
                    <a href={readUrl} target="_blank" rel="noreferrer" className="topbar-btn">Open in new tab</a>
                  ) : (
                    <button className="topbar-btn" disabled>No full text</button>
                  )}
                  <button className="topbar-btn" onClick={handleFullscreen}>Fullscreen</button>
                  <a href={book.infoLink} target="_blank" rel="noreferrer" className="topbar-btn">View Source</a>
                </div>
              </div>
              {!iframeLoaded && !loadError && !textContent && !textLoading && Boolean(readUrl) && book.source !== 'Google Books' && (
                <div className="reader-loading">
                  <div className="spinner"></div>
                  <p>Loading book...</p>
                </div>
              )}
              {!textContent && book?.hasAudio && !book?.hasText && (
                <div className="reader-error" style={{padding: '20px', textAlign: 'center', color: '#0f172a'}}>
                  <p>This title is available as an audiobook.</p>
                  <p style={{fontSize: '14px', marginTop: '10px'}}>Use the Audio tab to listen.</p>
                </div>
              )}
              {textLoading && (
                <div className="reader-loading">
                  <div className="spinner"></div>
                  <p>Loading full text...</p>
                </div>
              )}
              {!textLoading && textError && (
                <div className="reader-error" style={{padding: '32px', textAlign: 'center'}}>
                  <p style={{fontSize: '18px', marginBottom: '10px'}}>⚠️ Could not load book text</p>
                  <p style={{fontSize: '14px', color: '#64748b', marginBottom: '20px'}}>
                    The reading server may not be running. Start it with <code>npm run dev</code> and try again.
                  </p>
                  <button
                    className="control-btn"
                    onClick={() => setTextRetry((n) => n + 1)}
                    style={{padding: '10px 24px', fontSize: '15px'}}
                  >
                    🔄 Retry
                  </button>
                </div>
              )}
              {textContent && (
                <div className="text-reader" data-theme={readerTheme} style={{ '--reader-font-size': `${fontSize}px` }}>

                  {/* Reading Toolbar */}
                  <div className="reading-toolbar">
                    <div className="toolbar-group">
                      <span className="toolbar-label">Theme</span>
                      <button
                        className={`theme-btn ${readerTheme === 'light' ? 'active' : ''}`}
                        onClick={() => setReaderTheme('light')}
                        title="Light theme"
                      >☀️</button>
                      <button
                        className={`theme-btn ${readerTheme === 'sepia' ? 'active' : ''}`}
                        onClick={() => setReaderTheme('sepia')}
                        title="Sepia theme"
                      >📖</button>
                      <button
                        className={`theme-btn ${readerTheme === 'dark' ? 'active' : ''}`}
                        onClick={() => setReaderTheme('dark')}
                        title="Dark theme"
                      >🌙</button>
                    </div>
                    <div className="toolbar-group">
                      <span className="toolbar-label">Size</span>
                      <button
                        className="font-btn"
                        onClick={() => setFontSize(s => clampFontSize(s - 1))}
                        disabled={fontSize <= 13}
                        title="Decrease font size"
                      >A−</button>
                      <span className="font-size-display">{fontSize}px</span>
                      <button
                        className="font-btn"
                        onClick={() => setFontSize(s => clampFontSize(s + 1))}
                        disabled={fontSize >= 26}
                        title="Increase font size"
                      >A+</button>
                    </div>
                    <div className="toolbar-group">
                      <span className="toolbar-label">Mode</span>
                      <button
                        className={`mode-btn ${!plainMode ? 'active' : ''}`}
                        onClick={() => setPlainMode(false)}
                        title="Flip book mode"
                      >📄 Flip</button>
                      <button
                        className={`mode-btn ${plainMode ? 'active' : ''}`}
                        onClick={() => setPlainMode(true)}
                        title="Scroll mode (better for large books)"
                      >📜 Scroll</button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {paginatedText.length > 0 && (
                    <div className="reading-progress-bar-wrap">
                      <div
                        className="reading-progress-bar-fill"
                        style={{ width: `${progressPercent}%` }}
                      />
                      <span className="reading-progress-label">{progressPercent}%</span>
                    </div>
                  )}

                  {!book.isFullAvailable && (
                    <div className="preview-banner">
                      This is a preview. Full access is not available for free.
                    </div>
                  )}

                  {chapters.length > 0 ? (
                    <div className="chapter-reader-layout">
                      <aside className="chapter-sidebar">
                        <h3>Chapters</h3>
                        <div className="chapter-list">
                          {chapters.map((chapter, index) => (
                            <button
                              key={`${chapter.title}-${index}`}
                              className={`chapter-item ${selectedChapter === index ? 'active' : ''}`}
                              onClick={() => setSelectedChapter(index)}
                            >
                              <span className="chapter-index">{index + 1}.</span>
                              <span className="chapter-title">{chapter.title}</span>
                            </button>
                          ))}
                        </div>
                      </aside>

                      <section className="chapter-content">
                        <div className="chapter-nav">
                          <button
                            className="control-btn"
                            onClick={() => setSelectedChapter(Math.max(0, selectedChapter - 1))}
                            disabled={selectedChapter <= 0}
                          >
                            ← Prev Chapter
                          </button>
                          <div className="chapter-meta">
                            Ch. {selectedChapter + 1} / {chapters.length}
                          </div>
                          <button
                            className="control-btn"
                            onClick={() => setSelectedChapter(Math.min(chapters.length - 1, selectedChapter + 1))}
                            disabled={selectedChapter >= chapters.length - 1}
                          >
                            Next Chapter →
                          </button>
                        </div>
                        <h2 className="chapter-heading">{chapters[selectedChapter]?.title || 'Chapter'}</h2>

                        {paginatedText.length > 0 ? (
                          plainMode ? (
                            <div
                              ref={plainScrollRef}
                              className="plain-reader"
                              style={{ fontSize: `var(--reader-font-size, ${fontSize}px)` }}
                            >
                              {paginatedText.map((pageText, index) => (
                                <p key={`plain-ch-${selectedChapter}-${index}`} className="plain-reader-para">{pageText}</p>
                              ))}
                            </div>
                          ) : (
                            <>
                              <div className="flipbook-controls">
                                <button className="control-btn" onClick={goToPreviousPage} disabled={currentPage <= 1}>◀ Prev</button>
                                <span className="flipbook-page-indicator">Page {currentPage} / {paginatedText.length}</span>
                                <button className="control-btn" onClick={goToNextPage} disabled={currentPage >= paginatedText.length}>Next ▶</button>
                              </div>
                              <div className="flipbook-wrapper">
                                <HTMLFlipBook
                                  key={`flip-ch-${selectedChapter}`}
                                  ref={flipBookRef}
                                  width={560}
                                  height={720}
                                  size="stretch"
                                  minWidth={280}
                                  maxWidth={860}
                                  minHeight={320}
                                  maxHeight={960}
                                  maxShadowOpacity={isMobile ? 0 : 0.25}
                                  showCover={false}
                                  mobileScrollSupport
                                  usePortrait
                                  className="flipbook"
                                  startPage={0}
                                  drawShadow={!isMobile}
                                  flippingTime={400}
                                  useMouseEvents={!isMobile}
                                  onFlip={(event) => setCurrentPage((event.data || 0) + 1)}
                                >
                                  {paginatedText.map((pageText, index) => (
                                    <div className="flipbook-page" key={`chapter-${selectedChapter}-page-${index}`} style={{ contain: 'layout style' }}>
                                      <div className="flipbook-page-inner" style={{ fontSize: `var(--reader-font-size, ${fontSize}px)` }}>
                                        <div className="flipbook-page-number">{index + 1}</div>
                                        <pre>{pageText}</pre>
                                      </div>
                                    </div>
                                  ))}
                                </HTMLFlipBook>
                              </div>
                            </>
                          )
                        ) : (
                          <pre className="plain-reader-para">{activeText}</pre>
                        )}
                      </section>
                    </div>
                  ) : (
                    <div className="chapter-content chapter-content-single">
                      {paginatedText.length > 0 ? (
                        plainMode ? (
                          <div
                            ref={plainScrollRef}
                            className="plain-reader"
                            style={{ fontSize: `var(--reader-font-size, ${fontSize}px)` }}
                          >
                            {paginatedText.map((pageText, index) => (
                              <p key={`plain-full-${index}`} className="plain-reader-para">{pageText}</p>
                            ))}
                          </div>
                        ) : (
                          <>
                            <div className="flipbook-controls">
                              <button className="control-btn" onClick={goToPreviousPage} disabled={currentPage <= 1}>◀ Prev</button>
                              <span className="flipbook-page-indicator">Page {currentPage} / {paginatedText.length}</span>
                              <button className="control-btn" onClick={goToNextPage} disabled={currentPage >= paginatedText.length}>Next ▶</button>
                            </div>
                            <div className="flipbook-wrapper">
                              <HTMLFlipBook
                                key="flip-full"
                                ref={flipBookRef}
                                width={560}
                                height={720}
                                size="stretch"
                                minWidth={280}
                                maxWidth={860}
                                minHeight={320}
                                maxHeight={960}
                                maxShadowOpacity={isMobile ? 0 : 0.25}
                                showCover={false}
                                mobileScrollSupport
                                usePortrait
                                className="flipbook"
                                startPage={0}
                                drawShadow={!isMobile}
                                flippingTime={400}
                                useMouseEvents={!isMobile}
                                onFlip={(event) => setCurrentPage((event.data || 0) + 1)}
                              >
                                {paginatedText.map((pageText, index) => (
                                  <div className="flipbook-page" key={`full-text-page-${index}`} style={{ contain: 'layout style' }}>
                                    <div className="flipbook-page-inner" style={{ fontSize: `var(--reader-font-size, ${fontSize}px)` }}>
                                      <div className="flipbook-page-number">{index + 1}</div>
                                      <pre>{pageText}</pre>
                                    </div>
                                  </div>
                                ))}
                              </HTMLFlipBook>
                            </div>
                          </>
                        )
                      ) : (
                        <pre className="plain-reader-para">{activeText}</pre>
                      )}
                    </div>
                  )}
                </div>
              )}
              {book.source === 'Google Books' && !textContent && (
                <div className="google-viewer-wrapper">
                  {googleViewerError ? (
                    <div className="reader-error" style={{padding: '20px', textAlign: 'center', color: '#92400e'}}>
                      <p>Preview not available</p>
                      <p style={{fontSize: '14px', marginTop: '10px'}}>Google Books preview is not accessible.</p>
                    </div>
                  ) : (
                    <div id="google-viewer" className="google-viewer"></div>
                  )}
                </div>
              )}
              {loadError && (
                <div className="reader-error" style={{padding: '20px', textAlign: 'center', color: '#d32f2f'}}>
                  <p>⚠️ Could not load book preview</p>
                  <p style={{fontSize: '14px', marginTop: '10px'}}>The book may not be available for embedded viewing</p>
                  <a href={book.infoLink} target="_blank" rel="noreferrer" style={{color: '#1976d2', textDecoration: 'underline'}}>Open in new window →</a>
                </div>
              )}
              {!loadError && !textContent && book.source !== 'Google Books' && readUrl && (
                <iframe
                  src={readUrl}
                  className="reader-iframe"
                  onLoad={() => {
                    console.log('✅ Book iframe loaded successfully')
                    setIframeLoaded(true)
                    setLoadError(false)
                  }}
                  onError={() => {
                    console.error('❌ Failed to load book iframe')
                    setLoadError(true)
                  }}
                  title={`${book.title} Reader`}
                  sandbox="allow-same-origin allow-scripts allow-popups allow-modals allow-forms allow-presentation"
                  style={{ width: '100%', height: '100%', border: 'none' }}
                ></iframe>
              )}
              {!loadError && !textContent && !readUrl && (
                <div className="reader-error" style={{padding: '20px', textAlign: 'center', color: '#92400e'}}>
                  <p>Full text not available for this title</p>
                  <p style={{fontSize: '14px', marginTop: '10px'}}>Try another book with full text/chapters, or use View Source.</p>
                </div>
              )}
            </div>

            {/* Reader Controls */}
            <div className="reader-controls">
              <button className="control-btn fullscreen-btn" onClick={handleFullscreen} title="Enter fullscreen">
                ⛶ Fullscreen
              </button>
            </div>
          </div>
        )}

        {/* Audio Tab */}
        {activeTab === 'audio' && (
          <div className="audio-section">
            <div className="audio-container">
              <div className="audio-icon-large">🎧</div>
              <h2>Listen to this Book</h2>

              {audioChaptersLoading ? (
                <div className="audio-resolving">
                  <div className="spinner"></div>
                  <p>Searching LibriVox &amp; Internet Archive…</p>
                </div>
              ) : audioChapters.length > 0 ? (
                <div className="audio-chapter-player">
                  {/* Active chapter player */}
                  {!audioChapterErrors[audioChapterIndex] && audioChapters[audioChapterIndex]?.audioUrl && (
                    <div className="audio-now-playing">
                      <div className="audio-chapter-label">
                        Chapter {audioChapterIndex + 1} of {audioChapters.length}
                      </div>
                      <div className="audio-chapter-name">
                        {audioChapters[audioChapterIndex].title}
                      </div>
                      <audio
                        ref={audioTabRef}
                        src={audioChapters[audioChapterIndex].audioUrl}
                        controls
                        className="audio-player"
                        preload="metadata"
                        onPlay={() => setAudioPlaying(true)}
                        onPause={() => setAudioPlaying(false)}
                        onTimeUpdate={(e) => setAudioTime(e.target.currentTime)}
                        onLoadedMetadata={(e) => { setAudioDuration(e.target.duration); setAudioBuffering(false) }}
                        onWaiting={() => setAudioBuffering(true)}
                        onCanPlay={() => setAudioBuffering(false)}
                        onEnded={() => {
                          setAudioPlaying(false)
                          if (audioChapterIndex < audioChapters.length - 1) {
                            setAudioChapterIndex(i => i + 1)
                          }
                        }}
                        onError={() => {
                          setAudioChapterErrors(prev => ({ ...prev, [audioChapterIndex]: true }))
                        }}
                      />
                      <div className="audio-chapter-nav">
                        <button
                          className="audio-nav-btn"
                          onClick={() => setAudioChapterIndex(i => Math.max(0, i - 1))}
                          disabled={audioChapterIndex === 0}
                        >⏮ Previous</button>
                        <button
                          className="audio-nav-btn"
                          onClick={() => setAudioChapterIndex(i => Math.min(audioChapters.length - 1, i + 1))}
                          disabled={audioChapterIndex >= audioChapters.length - 1}
                        >Next ⏭</button>
                      </div>
                    </div>
                  )}
                  {audioChapterErrors[audioChapterIndex] && (
                    <div className="audio-chapter-broken">
                      <p>⚠️ This chapter link is broken.</p>
                      {audioChapterIndex < audioChapters.length - 1 && (
                        <button className="audio-nav-btn" onClick={() => setAudioChapterIndex(i => i + 1)}>
                          Skip to Next →
                        </button>
                      )}
                    </div>
                  )}

                  {/* Chapter list */}
                  <div className="audio-chapter-list">
                    <h4>All Chapters</h4>
                    <div className="audio-chapter-scroll">
                      {audioChapters.map((ch, idx) => (
                        <button
                          key={ch.id}
                          className={`audio-chapter-row ${audioChapterIndex === idx ? 'active' : ''} ${audioChapterErrors[idx] ? 'broken' : ''}`}
                          onClick={() => !audioChapterErrors[idx] && setAudioChapterIndex(idx)}
                          disabled={audioChapterErrors[idx]}
                        >
                          <span className="audio-ch-num">{idx + 1}</span>
                          <span className="audio-ch-title">{ch.title}</span>
                          {audioChapterIndex === idx && audioPlaying && (
                            <span className="audio-ch-playing">▶</span>
                          )}
                          {audioChapterErrors[idx] && <span className="audio-ch-broken">⚠️</span>}
                          {ch.duration > 0 && !audioChapterErrors[idx] && (
                            <span className="audio-ch-dur">
                              {Math.floor(ch.duration / 60)}:{String(Math.floor(ch.duration % 60)).padStart(2, '0')}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="no-audio">
                  <p>No audiobook chapters found for this title.</p>
                  <small>
                    LibriVox and Internet Archive were searched.
                    {resolvedArchiveId && (
                      <> Try <a href={`https://archive.org/details/${resolvedArchiveId}`} target="_blank" rel="noreferrer">opening on Internet Archive</a> directly.</>
                    )}
                  </small>
                  <a
                    href={`https://librivox.org/?q=${encodeURIComponent(book.title || '')}&type=title&sort=alpha&search_form=advanced`}
                    target="_blank" rel="noreferrer"
                    className="audio-btn primary-btn"
                    style={{ marginTop: '1rem', display: 'inline-block' }}
                  >
                    🔍 Search LibriVox
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info Tab */}
        {activeTab === 'info' && (
          <div className="info-section">
            <div className="info-container">
              <div className="info-left">
                <img
                  src={getCoverSrc()}
                  alt={book.title}
                  className="info-cover"
                  onError={(e) => {
                    e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22%3E%3Crect fill=%236b7280%22 width=%22200%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2248%22 fill=%22white%22 text-anchor=%22middle%22%3E📕%3C/text%3E%3C/svg%3E'
                  }}
                />
                <div className="info-quick-stats">
                  <div className="stat">
                    <span className="stat-label">Pages:</span>
                    <span className="stat-value">{book.pageCount || 'N/A'}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Published:</span>
                    <span className="stat-value">{book.publishedDate}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Category:</span>
                    <span className="stat-value">{book.categories?.join(', ') || 'General'}</span>
                  </div>
                </div>
              </div>

              <div className="info-right">
                <h2>About This Book</h2>
                <p className="description">{book.description}</p>

                <div className="detailed-info">
                  <div className="info-detail-group">
                    <div className="detail-item">
                      <span className="detail-label">📖 Title:</span>
                      <span className="detail-value">{book.title}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">✍️ Author(s):</span>
                      <span className="detail-value">{book.authors}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">📅 Published:</span>
                      <span className="detail-value">{book.publishedDate}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">📄 Pages:</span>
                      <span className="detail-value">{book.pageCount || 'N/A'}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">🏷️ Categories:</span>
                      <span className="detail-value">{book.categories?.join(', ') || 'General'}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">📚 Source:</span>
                      <span className="detail-value">{book.source}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">✅ Availability:</span>
                      <span className="detail-value">
                        {book.isFullAvailable ? '🟢 Full Book Available' : book.hasPreview ? '🟡 Preview Only' : '🔴 Not Available'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="info-actions">
                  <a href={book.infoLink} target="_blank" rel="noreferrer" className="action-btn">
                    📚 View on {book.source}
                  </a>
                  <button className="action-btn secondary" onClick={() => setActiveTab('read')}>
                    📖 Start Reading
                  </button>
                </div>

                {book.source === 'Internet Archive' && (
                  <div className="archive-info">
                    <h3>From Internet Archive</h3>
                    <p>
                      This book is part of the Internet Archive collection, a non-profit library offering free access to millions of
                       books, texts, and other materials. Visit archive.org to explore millions more!
                    </p>
                  </div>
                )}

                {book.source === 'Project Gutenberg' && (
                  <div className="archive-info">
                    <h3>From Project Gutenberg</h3>
                    <p>
                      This classic book is in the public domain and offered freely by Project Gutenberg, a volunteer effort to digitize
                       and archive cultural works. Visit gutenberg.org to explore thousands more!
                    </p>
                  </div>
                )}

                {book.source === 'Google Books' && (
                  <div className="archive-info">
                    <h3>From Google Books</h3>
                    <p>
                      This book is indexed through Google Books and shown here only when free/public access is available.
                    </p>
                  </div>
                )}

                {book.source === 'Open Library' && (
                  <div className="archive-info">
                    <h3>From Open Library</h3>
                    <p>
                      This book is available through Open Library public scans from the Internet Archive ecosystem.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BookReader
