import { useState, useEffect } from 'react'
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

function BookStore({ onReadBook }) {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [searchQuery, setSearchQuery] = useState('fiction')
  const [searchInput, setSearchInput] = useState('')
  const [error, setError] = useState(null)
  const [showAuthSection, setShowAuthSection] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [authError, setAuthError] = useState('')
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem('bookpulse-auth') === 'true')
  const [trailerCards, setTrailerCards] = useState([])
  const [trailerLoading, setTrailerLoading] = useState(true)
  const [activeTrailer, setActiveTrailer] = useState(null)

  const API_BASE = import.meta.env.VITE_API_BASE || ''

  const INTERNET_ARCHIVE_API = `${API_BASE}/api/ia/search`
  const LIBRIVOX_PROXY_API = `${API_BASE}/api/librivox/search`
  const GUTENBERG_PROXY_API = `${API_BASE}/api/gutenberg/search`
  const GOOGLE_BOOKS_PROXY_API = `${API_BASE}/api/google/books`
  const OPENLIBRARY_PROXY_API = `${API_BASE}/api/openlibrary/search`
  const MOVIE_TRAILERS_API = `${API_BASE}/api/movies/trailers`

  const containsNovelKeyword = (value) => {
    if (!value) return false
    return /\b(novel|fiction|literature|classic)\b/i.test(String(value))
  }

  const normalizeHttps = (url) => (typeof url === 'string' ? url.replace(/^http:\/\//i, 'https://') : url)

  const pickGutenbergTextLink = (formats = {}) => {
    const entries = Object.entries(formats).filter(([, url]) => typeof url === 'string' && url)

    const isCompressed = (mime, url) => /zip|gzip|x-bzip2|x-rar/i.test(mime) || /\.(zip|gz|bz2|rar)(\?|$)/i.test(url)
    const isPlain = (mime, url) => /text\/plain/i.test(mime) || /\.txt(\.|\?|$)/i.test(url)
    const isHtml = (mime, url) => /text\/html/i.test(mime) || /\.html?(\.|\?|$)/i.test(url)

    const candidates = entries
      .map(([mime, url]) => ({ mime: String(mime).toLowerCase(), url: normalizeHttps(url) }))
      .filter(({ mime, url }) => !isCompressed(mime, url))

    const preferred = [
      candidates.find(({ mime, url }) => isPlain(mime, url) && /utf-8/i.test(mime)),
      candidates.find(({ mime, url }) => isPlain(mime, url)),
      candidates.find(({ mime, url }) => isHtml(mime, url) && /utf-8/i.test(mime)),
      candidates.find(({ mime, url }) => isHtml(mime, url)),
      candidates.find(({ mime }) => /text\//i.test(mime)),
    ].find(Boolean)

    const preview = candidates.find(({ mime, url }) => isHtml(mime, url))

    return {
      textLink: preferred?.url || null,
      previewLink: preview?.url || null,
    }
  }

  // Helper function to fetch with timeout
  const fetchWithTimeout = (url, timeout = 10000) => {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeout)
    return fetch(url, { signal: controller.signal })
      .finally(() => clearTimeout(id))
  }

  const fetchBooks = async (query, pageParam = 1, append = false) => {
    // Only show full loading spinner for initial load, not for "load more"
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    setError(null)
    try {
      const allBooks = []

      // Fetch from Internet Archive API (audiobooks - search in librivox collection)
      try {
        console.log('Fetching from Internet Archive...')
        // Search librivox collection or audio items with the query
        const archiveQuery = `(${query} OR ${query} novel OR ${query} fiction) AND collection:(librivox OR audio_bookspoetry) AND access-restricted:false`
        const archiveResponse = await fetchWithTimeout(
          `${INTERNET_ARCHIVE_API}?query=${encodeURIComponent(archiveQuery)}&page=${pageParam}&rows=50`,
          8000
        )
        const archiveData = await archiveResponse.json()
        console.log('Archive response:', archiveData)

        const archiveDocs = archiveData.response?.docs || []

        if (archiveDocs.length > 0) {
          const archiveBooks = archiveDocs
            .filter(item => item.title)
            .filter(item => containsNovelKeyword(`${item.title} ${item.description || ''}`))
            .map((item) => {
              const formats = item.format || ''
              const formatStr = Array.isArray(formats) ? formats.join(' ').toLowerCase() : String(formats).toLowerCase()
              const hasAudio = item.mediatype === 'audio' || formatStr.includes('mp3') || formatStr.includes('audio') || formatStr.includes('m4a') || formatStr.includes('ogg')
              // Try to get a better cover from Open Library using title search
              const titleForCover = encodeURIComponent(item.title.split(' ').slice(0, 3).join(' '))
              const coverUrl = `https://covers.openlibrary.org/b/title/${titleForCover}-M.jpg`
              return {
                id: `archive-${item.identifier}`,
                title: item.title,
                authors: Array.isArray(item.creator) ? item.creator.join(', ') : (item.creator || 'Unknown Author'),
                image: coverUrl,
                archiveImage: `https://archive.org/services/img/${item.identifier}`,
                description: item.description || `Audiobook from Internet Archive collection. Published: ${item.date || 'Unknown'}`,
                isFullAvailable: true,
                hasPreview: true,
                hasAudio,
                hasText: false,
                tags: ['full', 'audio'],
                // provide embed preview so it can be shown inside our iframe
                previewLink: `https://archive.org/embed/${item.identifier}`,
                publishedDate: item.date || 'Unknown',
                pageCount: Math.floor(Math.random() * 400) + 50,
                infoLink: `https://archive.org/details/${item.identifier}`,
                source: 'Internet Archive',
                categories: ['Audiobook'],
              }
            })
          console.log(`Found ${archiveBooks.length} books from Internet Archive`)
          allBooks.push(...archiveBooks)
        }
      } catch (err) {
        if (err?.name === 'AbortError') {
          console.warn('Internet Archive API timeout')
        } else {
          console.error('Internet Archive API error:', err)
        }
      }

      // Fetch from LibriVox API (audiobooks)
      try {
        console.log('Fetching from LibriVox...')
        const librivoxResponse = await fetchWithTimeout(
          `${LIBRIVOX_PROXY_API}?query=${encodeURIComponent(query)}&page=${pageParam}`,
          8000
        )
        const librivoxData = await librivoxResponse.json()
        console.log('LibriVox response:', librivoxData)

        if (Array.isArray(librivoxData.books)) {
          const librivoxBooks = librivoxData.books
            .filter((item) => containsNovelKeyword(`${item.title || ''} ${item.description || ''}`))
            .map((item) => {
            const authors = Array.isArray(item.authors)
              ? item.authors.map(a => `${a.first_name || ''} ${a.last_name || ''}`.trim()).filter(Boolean).join(', ')
              : 'Unknown Author'
            const archiveId = typeof item.url_iarchive === 'string'
              ? item.url_iarchive.split('/').filter(Boolean).pop()
              : null
            // Try Open Library cover first, then LibriVox image, then IA image
            const titleForCover = encodeURIComponent(item.title.split(' ').slice(0, 3).join(' '))
            const coverUrl = `https://covers.openlibrary.org/b/title/${titleForCover}-M.jpg`

            return {
              id: `librivox-${item.id}`,
              title: item.title,
              authors: authors || 'Unknown Author',
              image: coverUrl,
              librivoxImage: item.url_image || null,
              archiveImage: archiveId ? `https://archive.org/services/img/${archiveId}` : null,
              description: item.description || 'Audiobook from LibriVox.',
              isFullAvailable: true,
              hasPreview: true,
              hasAudio: true,
              hasText: false,
              tags: ['full', 'audio'],
              previewLink: item.url_librivox || item.url_iarchive || '',
              publishedDate: item.copyright_year || 'Unknown',
              pageCount: 0,
              infoLink: item.url_librivox || item.url_iarchive || '',
              source: 'LibriVox',
              categories: ['Audiobook'],
              archiveId,
            }
          })
          console.log(`Found ${librivoxBooks.length} books from LibriVox`)
          allBooks.push(...librivoxBooks)
        }
      } catch (err) {
        if (err?.name === 'AbortError') {
          console.warn('LibriVox API timeout')
        } else {
          console.error('LibriVox API error:', err)
        }
      }

      // Fetch from Project Gutenberg API (free public domain classics)
      try {
        console.log('Fetching from Project Gutenberg...')
        const gutenbergResponse = await fetchWithTimeout(
          `${GUTENBERG_PROXY_API}?query=${encodeURIComponent(query)}&page=${pageParam}`,
          8000
        )
        const gutenbergData = await gutenbergResponse.json()
        console.log('Gutenberg response:', gutenbergData)

        if (gutenbergData.results) {
          const gutenbergBooks = gutenbergData.results
            .filter((item) => {
              const subjectText = Array.isArray(item.subjects) ? item.subjects.join(' ') : ''
              const bookshelfText = Array.isArray(item.bookshelves) ? item.bookshelves.join(' ') : ''
              return containsNovelKeyword(`${item.title || ''} ${subjectText} ${bookshelfText}`)
            })
            .map((item) => {
            const formats = item.formats || {}
            const { textLink, previewLink } = pickGutenbergTextLink(formats)

            if (!textLink) {
              return null
            }

            return {
              id: `gutenberg-${item.id}`,
              title: item.title,
              authors: item.authors?.map(a => a.name).join(', ') || 'Unknown Author',
              image: item.formats?.['image/jpeg'] || 'https://via.placeholder.com/128x200?text=No+Cover',
              description: `A classic book from Project Gutenberg's collection of public domain literature.`,
              isFullAvailable: true,
              hasPreview: true,
              hasAudio: false,
              hasText: true,
              tags: ['full', 'classic'],
              previewLink: previewLink || `https://www.gutenberg.org/ebooks/${item.id}`,
              textLink,
              publishedDate: 'Classic',
              pageCount: Math.floor(Math.random() * 300) + 100,
              infoLink: `https://www.gutenberg.org/ebooks/${item.id}`,
              source: 'Project Gutenberg',
              categories: ['Classic Literature'],
            }
          })
          .filter(Boolean)
          console.log(`Found ${gutenbergBooks.length} books from Gutenberg`)
          allBooks.push(...gutenbergBooks)
        }
      } catch (err) {
        if (err?.name === 'AbortError') {
          console.warn('Gutenberg API timeout')
        } else {
          console.error('Gutenberg API error:', err)
        }
      }

      // Fetch from Google Books API (free books only)
      try {
        console.log('Fetching from Google Books...')
        const startIndex = (pageParam - 1) * 40
        // filter=free-ebooks returns only free Google Books
        const googleResponse = await fetchWithTimeout(
          `${GOOGLE_BOOKS_PROXY_API}?query=${encodeURIComponent(query)}&startIndex=${startIndex}&filter=free-ebooks`,
          8000
        )
        const googleData = await googleResponse.json()
        console.log('Google response:', googleData)

        if (googleData.items) {
          const googleBooks = googleData.items
            .filter(item => {
              if (!item.volumeInfo?.title) return false
              const access = item.accessInfo || {}
              const isPublicDomain = access.publicDomain === true
              const hasReadableAccess = access.viewability === 'ALL_PAGES' || access.accessViewStatus === 'FULL_PUBLIC_DOMAIN'
              const isFree = access.epub?.isAvailable || access.pdf?.isAvailable || hasReadableAccess
              const categoryText = Array.isArray(item.volumeInfo.categories) ? item.volumeInfo.categories.join(' ') : ''
              const novelLike = containsNovelKeyword(`${item.volumeInfo.title || ''} ${item.searchInfo?.textSnippet || ''} ${categoryText}`)
              return (isPublicDomain || isFree) && novelLike
            })
            .map((item) => ({
              id: `google-${item.id}`,
              googleId: item.id,
              title: item.volumeInfo.title,
              authors: item.volumeInfo.authors?.join(', ') || 'Unknown Author',
              image: item.volumeInfo.imageLinks?.thumbnail || 'https://via.placeholder.com/128x200?text=No+Cover',
              description: typeof item.volumeInfo.description === 'string' 
                ? item.volumeInfo.description 
                : 'No description available',
              isFullAvailable: true,
              hasPreview: true,
              hasAudio: false,
              hasText: true,
              tags: ['full', 'free', 'public-domain'],
              previewLink: (item.accessInfo?.webReaderLink || item.volumeInfo.previewLink || item.volumeInfo.infoLink || '').replace(/^http:\/\//i, 'https://'),
              publishedDate: item.volumeInfo.publishedDate || 'Unknown',
              pageCount: item.volumeInfo.pageCount || 0,
              infoLink: item.volumeInfo.infoLink,
              source: 'Google Books',
              categories: item.volumeInfo.categories || ['Fiction'],
            }))
          console.log(`Found ${googleBooks.length} free books from Google Books`)
          allBooks.push(...googleBooks)
        }
      } catch (err) {
        if (err?.name === 'AbortError') {
          console.warn('Google Books API timeout')
        } else {
          console.error('Google Books API error:', err)
        }
      }

      // Fetch from Open Library API (via proxy - full text available only)
      try {
        console.log('Fetching from Open Library...')
        const openLibraryResponse = await fetchWithTimeout(
          `${OPENLIBRARY_PROXY_API}?query=${encodeURIComponent(query)}&page=${pageParam}`,
          8000
        )
        const openLibraryData = await openLibraryResponse.json()
        console.log('Open Library response:', openLibraryData)

        if (openLibraryData.docs) {
          const openLibraryBooks = openLibraryData.docs
            .filter(item => item.has_fulltext && item.public_scan_b)
            .filter(item => {
              const subjectText = Array.isArray(item.subject) ? item.subject.join(' ') : ''
              return containsNovelKeyword(`${item.title || ''} ${subjectText}`)
            })
            .map((item) => {
              const editionKey = item.edition_key?.[0]
              return {
                id: `openlibrary-${item.key}`,
                title: item.title,
                authors: item.author_name?.join(', ') || 'Unknown Author',
                image: item.cover_i 
                  ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg`
                  : 'https://via.placeholder.com/128x200?text=No+Cover',
                description: `Published in ${item.first_publish_year || 'Unknown year'}. Available in Open Library collection.`,
                isFullAvailable: true,
                hasPreview: true,
                hasAudio: false,
                hasText: true,
                tags: ['full', 'public-domain'],
                previewLink: '',
                publishedDate: item.first_publish_year || 'Unknown',
                pageCount: item.number_of_pages_median || 0,
                infoLink: `https://openlibrary.org${item.key}`,
                source: 'Open Library',
                categories: item.subject?.slice(0, 3) || ['General'],
                editionKey,
              }
            })
          console.log(`Found ${openLibraryBooks.length} full-text books from Open Library`)
          allBooks.push(...openLibraryBooks)
        }
      } catch (err) {
        if (err?.name === 'AbortError') {
          console.warn('Open Library API timeout')
        } else {
          console.error('Open Library API error:', err)
        }
      }

      console.log('Total books before dedup:', allBooks.length)

      // Filter out invalid books and remove duplicates
      const validBooks = allBooks.filter(book => 
        book && book.title && book.authors && book.image
      )

      const readableBooks = validBooks.filter((book) => {
        if (book.hasAudio) return true
        if (book.hasText && typeof book.textLink === 'string' && book.textLink.trim().length > 0) return true
        return false
      })

      // deduplicate by title, preferring items that have full availability
      const readabilityScore = (book) => {
        if (book?.hasText && typeof book.textLink === 'string' && book.textLink.trim()) return 4
        if (book?.source === 'Project Gutenberg' && book?.hasText) return 3
        if (book?.hasAudio) return 2
        if (book?.hasPreview) return 1
        return 0
      }

      const uniqueMap = new Map()
      for (const b of readableBooks) {
        const key = b.title.toLowerCase()
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, b)
        } else {
          const existing = uniqueMap.get(key)
          const incomingScore = readabilityScore(b)
          const existingScore = readabilityScore(existing)

          if (incomingScore > existingScore) {
            uniqueMap.set(key, b)
            continue
          }

          // if same readability score, prefer Project Gutenberg for classic public-domain full text
          if (incomingScore === existingScore && b.source === 'Project Gutenberg' && existing.source !== 'Project Gutenberg') {
            uniqueMap.set(key, b)
          }
        }
      }
      let uniqueBooks = Array.from(uniqueMap.values())

      // Ensure each book has tags array for UI and sorting
      uniqueBooks = uniqueBooks.map(b => ({
        ...b,
        tags: Array.isArray(b.tags) ? b.tags : (b.isFullAvailable ? ['full'] : (b.hasPreview ? ['preview'] : ['unavailable']))
      }))

      // Shuffle function to mix books
      const shuffleArray = (arr) => {
        const shuffled = [...arr]
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        return shuffled
      }

      // Separate books with real covers vs generated covers (audiobooks)  
      const hasRealCover = (book) => {
        return book.source === 'Google Books' || book.source === 'Open Library'
      }

      const realCoverBooks = uniqueBooks.filter(hasRealCover)
      const generatedCoverBooks = uniqueBooks.filter(b => !hasRealCover(b))

      // Shuffle both arrays, then interleave: 2 real, 1 generated
      const shuffledReal = shuffleArray(realCoverBooks)
      const shuffledGenerated = shuffleArray(generatedCoverBooks)

      const interleavedBooks = []
      let realIdx = 0, genIdx = 0
      
      while (realIdx < shuffledReal.length || genIdx < shuffledGenerated.length) {
        // Add 2 real cover books
        for (let i = 0; i < 2 && realIdx < shuffledReal.length; i++) {
          interleavedBooks.push(shuffledReal[realIdx++])
        }
        // Add 1 generated cover book
        if (genIdx < shuffledGenerated.length) {
          interleavedBooks.push(shuffledGenerated[genIdx++])
        }
      }

      uniqueBooks = interleavedBooks

      console.log('Total valid books:', validBooks.length)
      console.log('Total readable books:', readableBooks.length)
      console.log('Total unique books:', uniqueBooks.length)
      console.log(`Mixed: ${realCoverBooks.length} real covers, ${generatedCoverBooks.length} generated`)

      if (append) {
        // Append new books while maintaining mix pattern
        setBooks((prev) => {
          // First, deduplicate
          const existingTitles = new Set(prev.map(b => b.title.toLowerCase()))
          const newBooks = uniqueBooks.filter(b => !existingTitles.has(b.title.toLowerCase()))
          
          if (newBooks.length === 0) {
            setHasMore(false)
            return prev
          }
          
          // Interleave new books into existing list to maintain mix
          const result = [...prev]
          const newReal = newBooks.filter(b => b.source === 'Google Books' || b.source === 'Open Library')
          const newGenerated = newBooks.filter(b => b.source !== 'Google Books' && b.source !== 'Open Library')
          
          // Add new books in interleaved pattern at the end
          let rIdx = 0, gIdx = 0
          while (rIdx < newReal.length || gIdx < newGenerated.length) {
            if (rIdx < newReal.length) result.push(newReal[rIdx++])
            if (rIdx < newReal.length) result.push(newReal[rIdx++])
            if (gIdx < newGenerated.length) result.push(newGenerated[gIdx++])
          }
          
          setHasMore(true)
          return result
        })
      } else {
        setBooks(uniqueBooks)
        setHasMore(true)
      }

      if (!append && uniqueBooks.length === 0) {
        setError('⚠️ No books found. Try searching for: "mystery", "history", "fantasy", or any other genre.')
      }
    } catch (err) {
      setError('Failed to fetch books. Please try again.')
      console.error('Error fetching books:', err)
    }
    setLoading(false)
    setLoadingMore(false)
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBooks(searchQuery, 1, false)
    }, 0)

    return () => clearTimeout(timer)
  }, [])
  /* eslint-enable react-hooks/exhaustive-deps */

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

  const handleReadNow = (book) => {
    onReadBook(book)
  }

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
    if (!isAuthenticated) {
      openAuthSection('login')
      return
    }
    document.getElementById('all-books')?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleAuthSubmit = (event) => {
    event.preventDefault()
    const email = authForm.email.trim()
    const password = authForm.password.trim()

    if (!email || !password) {
      setAuthError('Please enter email and password.')
      return
    }

    if (authMode === 'signup') {
      if (!authForm.name.trim()) {
        setAuthError('Please enter your name.')
        return
      }
      if (password.length < 6) {
        setAuthError('Password must be at least 6 characters.')
        return
      }
      if (password !== authForm.confirmPassword.trim()) {
        setAuthError('Passwords do not match.')
        return
      }
    }

    localStorage.setItem('bookpulse-auth', 'true')
    localStorage.setItem('bookpulse-user-email', email)
    setIsAuthenticated(true)
    setShowAuthSection(false)
    setAuthError('')
    setAuthForm({ name: '', email: '', password: '', confirmPassword: '' })
    setTimeout(() => {
      document.getElementById('all-books')?.scrollIntoView({ behavior: 'smooth' })
    }, 120)
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
    if (youtubeMatch?.[1]) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}?autoplay=1&rel=0`
    }
    const shortMatch = url.match(/youtu\.be\/([^?&]+)/)
    if (shortMatch?.[1]) {
      return `https://www.youtube.com/embed/${shortMatch[1]}?autoplay=1&rel=0`
    }
    return url
  }

  const openTrailer = (trailer) => {
    setActiveTrailer({
      ...trailer,
      embedUrl: toEmbedUrl(trailer.url),
    })
  }

  const closeTrailer = () => {
    setActiveTrailer(null)
  }

  useEffect(() => {
    const fetchMovieTrailers = async () => {
      const trailerTitles = Array.from(new Set([
        ...books
          .filter((book) => book.hasText)
          .map((book) => String(book.title || '').trim())
          .filter(Boolean),
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
      } catch (err) {
        console.error('Failed to load trailers:', err)
        setTrailerCards(DEFAULT_TRAILER_CARDS)
      } finally {
        setTrailerLoading(false)
      }
    }

    fetchMovieTrailers()
  }, [MOVIE_TRAILERS_API, books])

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
                  <button
                    key={book.id}
                    type="button"
                    className="mini-book"
                    onClick={() => handleReadNow(book)}
                  >
                    <img src={book.image} alt={book.title} loading="lazy" />
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
                  <button
                    key={book.id}
                    type="button"
                    className="mini-book audio"
                    onClick={() => handleReadNow(book)}
                  >
                    <img src={book.image} alt={book.title} loading="lazy" />
                    <span className="audio-pill">🎧 AUDIO</span>
                    <span className="mini-book-caption">{book.title}</span>
                  </button>
                ))
              ) : (
                <div className="spotlight-loading">Loading audiobooks...</div>
              )}
            </div>
          </div>

          <button
            type="button"
            className="panel-btn"
            onClick={handleBrowseAllClick}
          >
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
                    src={trailer.image}
                    alt={trailer.title}
                    loading="lazy"
                    className="trailer-thumb"
                    onError={(event) => {
                      event.currentTarget.src = 'https://via.placeholder.com/640x360?text=Classic+Film+Trailer'
                    }}
                  />
                  <span className="trailer-play">▶</span>
                  <span>WATCH TRAILER</span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="panel-btn secondary"
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
              <input
                type="text"
                name="name"
                placeholder="Full Name"
                value={authForm.name}
                onChange={handleAuthInputChange}
              />
            )}
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={authForm.email}
              onChange={handleAuthInputChange}
            />
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={authForm.password}
              onChange={handleAuthInputChange}
            />
            {authMode === 'signup' && (
              <input
                type="password"
                name="confirmPassword"
                placeholder="Confirm Password"
                value={authForm.confirmPassword}
                onChange={handleAuthInputChange}
              />
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
                src={trailer.image}
                alt={trailer.title}
                loading="lazy"
                className="trailer-thumb"
                onError={(event) => {
                  event.currentTarget.src = 'https://via.placeholder.com/640x360?text=Classic+Film+Trailer'
                }}
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
          <button
            type="button"
            className="action-btn read"
            onClick={handleBrowseAllClick}
          >
            Start Reading
          </button>
          <a className="action-btn watch" href={(trailerCards[0] || DEFAULT_TRAILER_CARDS[0]).url} target="_blank" rel="noreferrer">
            Watch Movies
          </a>
        </div>
      </section>

      {error && (
        <div className="error-message">
          <p>{error}</p>
          <small>Check browser console (F12) for detailed error logs</small>
        </div>
      )}

      <>
        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading free books from public-domain sources...</p>
            <small>This may take a few seconds</small>
          </div>
        ) : books.length > 0 ? (
          <>
            <div className="results-info" id="all-books">
              <p>✅ Found {books.length} books for "{searchQuery}"</p>
            </div>
            <BookGrid books={books} onReadNow={handleReadNow} />
            {hasMore && (
              <div className="load-more-wrap">
                <button className="load-more-btn" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading...' : 'Load More Books'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="no-books">
            <p>📭 No books loaded yet. Please try searching!</p>
          </div>
        )}
      </>

      {activeTrailer && (
        <div className="trailer-modal" onClick={closeTrailer}>
          <div className="trailer-modal-content" onClick={(event) => event.stopPropagation()}>
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
