import { useState, useEffect, useCallback, useRef } from 'react'
import '../styles/BookStore.css'
import BookGrid from './BookGrid'

const DEFAULT_TRAILER_CARDS = [
  {
    id: 'frankenstein-1931',
    title: 'Frankenstein (1931)',
    image: 'https://i.ytimg.com/vi/AfH4fH9T8qU/hqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=bJ2YQ4Q5xGQ',
  },
  {
    id: 'his-girl-friday',
    title: 'His Girl Friday (1940)',
    image: 'https://i.ytimg.com/vi/cUQ8fE6Gf4I/hqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=6wAaXfxPi3g',
  },
  {
    id: 'night-of-living-dead',
    title: 'Night of the Living Dead',
    image: 'https://i.ytimg.com/vi/H91BxkBXttE/hqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=0TAGtIQvebs',
  },
  {
    id: 'charade',
    title: 'Charade (1963)',
    image: 'https://i.ytimg.com/vi/3z4xXb2JfCI/hqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=0fM7kL9J4uo',
  },
]

const SOURCE_LABELS = {
  gutenberg:       'Gutenberg',
  internetArchive: 'Internet Archive',
  librivox:        'LibriVox',
  googleBooks:     'Google Books',
  openLibrary:     'Open Library',
}

function BookStore({ onReadBook }) {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [searchQuery, setSearchQuery] = useState('fiction')
  const [searchInput, setSearchInput] = useState('')
  const [error, setError] = useState(null)
  const [sourceStatus, setSourceStatus] = useState({})

  const [showAuthSection, setShowAuthSection] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [authError, setAuthError] = useState('')
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem('bookpulse-auth') === 'true')

  const [trailerCards, setTrailerCards] = useState([])
  const [trailerLoading, setTrailerLoading] = useState(true)
  const [activeTrailer, setActiveTrailer] = useState(null)

  const API_BASE = import.meta.env.VITE_API_BASE || ''
  const UNIFIED_SEARCH_API = `${API_BASE}/api/search/unified`
  const MOVIE_TRAILERS_API = `${API_BASE}/api/movies/trailers`

  // Abort controller ref to cancel in-flight requests on new search
  const abortRef = useRef(null)

  const fetchBooks = useCallback(async (query, pageParam = 1, append = false) => {
    // Cancel any previous in-flight search
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setSourceStatus({})
      setError(null)
    }

    try {
      const url = `${UNIFIED_SEARCH_API}?query=${encodeURIComponent(query)}&page=${pageParam}`
      const resp = await fetch(url, { signal: controller.signal })

      if (!resp.ok) throw new Error(`Search returned ${resp.status}`)

      const data = await resp.json()

      // Update source status badges
      if (data.sourceStatus && Object.keys(data.sourceStatus).length > 0) {
        setSourceStatus(data.sourceStatus)
      }

      const incoming = Array.isArray(data.books) ? data.books : []

      if (append) {
        setBooks(prev => {
          const existingIds = new Set(prev.map(b => b.id))
          const fresh = incoming.filter(b => !existingIds.has(b.id))
          if (fresh.length === 0) { setHasMore(false); return prev }
          setHasMore(fresh.length >= 10)
          return [...prev, ...fresh]
        })
      } else {
        setBooks(incoming)
        setHasMore(incoming.length >= 20)
        if (incoming.length === 0) {
          setError('No books found. Try a title, author, or genre like "mystery" or "Shakespeare".')
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return // cancelled by new search — silent
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setError('Could not connect to search. Check your connection and try again.')
      } else {
        setError('Search failed. Please try again.')
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [UNIFIED_SEARCH_API])

  // Initial load
  useEffect(() => {
    fetchBooks('fiction', 1, false)
  }, [fetchBooks])

  const handleSearch = (query) => {
    setSearchQuery(query)
    setPage(1)
    fetchBooks(query, 1, false)
  }

  const handleLoadMore = () => {
    const next = page + 1
    setPage(next)
    fetchBooks(searchQuery, next, true)
  }

  const handleReadNow = (book) => { onReadBook(book) }

  const handleSearchSubmit = (event) => {
    event.preventDefault()
    const query = searchInput.trim()
    if (!query) return
    handleSearch(query)
  }

  const featuredTextBooks = books.filter((book) => book.hasText).slice(0, 4)
  const featuredAudioBooks = books.filter((book) => book.hasAudio).slice(0, 2)

  const handleAuthInputChange = (event) => {
    const { name, value } = event.target
    setAuthForm((prev) => ({ ...prev, [name]: value }))
  }

  const openAuthSection = (mode = 'login') => {
    setAuthMode(mode)
    setShowAuthSection(true)
    setAuthError('')
    setTimeout(() => {
      document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  const handleBrowseAllClick = () => {
    if (!isAuthenticated) { openAuthSection('login'); return }
    document.getElementById('all-books')?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleAuthSubmit = (event) => {
    event.preventDefault()
    const email = authForm.email.trim()
    const password = authForm.password.trim()
    if (!email || !password) { setAuthError('Please enter email and password.'); return }
    if (authMode === 'signup') {
      if (!authForm.name.trim()) { setAuthError('Please enter your name.'); return }
      if (password.length < 6) { setAuthError('Password must be at least 6 characters.'); return }
      if (password !== authForm.confirmPassword.trim()) { setAuthError('Passwords do not match.'); return }
    }
    localStorage.setItem('bookpulse-auth', 'true')
    localStorage.setItem('bookpulse-user-email', email)
    setIsAuthenticated(true)
    setShowAuthSection(false)
    setAuthError('')
    setAuthForm({ name: '', email: '', password: '', confirmPassword: '' })
    setTimeout(() => { document.getElementById('all-books')?.scrollIntoView({ behavior: 'smooth' }) }, 120)
  }

  const handleLogout = () => {
    localStorage.removeItem('bookpulse-auth')
    localStorage.removeItem('bookpulse-user-email')
    setIsAuthenticated(false)
    setShowAuthSection(false)
  }

  const toEmbedUrl = (url) => {
    if (!url || typeof url !== 'string') return ''
    const youtubeMatch = url.match(/[?&]v=([^&]+)/)
    if (youtubeMatch?.[1]) return `https://www.youtube.com/embed/${youtubeMatch[1]}?autoplay=1&rel=0`
    const shortMatch = url.match(/youtu\.be\/([^?&]+)/)
    if (shortMatch?.[1]) return `https://www.youtube.com/embed/${shortMatch[1]}?autoplay=1&rel=0`
    return url
  }

  const openTrailer = (trailer) => { setActiveTrailer({ ...trailer, embedUrl: toEmbedUrl(trailer.url) }) }
  const closeTrailer = () => { setActiveTrailer(null) }

  useEffect(() => {
    const fetchMovieTrailers = async () => {
      const trailerTitles = Array.from(new Set([
        ...books.filter((book) => book.hasText).map((book) => String(book.title || '').trim()).filter(Boolean),
        ...DEFAULT_TRAILER_CARDS.map((item) => item.title),
      ])).slice(0, 12)

      setTrailerLoading(true)
      try {
        const response = await fetch(`${MOVIE_TRAILERS_API}?titles=${encodeURIComponent(trailerTitles.join(','))}`)
        const data = await response.json()
        if (Array.isArray(data?.results) && data.results.length > 0) {
          setTrailerCards(data.results)
        } else {
          setTrailerCards(DEFAULT_TRAILER_CARDS)
        }
      } catch {
        setTrailerCards(DEFAULT_TRAILER_CARDS)
      } finally {
        setTrailerLoading(false)
      }
    }
    fetchMovieTrailers()
  }, [MOVIE_TRAILERS_API, books])

  // Source status summary for display
  const statusEntries = Object.entries(sourceStatus)
  const totalFound = books.length

  return (
    <div className="bookstore">
      <header className="book-hero">
        <nav className="book-nav">
          <div className="book-nav-left">
            <button type="button">Home</button>
            <button type="button">Categories</button>
            <button type="button">E-Readers</button>
          </div>
          <div className="book-brand">
            <h1>OpenLibraryHub</h1>
            <p>Free Books - Public Domain</p>
          </div>
          <div className="book-nav-right">
            {isAuthenticated ? (
              <button type="button" onClick={handleLogout}>Logout</button>
            ) : (
              <>
                <button type="button" onClick={() => openAuthSection('login')}>Login</button>
                <button type="button" onClick={() => openAuthSection('signup')}>Sign Up</button>
              </>
            )}
          </div>
        </nav>

        <div className="hero-content">
          <h2>Explore the World&apos;s Knowledge</h2>
          <p>All Books Available Free in the Public Domain</p>
          <form className="hero-search" onSubmit={handleSearchSubmit}>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search for Books..."
            />
            <button type="submit">Search</button>
          </form>
        </div>
      </header>

      <section className="spotlight-section">
        <div className="spotlight-panel">
          <h3>Free Classic Books</h3>
          <p>Timeless Literature + Curated Audiobooks</p>

          <div className="mini-book-group">
            <h4>Classic Reads</h4>
            <div className="mini-book-row">
              {featuredTextBooks.length > 0 ? (
                featuredTextBooks.map((book) => (
                  <button key={book.id} type="button" className="mini-book" onClick={() => handleReadNow(book)}>
                    <img src={book.image || `https://via.placeholder.com/128x200?text=${encodeURIComponent(book.title)}`} alt={book.title} loading="lazy" />
                    <span className="mini-book-caption">{book.title}</span>
                  </button>
                ))
              ) : (
                <div className="spotlight-loading">Loading classics...</div>
              )}
            </div>
          </div>

          <div className="mini-book-group audio-group">
            <h4>Featured Audiobooks</h4>
            <div className="mini-book-row audio-row">
              {featuredAudioBooks.length > 0 ? (
                featuredAudioBooks.map((book) => (
                  <button key={book.id} type="button" className="mini-book audio" onClick={() => handleReadNow(book)}>
                    <img src={book.image || `https://via.placeholder.com/128x200?text=${encodeURIComponent(book.title)}`} alt={book.title} loading="lazy" />
                    <span className="audio-pill">🎧 AUDIO</span>
                    <span className="mini-book-caption">{book.title}</span>
                  </button>
                ))
              ) : (
                <div className="spotlight-loading">Loading audiobooks...</div>
              )}
            </div>
          </div>

          <button type="button" className="panel-btn" onClick={handleBrowseAllClick}>
            Browse All Books {isAuthenticated ? '' : '(Login Required)'}
          </button>
        </div>

        <div className="spotlight-panel">
          <h3>Books Turned Into Movies</h3>
          <p>Watch Trailers Free — Only Listed Adaptations</p>
          {trailerLoading ? (
            <div className="spotlight-loading">Loading movie trailers...</div>
          ) : (
            <div className="trailer-grid-small">
              {trailerCards.slice(0, 4).map((trailer) => (
                <button key={trailer.id} type="button" className="trailer-card" onClick={() => openTrailer(trailer)}>
                  <img
                    src={trailer.image} alt={trailer.title} loading="lazy" className="trailer-thumb"
                    onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/640x360?text=Classic+Film+Trailer' }}
                  />
                  <span className="trailer-play">▶</span>
                  <span>WATCH TRAILER</span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button" className="panel-btn secondary"
            onClick={() => document.getElementById('movie-trailers')?.scrollIntoView({ behavior: 'smooth' })}
          >
            View All Movie Trailers
          </button>
        </div>
      </section>

      {showAuthSection && !isAuthenticated && (
        <section className="auth-gate" id="auth-section">
          <h3>{authMode === 'login' ? 'Login to Browse All Books' : 'Create Account to Browse All Books'}</h3>
          <p>You can still watch trailers for free in the movie section above.</p>
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === 'signup' && (
              <input type="text" name="name" placeholder="Full Name" value={authForm.name} onChange={handleAuthInputChange} />
            )}
            <input type="email" name="email" placeholder="Email" value={authForm.email} onChange={handleAuthInputChange} />
            <input type="password" name="password" placeholder="Password" value={authForm.password} onChange={handleAuthInputChange} />
            {authMode === 'signup' && (
              <input type="password" name="confirmPassword" placeholder="Confirm Password" value={authForm.confirmPassword} onChange={handleAuthInputChange} />
            )}
            {authError && <p className="auth-error">{authError}</p>}
            <button type="submit" className="auth-submit">
              {authMode === 'login' ? 'Login' : 'Create Account'}
            </button>
          </form>
          <div className="auth-switch">
            {authMode === 'login' ? (
              <button type="button" onClick={() => setAuthMode('signup')}>Need an account? Sign Up</button>
            ) : (
              <button type="button" onClick={() => setAuthMode('login')}>Already have an account? Login</button>
            )}
          </div>
        </section>
      )}

      <section className="featured-trailers" id="movie-trailers">
        <h3>Featured Movie Trailers</h3>
        <p>Classic Films Now in the Public Domain</p>
        <div className="trailer-grid-large">
          {trailerCards.slice(0, 6).map((trailer) => (
            <button key={`featured-${trailer.id}`} type="button" className="trailer-card large" onClick={() => openTrailer(trailer)}>
              <img
                src={trailer.image} alt={trailer.title} loading="lazy" className="trailer-thumb"
                onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/640x360?text=Classic+Film+Trailer' }}
              />
              <span className="trailer-play">▶</span>
              <span>WATCH TRAILER</span>
              <small className="trailer-meta">{trailer.title} • {trailer.year || 'Classic'}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="action-bar">
        <h4>Read &amp; Watch for Free – No Registration Required!</h4>
        <div className="action-buttons">
          <button type="button" className="action-btn read" onClick={handleBrowseAllClick}>
            Start Reading
          </button>
          <a className="action-btn watch" href={(trailerCards[0] || DEFAULT_TRAILER_CARDS[0]).url} target="_blank" rel="noreferrer">
            Watch Movies
          </a>
        </div>
      </section>

      {/* ── Search Results ───────────────────────────────────────────────────── */}

      {error && !loading && (
        <div className="error-message">
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <p>Searching across 5 public-domain sources…</p>
          <small>Gutenberg · Internet Archive · LibriVox · Google Books · Open Library</small>
        </div>
      ) : books.length > 0 ? (
        <>
          <div className="results-info" id="all-books">
            <p>Found {totalFound} books for &ldquo;{searchQuery}&rdquo;</p>
          </div>

          {/* Source status bar */}
          {statusEntries.length > 0 && (
            <div className="source-status-bar">
              {statusEntries.map(([key, status]) => (
                <span key={key} className={`source-pill ${status.ok ? 'ok' : 'fail'}`}>
                  {SOURCE_LABELS[key] || key}
                  {status.ok ? ` · ${status.count}` : ' · failed'}
                </span>
              ))}
            </div>
          )}

          <BookGrid books={books} onReadNow={handleReadNow} />

          {hasMore && (
            <div className="load-more-wrap">
              <button className="load-more-btn" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <span className="load-more-spinner">Loading…</span>
                ) : (
                  'Load More Books'
                )}
              </button>
            </div>
          )}
        </>
      ) : !error ? (
        <div className="no-books">
          <p>📭 No books loaded yet. Please try searching!</p>
        </div>
      ) : null}

      {activeTrailer && (
        <div className="trailer-modal" onClick={closeTrailer}>
          <div className="trailer-modal-content" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="trailer-close" onClick={closeTrailer}>✕</button>
            <h3>{activeTrailer.title}</h3>
            <div className="trailer-player-wrap">
              <iframe
                src={activeTrailer.embedUrl}
                title={`${activeTrailer.title} trailer`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BookStore
