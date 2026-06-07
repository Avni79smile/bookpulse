import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import './styles/App.css'
import BookReader from './components/BookReader'
import { getBookmarks, getDeviceId } from './utils/userLib'
import { clearAuth, getCurrentUser, setAuth } from './utils/auth.js'

const RANDOM_SEARCH_TERMS = [
  'classic literature',
  'public domain fiction',
  'victorian novel',
  'adventure novel',
  'historical fiction',
  'romance classic',
  'science fiction classic',
  'mystery novel',
]

const gCover = (id, title) =>
  `/api/cover?url=${encodeURIComponent(`https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`)}&title=${encodeURIComponent(title)}`

const ytCover = (videoId, title) =>
  `/api/cover?url=${encodeURIComponent(`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`)}&title=${encodeURIComponent(title)}`

const FALLBACK_BOOKS = [
  {
    id: 'gutenberg-1342',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    authors: 'Jane Austen',
    image: gCover(1342, 'Pride and Prejudice'),
    description: 'Public-domain text from Project Gutenberg.',
    isFullAvailable: true,
    hasPreview: true,
    hasAudio: false,
    hasText: true,
    tags: ['full', 'classic', 'public-domain'],
    previewLink: 'https://www.gutenberg.org/ebooks/1342',
    textLink: 'https://www.gutenberg.org/files/1342/1342-0.txt',
    publishedDate: 'Public Domain',
    pageCount: 0,
    infoLink: 'https://www.gutenberg.org/ebooks/1342',
    source: 'Project Gutenberg',
    categories: ['Classic Literature'],
  },
  {
    id: 'gutenberg-84',
    title: 'Frankenstein; or, The Modern Prometheus',
    author: 'Mary Wollstonecraft Shelley',
    authors: 'Mary Wollstonecraft Shelley',
    image: gCover(84, 'Frankenstein'),
    description: 'Public-domain text from Project Gutenberg.',
    isFullAvailable: true,
    hasPreview: true,
    hasAudio: false,
    hasText: true,
    tags: ['full', 'classic', 'public-domain'],
    previewLink: 'https://www.gutenberg.org/ebooks/84',
    textLink: 'https://www.gutenberg.org/files/84/84-0.txt',
    publishedDate: 'Public Domain',
    pageCount: 0,
    infoLink: 'https://www.gutenberg.org/ebooks/84',
    source: 'Project Gutenberg',
    categories: ['Classic Literature'],
  },
  {
    id: 'gutenberg-35',
    title: 'The Time Machine',
    author: 'H. G. Wells',
    authors: 'H. G. Wells',
    image: gCover(35, 'The Time Machine'),
    description: 'Public-domain text from Project Gutenberg.',
    isFullAvailable: true,
    hasPreview: true,
    hasAudio: false,
    hasText: true,
    tags: ['full', 'classic', 'public-domain'],
    previewLink: 'https://www.gutenberg.org/ebooks/35',
    textLink: 'https://www.gutenberg.org/files/35/35-0.txt',
    publishedDate: 'Public Domain',
    pageCount: 0,
    infoLink: 'https://www.gutenberg.org/ebooks/35',
    source: 'Project Gutenberg',
    categories: ['Classic Literature'],
  },
  {
    id: 'gutenberg-345',
    title: 'Dracula',
    author: 'Bram Stoker',
    authors: 'Bram Stoker',
    image: gCover(345, 'Dracula'),
    description: 'Public-domain text from Project Gutenberg.',
    isFullAvailable: true,
    hasPreview: true,
    hasAudio: false,
    hasText: true,
    tags: ['full', 'classic', 'public-domain'],
    previewLink: 'https://www.gutenberg.org/ebooks/345',
    textLink: 'https://www.gutenberg.org/files/345/345-0.txt',
    publishedDate: 'Public Domain',
    pageCount: 0,
    infoLink: 'https://www.gutenberg.org/ebooks/345',
    source: 'Project Gutenberg',
    categories: ['Classic Literature'],
  },
  {
    id: 'gutenberg-120',
    title: 'Treasure Island',
    author: 'Robert Louis Stevenson',
    authors: 'Robert Louis Stevenson',
    image: gCover(120, 'Treasure Island'),
    description: 'Public-domain text from Project Gutenberg.',
    isFullAvailable: true,
    hasPreview: true,
    hasAudio: false,
    hasText: true,
    tags: ['full', 'classic', 'public-domain'],
    previewLink: 'https://www.gutenberg.org/ebooks/120',
    textLink: 'https://www.gutenberg.org/files/120/120-0.txt',
    publishedDate: 'Public Domain',
    pageCount: 0,
    infoLink: 'https://www.gutenberg.org/ebooks/120',
    source: 'Project Gutenberg',
    categories: ['Classic Literature'],
  },
  {
    id: 'gutenberg-1260',
    title: 'Jane Eyre: An Autobiography',
    author: 'Charlotte Brontë',
    authors: 'Charlotte Brontë',
    image: gCover(1260, 'Jane Eyre'),
    description: 'Public-domain text from Project Gutenberg.',
    isFullAvailable: true,
    hasPreview: true,
    hasAudio: false,
    hasText: true,
    tags: ['full', 'classic', 'public-domain'],
    previewLink: 'https://www.gutenberg.org/ebooks/1260',
    textLink: 'https://www.gutenberg.org/files/1260/1260-0.txt',
    publishedDate: 'Public Domain',
    pageCount: 0,
    infoLink: 'https://www.gutenberg.org/ebooks/1260',
    source: 'Project Gutenberg',
    categories: ['Classic Literature'],
  },
  {
    id: 'gutenberg-514',
    title: 'Little Women',
    author: 'Louisa May Alcott',
    authors: 'Louisa May Alcott',
    image: gCover(514, 'Little Women'),
    description: 'Public-domain text from Project Gutenberg.',
    isFullAvailable: true,
    hasPreview: true,
    hasAudio: false,
    hasText: true,
    tags: ['full', 'classic', 'public-domain'],
    previewLink: 'https://www.gutenberg.org/ebooks/514',
    textLink: 'https://www.gutenberg.org/files/514/514-0.txt',
    publishedDate: 'Public Domain',
    pageCount: 0,
    infoLink: 'https://www.gutenberg.org/ebooks/514',
    source: 'Project Gutenberg',
    categories: ['Classic Literature'],
  },
]

const FALLBACK_MOVIES = [
  { id: 'fm-1', title: 'Pride and Prejudice', year: '2005', image: ytCover('Ur_DIHs92NM', 'Pride and Prejudice'), url: 'https://www.youtube.com/watch?v=Ur_DIHs92NM', sourceBookTitle: 'Pride and Prejudice' },
  { id: 'fm-2', title: 'Frankenstein', year: '1931', image: ytCover('2onU6r6AqOU', 'Frankenstein'), url: 'https://www.youtube.com/watch?v=2onU6r6AqOU', sourceBookTitle: 'Frankenstein' },
  { id: 'fm-3', title: 'The Time Machine', year: '1960', image: ytCover('36x6dXEX7UM', 'The Time Machine'), url: 'https://www.youtube.com/watch?v=36x6dXEX7UM', sourceBookTitle: 'The Time Machine' },
  { id: 'fm-4', title: 'Treasure Island', year: '1950', image: ytCover('3Tla1M4Daok', 'Treasure Island'), url: 'https://www.youtube.com/watch?v=3Tla1M4Daok', sourceBookTitle: 'Treasure Island' },
  { id: 'fm-5', title: 'Jane Eyre', year: '2011', image: ytCover('Rs8MlqyT6H0', 'Jane Eyre'), url: 'https://www.youtube.com/watch?v=Rs8MlqyT6H0', sourceBookTitle: 'Jane Eyre' },
  { id: 'fm-6', title: 'Little Women', year: '2019', image: ytCover('AST2-4db4ic', 'Little Women'), url: 'https://www.youtube.com/watch?v=AST2-4db4ic', sourceBookTitle: 'Little Women' },
]

const navItems = [
  { label: 'Home', sectionId: 'home' },
  { label: 'Browse Books', sectionId: 'all-books' },
  { label: 'Books into Movies', sectionId: 'movies' },
  { label: 'Movie Trailers', sectionId: 'movies' },
  { label: 'My Library', sectionId: 'my-library' },
  { label: 'About', sectionId: 'why' },
]

const whyItems = [
  '100% Free',
  'No Login Required',
  'Books + Trailers',
  'Multi-Format (PDF, ePub, Kindle)',
  'New Books Added Weekly',
]

const shuffle = (items) => [...items].sort(() => Math.random() - 0.5)

const pickGutenbergTextLink = (formats = {}) => {
    const entries = Object.entries(formats).filter(([, value]) => typeof value === 'string' && value)
    const candidates = entries
      .map(([mime, url]) => ({ mime: String(mime).toLowerCase(), url: String(url).replace(/^http:\/\//i, 'https://') }))
      .filter(({ mime, url }) => !/zip|gzip|x-bzip2|x-rar/i.test(mime) && !/\.(zip|gz|bz2|rar)(\?|$)/i.test(url))

    const preferred = [
      candidates.find(({ mime }) => /text\/plain/.test(mime) && /utf-8/.test(mime)),
      candidates.find(({ mime }) => /text\/plain/.test(mime)),
      candidates.find(({ mime }) => /text\/html/.test(mime) && /utf-8/.test(mime)),
      candidates.find(({ mime }) => /text\/html/.test(mime)),
      candidates.find(({ mime }) => /text\//.test(mime)),
    ].find(Boolean)

    return preferred?.url || ''
}

const mapGutenbergBook = (item) => {
    const textLink = pickGutenbergTextLink(item?.formats || {})
    if (!textLink) {
      return null
    }

    const title = String(item?.title || 'Untitled').replace(/\s+/g, ' ').trim()
    const authors = Array.isArray(item?.authors) && item.authors.length > 0
      ? item.authors.map((author) => author.name).join(', ')
      : 'Unknown Author'

    const cover = item?.formats?.['image/jpeg'] || `https://covers.openlibrary.org/b/title/${encodeURIComponent(title)}-M.jpg`

    return {
      id: `gutenberg-${item.id}`,
      title,
      author: authors,
      authors,
      image: cover,
      description: `Public-domain text from Project Gutenberg.`,
      isFullAvailable: true,
      hasPreview: true,
      hasAudio: false,
      hasText: true,
      tags: ['full', 'classic', 'public-domain'],
      previewLink: `https://www.gutenberg.org/ebooks/${item.id}`,
      textLink,
      publishedDate: 'Public Domain',
      pageCount: 0,
      infoLink: `https://www.gutenberg.org/ebooks/${item.id}`,
      source: 'Project Gutenberg',
      categories: Array.isArray(item?.subjects) ? item.subjects.slice(0, 3) : ['Classic Literature'],
  }
}

const getYouTubeVideoId = (url) => {
    if (!url || typeof url !== 'string') {
      return ''
    }

    try {
      const parsed = new URL(url)
      if (parsed.hostname.includes('youtu.be')) {
        return parsed.pathname.replace('/', '')
      }
      if (parsed.searchParams.get('v')) {
        return parsed.searchParams.get('v')
      }
      if (parsed.pathname.includes('/embed/')) {
        return parsed.pathname.split('/embed/')[1]
      }
      return ''
    } catch {
      return ''
    }
}

const getTrailerEmbedUrl = (url) => {
  const id = getYouTubeVideoId(url)
  return id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : ''
}

function App() {
  const API_BASE = import.meta.env.VITE_API_BASE || ''
  const GUTENBERG_API = `${API_BASE}/api/gutenberg/search`
  const MOVIE_TRAILERS_API = `${API_BASE}/api/movies/trailers`

  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTag, setActiveTag] = useState('All Books')
  const [activeNav, setActiveNav] = useState('Home')
  const [books, setBooks] = useState(FALLBACK_BOOKS)
  const [allBooks, setAllBooks] = useState([])
  const [movieBooks, setMovieBooks] = useState(FALLBACK_MOVIES)
  const [topDownloads, setTopDownloads] = useState(FALLBACK_BOOKS.slice(0, 5).map((book) => book.title))
  const [activeTrailer, setActiveTrailer] = useState(null)
  const [selectedBook, setSelectedBook] = useState(null)
  const [visibleBookCount, setVisibleBookCount] = useState(24)
  const [myBookmarks, setMyBookmarks] = useState([])
  const [bookmarksLoaded, setBookmarksLoaded] = useState(false)
  const [darkMode, setDarkMode] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  const [lastRead, setLastRead] = useState(() => {
    try {
      const raw = localStorage.getItem('reader-last-read')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser())
  const [googleClientId, setGoogleClientId] = useState('')
  const [showAuthMenu, setShowAuthMenu] = useState(false)
  const googleBtnRef = useRef(null)

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
  }, [darkMode])

  // Fetch Google client ID and initialize GIS when the script is ready
  useEffect(() => {
    fetch('/api/auth/config')
      .then((r) => r.json())
      .then(({ clientId }) => {
        if (!clientId) return
        setGoogleClientId(clientId)
      })
      .catch(() => {})
  }, [])

  // Render Google Sign-In button whenever clientId or ref becomes available
  useEffect(() => {
    if (!googleClientId || !googleBtnRef.current) return
    const tryRender = () => {
      if (!window.google?.accounts?.id) return
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      })
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'medium',
        shape: 'pill',
        text: 'signin_with',
        logo_alignment: 'left',
      })
    }
    // GIS script might not be loaded yet — poll briefly
    if (window.google?.accounts?.id) {
      tryRender()
    } else {
      const t = setInterval(() => {
        if (window.google?.accounts?.id) { clearInterval(t); tryRender() }
      }, 200)
      return () => clearInterval(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleClientId, showAuthMenu])

  const handleGoogleCredential = useCallback(async (response) => {
    try {
      // Capture guest device_id BEFORE setting auth (so migration can happen)
      const guestDeviceId = getDeviceId()
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential, deviceId: guestDeviceId }),
      })
      if (!res.ok) throw new Error('Sign-in failed')
      const { token, user } = await res.json()
      setAuth(token, user)
      setCurrentUser(user)
      setShowAuthMenu(false)
      loadMyBookmarks()
    } catch {
      console.error('Google sign-in failed')
    }
  }, []) // loadMyBookmarks added below via ref pattern

  const handleLogout = useCallback(() => {
    clearAuth()
    setCurrentUser(null)
    setShowAuthMenu(false)
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect()
    }
    loadMyBookmarks()
  }, []) // loadMyBookmarks added below

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        const fetchGutenbergSearch = async (term, page) => {
          const localUrl = `${GUTENBERG_API}?query=${encodeURIComponent(term)}&page=${page}`
          try {
            const localResponse = await fetch(localUrl)
            if (localResponse.ok) {
              return await localResponse.json()
            }
          } catch {
            // local proxy failed — fall through to direct Gutendex
          }

          const directUrl = `https://gutendex.com/books/?search=${encodeURIComponent(term)}&page=${page}`
          const directResponse = await fetch(directUrl)
          if (!directResponse.ok) {
            throw new Error(`Failed to fetch Gutenberg search for ${term}`)
          }
          return directResponse.json()
        }

        const requests = [
          ...RANDOM_SEARCH_TERMS.slice(0, 4).map((term) => fetchGutenbergSearch(term, 1).catch(() => ({ results: [] }))),
          ...RANDOM_SEARCH_TERMS.slice(4, 8).map((term) => fetchGutenbergSearch(term, 2).catch(() => ({ results: [] }))),
        ]

        const responses = await Promise.all(requests)
        const combined = responses.flatMap((payload) => (Array.isArray(payload?.results) ? payload.results : []))

        const normalized = combined.map(mapGutenbergBook).filter(Boolean)
        const uniqueMap = new Map()
        for (const item of normalized) {
          const key = item.title.toLowerCase()
          if (!uniqueMap.has(key)) {
            uniqueMap.set(key, item)
          }
        }

        const publicDomainBooks = shuffle(Array.from(uniqueMap.values()))
        const selectedBooks = publicDomainBooks.length > 0 ? publicDomainBooks : FALLBACK_BOOKS

        setAllBooks(selectedBooks)
        setBooks(shuffle(selectedBooks).slice(0, 7))
        setTopDownloads(shuffle(selectedBooks).slice(0, 5).map((item) => item.title))

        const titleQuery = selectedBooks.map((item) => item.title).join('|')
        const movieResponse = await fetch(`${MOVIE_TRAILERS_API}?titles=${encodeURIComponent(titleQuery)}`)
        const movieData = await movieResponse.json()
        const randomMovies = Array.isArray(movieData?.results)
          ? shuffle(movieData.results).slice(0, 6)
          : []

        setMovieBooks(randomMovies.length > 0 ? randomMovies : FALLBACK_MOVIES)
      } catch {
        setBooks(FALLBACK_BOOKS)
        setAllBooks(FALLBACK_BOOKS)
        setMovieBooks(FALLBACK_MOVIES)
        setTopDownloads(FALLBACK_BOOKS.slice(0, 5).map((book) => book.title))
      }
    }

    loadHomeData()
  }, [GUTENBERG_API, MOVIE_TRAILERS_API])

  useEffect(() => {
    const onEscape = (event) => {
      if (event.key === 'Escape') {
        setActiveTrailer(null)
      }
    }

    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [])

  const scrollToSection = (sectionId, navLabel) => {
    const section = document.getElementById(sectionId)
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.history.replaceState(null, '', `#${sectionId}`)
    }

    if (navLabel) {
      setActiveNav(navLabel)
    }
  }

  const handleSearchSubmit = (event) => {
    event.preventDefault()
    const normalized = searchInput.trim().toLowerCase()
    setSearchTerm(normalized)
    setActiveTag('All Books')
    scrollToSection('collection')
  }

  const applySearch = useCallback((text) => {
    if (!searchTerm) {
      return true
    }
    return text.toLowerCase().includes(searchTerm)
  }, [searchTerm])

  const filteredCategories = useMemo(() => {
    if (activeTag === 'Made into Movies' || activeTag === 'With Trailer') {
      return []
    }

    return books.filter((book) => applySearch(`${book.title} ${book.author}`))
  }, [activeTag, books, applySearch])

  const filteredLibraryBooks = useMemo(() => {
    if (activeTag === 'Made into Movies' || activeTag === 'With Trailer') {
      return []
    }
    return allBooks.filter((book) => applySearch(`${book.title} ${book.author}`))
  }, [activeTag, allBooks, applySearch])

  const filteredMovies = useMemo(() => {
    return movieBooks.filter((movie) => {
      const matchesSearch = applySearch(`${movie.title} ${movie.year || ''} ${movie.sourceBookTitle || ''}`)
      if (!matchesSearch) {
        return false
      }

      if (activeTag === 'Free eBooks') {
        return false
      }

      if (activeTag === 'With Trailer') {
        return Boolean(getTrailerEmbedUrl(movie.url))
      }

      return true
    })
  }, [activeTag, movieBooks, applySearch])

  const handleTagClick = (tagLabel) => {
    setActiveTag(tagLabel)

    if (tagLabel === 'Free eBooks' || tagLabel === 'Genres') {
      scrollToSection('collection')
      return
    }

    if (tagLabel === 'Made into Movies' || tagLabel === 'With Trailer') {
      scrollToSection('movies')
    }
  }

  const handleDownloadAll = () => {
    const blob = new Blob([topDownloads.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'top-downloads.txt'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const openTrailer = (movie) => {
    setActiveTrailer(movie)
  }

  const handleReadBook = (book) => {
    setSelectedBook(book)
  }

  const loadMyBookmarks = useCallback(async () => {
    const bms = await getBookmarks()
    setMyBookmarks(bms)
    setBookmarksLoaded(true)
  }, [])

  useEffect(() => {
    loadMyBookmarks()
  }, [loadMyBookmarks])

  const handleBackToLibrary = () => {
    setSelectedBook(null)
    loadMyBookmarks()
  }

  if (selectedBook) {
    return <BookReader book={selectedBook} onBack={handleBackToLibrary} />
  }

  return (
    <div className="app shell" id="home">
      <header className="hero" id="hero">
        <div className="hero-overlay">
          <nav className="top-nav">
            <div className="brand">
              <span className="brand-icon">📖</span>
              <span className="brand-name">
                <span className="gold">Public</span>Domain Library
              </span>
            </div>

            <ul className="menu">
              {navItems.map((item) => (
                <li key={item.label}>
                  <button
                    className={activeNav === item.label ? 'active' : ''}
                    onClick={() => scrollToSection(item.sectionId, item.label)}
                    type="button"
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>

            <div className="actions">
              <button
                className="nav-search"
                onClick={() => scrollToSection('home', 'Home')}
                type="button"
              >
                Search by title, author ...
              </button>
              <button
                className="dark-toggle"
                onClick={() => setDarkMode((d) => !d)}
                type="button"
                aria-label="Toggle dark mode"
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
              {currentUser ? (
                <div className="auth-user-wrap">
                  <button
                    className="auth-avatar-btn"
                    onClick={() => setShowAuthMenu((v) => !v)}
                    type="button"
                    aria-label="Account menu"
                  >
                    {currentUser.picture
                      ? <img src={currentUser.picture} alt={currentUser.name} className="auth-avatar" referrerPolicy="no-referrer" />
                      : <span className="auth-avatar-initials">{currentUser.name?.[0] ?? '?'}</span>
                    }
                    <span className="auth-display-name">{currentUser.name?.split(' ')[0]}</span>
                  </button>
                  {showAuthMenu && (
                    <div className="auth-dropdown">
                      <div className="auth-dropdown-email">{currentUser.email}</div>
                      <button className="auth-signout-btn" onClick={handleLogout} type="button">Sign Out</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="auth-signin-wrap">
                  {googleClientId ? (
                    <>
                      <button
                        className="ghost-btn"
                        onClick={() => setShowAuthMenu((v) => !v)}
                        type="button"
                      >
                        Sign In
                      </button>
                      {showAuthMenu && (
                        <div className="auth-dropdown auth-dropdown-signin">
                          <p className="auth-dropdown-hint">Sign in to save bookmarks across devices</p>
                          <div ref={googleBtnRef} className="auth-google-btn-wrap" />
                          <button
                            className="auth-guest-btn"
                            onClick={() => setShowAuthMenu(false)}
                            type="button"
                          >
                            Continue as Guest
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <button className="ghost-btn" onClick={() => scrollToSection('my-library', 'My Library')} type="button">Sign In</button>
                  )}
                </div>
              )}
            </div>
          </nav>

          <div className="hero-content">
            <h1>
              Welcome to the <span className="gold">Public Domain Library</span>
            </h1>
            <p>Free Books for Everyone — Download, Read &amp; Watch</p>

            <form className="search-wrap" onSubmit={handleSearchSubmit}>
              <input
                className="search-input"
                placeholder="Search books, authors, or movies..."
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
              <button type="submit">Search</button>
            </form>

            <div className="tags">
              {['All Books', 'Free eBooks', 'Made into Movies', 'With Trailer', 'Genres'].map((tagLabel) => (
                <button
                  key={tagLabel}
                  className={`tag ${activeTag === tagLabel ? 'active' : ''}`}
                  onClick={() => handleTagClick(tagLabel)}
                  type="button"
                >
                  {tagLabel}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {lastRead && !bannerDismissed && (
        <div className="continue-reading-banner fade-in">
          {lastRead.image && (
            <img
              className="crb-cover"
              src={lastRead.image}
              alt={lastRead.title}
              onError={(e) => { e.target.style.display = 'none' }}
            />
          )}
          <div className="crb-body">
            <div className="crb-label">Continue Reading</div>
            <div className="crb-title">{lastRead.title}</div>
            {lastRead.authors && <div className="crb-author">{lastRead.authors}</div>}
            <div className="crb-progress-wrap">
              {lastRead.totalChapters > 0
                ? <span className="crb-progress-text">
                    Ch. {lastRead.chapter + 1} / {lastRead.totalChapters}
                    {lastRead.chapterTitle ? ` — ${lastRead.chapterTitle}` : ''}
                  </span>
                : lastRead.totalPages > 0
                ? <span className="crb-progress-text">
                    Page {lastRead.page} / {lastRead.totalPages}
                    {' '}({Math.round((lastRead.page / lastRead.totalPages) * 100)}%)
                  </span>
                : null
              }
              <div className="crb-bar-track">
                <div
                  className="crb-bar-fill"
                  style={{
                    width: `${lastRead.totalChapters > 0
                      ? Math.min(100, Math.round(((lastRead.chapter + 1) / lastRead.totalChapters) * 100))
                      : lastRead.totalPages > 0
                      ? Math.min(100, Math.round((lastRead.page / lastRead.totalPages) * 100))
                      : 0}%`
                  }}
                />
              </div>
            </div>
          </div>
          <div className="crb-actions">
            <button
              className="crb-jump-btn"
              onClick={() => {
                setBannerDismissed(true)
                handleReadBook(lastRead)
              }}
              type="button"
            >
              Jump Back In →
            </button>
            <button
              className="crb-dismiss"
              onClick={() => setBannerDismissed(true)}
              type="button"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <main className="content-wrap">
        <section className="main-column" id="collection">
          <div className="section-title">Explore Our Collection</div>
          <div className="category-row">
            {filteredCategories.map((book) => (
              <article key={book.id || book.title} className="category-card">
                <img src={book.image} alt={book.title} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                <span>{book.title}</span>
                <small>{book.author}</small>
                <button className="read-now-btn" onClick={() => handleReadBook(book)} type="button">Read Now</button>
              </article>
            ))}
          </div>
          {filteredCategories.length === 0 && (
            <p className="empty-state">No matching categories for your current filter.</p>
          )}

          <div className="section-head" id="movies">
            <h2>Books Made into Movies (Public Domain)</h2>
            <button className="trailers-btn" onClick={() => handleTagClick('With Trailer')} type="button">Watch Trailers →</button>
          </div>

          <div className="movie-row">
            {filteredMovies.map((movie) => {
              const hasEmbed = Boolean(getTrailerEmbedUrl(movie.url))
              const conf = movie.confidence ?? null
              const confLabel = conf === null ? null : conf >= 80 ? 'High Match' : conf >= 50 ? 'Good Match' : 'Possible Match'
              const confClass = conf === null ? '' : conf >= 80 ? 'conf-high' : conf >= 50 ? 'conf-med' : 'conf-low'
              return (
                <button
                  key={movie.id || movie.title}
                  className="movie-card"
                  onClick={() => openTrailer(movie)}
                  type="button"
                >
                  {hasEmbed && <span className="hd">HD</span>}
                  {confLabel && <span className={`confidence-badge ${confClass}`}>{confLabel}</span>}
                  <img
                    src={movie.image}
                    alt={movie.title}
                    onError={(e) => { e.currentTarget.src = `https://placehold.co/400x600/1a1c23/f3b327?text=${encodeURIComponent(movie.title)}` }}
                  />
                  <div className="play">{hasEmbed ? '▶' : '🔍'}</div>
                  <div className="movie-meta">
                    <h3>{movie.title}</h3>
                    <p>({movie.year || 'N/A'})</p>
                    <span>{hasEmbed ? 'Trailer Available' : 'Search YouTube'}</span>
                  </div>
                </button>
              )
            })}
          </div>
          {filteredMovies.length === 0 && (
            <p className="empty-state">No matching movie adaptations for your current filter.</p>
          )}
        </section>

        <aside className="sidebar">
          <div className="adaption-card">
            <h3>🎬 Movie Adaptations</h3>
            <p>Books that were made into movies</p>
            <button onClick={() => handleTagClick('Made into Movies')} type="button">Explore Movies</button>
          </div>

          <div className="downloads-card">
            <h3>Top Downloads <span>(This Month)</span></h3>
            <ol>
              {topDownloads.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            <button onClick={handleDownloadAll} type="button">Download All →</button>
          </div>
        </aside>
      </main>

      <section className="all-books" id="all-books">
        <div className="all-books-head">
          <h2>All Free Public Domain Books</h2>
          <span>{filteredLibraryBooks.length} books available</span>
        </div>
        <div className="all-books-grid">
          {filteredLibraryBooks.slice(0, visibleBookCount).map((book) => (
            <article className="all-book-card" key={book.id}>
              <img src={book.image} alt={book.title} onError={(e) => { e.currentTarget.style.display = 'none' }} />
              <h3>{book.title}</h3>
              <p>{book.author}</p>
              <button onClick={() => handleReadBook(book)} type="button">Read Now</button>
            </article>
          ))}
        </div>
        {visibleBookCount < filteredLibraryBooks.length && (
          <button className="load-more-books" onClick={() => setVisibleBookCount((count) => count + 24)} type="button">
            Load More Free Books
          </button>
        )}
      </section>

      <section className="my-library" id="my-library">
        <div className="all-books-head">
          <h2>🔖 My Library</h2>
          <span>{myBookmarks.length} saved book{myBookmarks.length !== 1 ? 's' : ''}</span>
        </div>
        {!bookmarksLoaded ? (
          <p className="empty-state">Loading your saved books...</p>
        ) : myBookmarks.length === 0 ? (
          <div className="my-library-empty">
            <p>You haven't saved any books yet.</p>
            <p>Open a book and click <strong>🔖 Save</strong> in the reader to add it here.</p>
          </div>
        ) : (
          <div className="all-books-grid">
            {myBookmarks.map((bm) => {
              const book = {
                id: bm.book_id,
                title: bm.title,
                author: bm.author,
                authors: bm.author,
                image: bm.image || gCover(bm.book_id.replace('gutenberg-', ''), bm.title || 'Book'),
                source: bm.source || 'Project Gutenberg',
                isFullAvailable: true,
                hasText: true,
                hasPreview: true,
                hasAudio: false,
                tags: ['full'],
                textLink: bm.book_id.startsWith('gutenberg-')
                  ? `https://www.gutenberg.org/files/${bm.book_id.replace('gutenberg-', '')}/${bm.book_id.replace('gutenberg-', '')}-0.txt`
                  : '',
                previewLink: '',
                infoLink: '',
              }
              return (
                <article className="all-book-card" key={bm.book_id}>
                  <img src={book.image} alt={book.title} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  <h3>{book.title}</h3>
                  <p>{book.author}</p>
                  <button onClick={() => handleReadBook(book)} type="button">Read Now</button>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="why" id="why">
        <h2>
          Why <span className="gold">Public Domain Library?</span>
        </h2>
        <div className="why-grid">
          {whyItems.map((item) => (
            <div className="why-item" key={item}>{item}</div>
          ))}
        </div>
      </section>

      {activeTrailer && (() => {
        const embedUrl = getTrailerEmbedUrl(activeTrailer.url)
        const conf = activeTrailer.confidence ?? null
        const confLabel = conf === null ? null : conf >= 80 ? 'High Match' : conf >= 50 ? 'Good Match' : 'Possible Match'
        const confClass = conf === null ? '' : conf >= 80 ? 'conf-high' : conf >= 50 ? 'conf-med' : 'conf-low'
        return (
          <div className="trailer-modal" onClick={() => setActiveTrailer(null)} role="presentation">
            <div className="trailer-dialog" onClick={(event) => event.stopPropagation()}>
              <div className="trailer-header">
                <div className="trailer-header-info">
                  <h3>{activeTrailer.title}</h3>
                  <div className="trailer-header-meta">
                    {activeTrailer.year && activeTrailer.year !== 'N/A' && (
                      <span className="trailer-year">{activeTrailer.year}</span>
                    )}
                    {activeTrailer.rating && (
                      <span className="trailer-rating">⭐ {activeTrailer.rating}</span>
                    )}
                    {confLabel && (
                      <span className={`confidence-badge ${confClass}`}>{confLabel}</span>
                    )}
                  </div>
                </div>
                <button className="close-trailer" onClick={() => setActiveTrailer(null)} type="button" aria-label="Close">✕</button>
              </div>

              {embedUrl ? (
                <div className="trailer-frame-wrap">
                  <iframe
                    src={embedUrl}
                    title={`${activeTrailer.title} trailer`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="trailer-no-embed">
                  <img
                    src={activeTrailer.image}
                    alt={activeTrailer.title}
                    className="trailer-poster-img"
                    onError={(e) => { e.currentTarget.src = `https://placehold.co/800x450/1a1c23/f3b327?text=${encodeURIComponent(activeTrailer.title)}` }}
                  />
                  <div className="trailer-no-embed-overlay">
                    <p className="trailer-no-embed-msg">No embedded trailer available for this title.</p>
                    <a
                      href={activeTrailer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="trailer-yt-btn"
                    >
                      🔍 Search on YouTube
                    </a>
                  </div>
                </div>
              )}

              {(activeTrailer.overview || activeTrailer.sourceBookTitle) && (
                <div className="trailer-footer">
                  {activeTrailer.sourceBookTitle && (
                    <p className="trailer-source-book">📖 Based on: <em>{activeTrailer.sourceBookTitle}</em></p>
                  )}
                  {activeTrailer.overview && (
                    <p className="trailer-overview">{activeTrailer.overview}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default App
