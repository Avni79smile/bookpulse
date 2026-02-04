import { useState, useEffect } from 'react'
import '../styles/BookStore.css'
import SearchBar from './SearchBar'
import BookGrid from './BookGrid'

function BookStore({ onReadBook }) {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [searchQuery, setSearchQuery] = useState('fiction')
  const [error, setError] = useState(null)

  const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes'
  const GUTENBERG_API = 'https://gutendex.com/books'
  const OPENLIBRARY_API = 'https://openlibrary.org/search.json'
  const INTERNET_ARCHIVE_API = 'https://archive.org/advancedsearch.php'

  const fetchBooks = async (query, pageParam = 1, append = false) => {
    setLoading(true)
    setError(null)
    try {
      const allBooks = []

      // Fetch from Internet Archive API
      try {
        console.log('Fetching from Internet Archive...')
        const archiveResponse = await fetch(
          `${INTERNET_ARCHIVE_API}?q=${encodeURIComponent(query)}&fl=identifier,title,creator,description,date,mediatype&output=json&rows=50&page=${pageParam}`
        )
        const archiveData = await archiveResponse.json()
        console.log('Archive response:', archiveData)

        if (archiveData.response?.docs) {
          const archiveBooks = archiveData.response.docs
            .filter(item => item.mediatype === 'texts' && item.title)
            .map((item) => ({
              id: `archive-${item.identifier}`,
              title: item.title,
              authors: Array.isArray(item.creator) ? item.creator.join(', ') : (item.creator || 'Unknown Author'),
              image: `https://archive.org/services/img/${item.identifier}`,
              description: item.description || `Archived book from Internet Archive collection. Published: ${item.date || 'Unknown'}`,
              isFullAvailable: true,
              hasPreview: true,
              tags: ['full'],
              // provide embed preview so it can be shown inside our iframe
              previewLink: `https://archive.org/embed/${item.identifier}`,
              publishedDate: item.date || 'Unknown',
              pageCount: Math.floor(Math.random() * 400) + 50,
              infoLink: `https://archive.org/details/${item.identifier}`,
              source: 'Internet Archive',
              categories: ['Archived Literature'],
            }))
          console.log(`Found ${archiveBooks.length} books from Internet Archive`)
          allBooks.push(...archiveBooks)
        }
      } catch (err) {
        console.error('Internet Archive API error:', err)
      }

      // Fetch from Project Gutenberg API (Free public domain books - FULL ACCESS)
      try {
        console.log('Fetching from Project Gutenberg...')
        const gutenbergResponse = await fetch(
          `${GUTENBERG_API}?search=${encodeURIComponent(query)}&page=${pageParam}`
        )
        const gutenbergData = await gutenbergResponse.json()
        console.log('Gutenberg response:', gutenbergData)
        
        if (gutenbergData.results) {
          const gutenbergBooks = gutenbergData.results.map((item) => {
            const formats = item.formats || {}
            const keys = Object.keys(formats)
            // prefer an HTML format, then plain text, otherwise fallback to ebook page
            let preview = `https://www.gutenberg.org/ebooks/${item.id}`
            const htmlKey = keys.find(k => /html?/i.test(k))
            const textKey = keys.find(k => /plain|text/i.test(k))
            if (htmlKey) preview = formats[htmlKey]
            else if (textKey) preview = formats[textKey]

            return {
              id: `gutenberg-${item.id}`,
              title: item.title,
              authors: item.authors?.map(a => a.name).join(', ') || 'Unknown Author',
              image: item.formats?.['image/jpeg'] || 'https://via.placeholder.com/128x200?text=No+Cover',
              description: `A classic book from Project Gutenberg's collection of public domain literature.`,
              isFullAvailable: true,
              hasPreview: true,
              tags: ['full'],
              previewLink: preview,
              publishedDate: 'Classic',
              pageCount: Math.floor(Math.random() * 300) + 100,
              infoLink: `https://www.gutenberg.org/ebooks/${item.id}`,
              source: 'Project Gutenberg',
              categories: ['Classic Literature'],
            }
          })
          console.log(`Found ${gutenbergBooks.length} books from Gutenberg`)
          allBooks.push(...gutenbergBooks)
        }
      } catch (err) {
        console.error('Gutenberg API error:', err)
      }

      // Fetch from Google Books API
      try {
        console.log('Fetching from Google Books...')
        const startIndex = (pageParam - 1) * 40
        const googleResponse = await fetch(
          `${GOOGLE_BOOKS_API}?q=${encodeURIComponent(query)}&maxResults=40&startIndex=${startIndex}&printType=books`
        )
        const googleData = await googleResponse.json()
        console.log('Google response:', googleData)

        if (googleData.items) {
          const googleBooks = googleData.items
            .filter(item => item.volumeInfo?.title) // Filter out invalid items
            .map((item) => ({
              id: `google-${item.id}`,
              title: item.volumeInfo.title,
              authors: item.volumeInfo.authors?.join(', ') || 'Unknown Author',
              image: item.volumeInfo.imageLinks?.thumbnail || 'https://via.placeholder.com/128x200?text=No+Cover',
              description: typeof item.volumeInfo.description === 'string' 
                ? item.volumeInfo.description 
                : 'No description available',
              // consider epub/pdf availability and accessViewStatus
              isFullAvailable: Boolean(item.accessInfo?.epub?.isAvailable) || Boolean(item.accessInfo?.pdf?.isAvailable) || item.accessInfo?.accessViewStatus === 'FULL',
              hasPreview: Boolean(item.accessInfo?.epub?.isAvailable) || Boolean(item.accessInfo?.pdf?.isAvailable) || item.accessInfo?.accessViewStatus === 'SAMPLE' || item.volumeInfo?.previewLink,
              previewLink: item.accessInfo?.webReaderLink || item.volumeInfo.previewLink || item.volumeInfo.infoLink,
              publishedDate: item.volumeInfo.publishedDate || 'Unknown',
              pageCount: item.volumeInfo.pageCount || 0,
              infoLink: item.volumeInfo.infoLink,
              source: 'Google Books',
              categories: item.volumeInfo.categories || ['Fiction'],
            }))
          console.log(`Found ${googleBooks.length} books from Google Books`)
          allBooks.push(...googleBooks)
        } else {
          console.log('No items in Google Books response')
        }
      } catch (err) {
        console.error('Google Books API error:', err)
      }

      // Fetch from Open Library API
      try {
        console.log('Fetching from Open Library...')
        const openLibraryResponse = await fetch(
          `${OPENLIBRARY_API}?title=${encodeURIComponent(query)}&limit=100&page=${pageParam}`
        )
        const openLibraryData = await openLibraryResponse.json()
        console.log('Open Library response:', openLibraryData)

        if (openLibraryData.docs) {
          const openLibraryBooks = openLibraryData.docs.map((item) => ({
            id: `openlibrary-${item.key}`,
            title: item.title,
            authors: item.author_name?.join(', ') || 'Unknown Author',
            image: item.cover_i 
              ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg`
              : 'https://via.placeholder.com/128x200?text=No+Cover',
            description: `Published in ${item.first_publish_year || 'Unknown year'}. Available in Open Library collection.`,
            // OpenLibrary exposes `has_fulltext` and `ia` identifiers when full text is available
            isFullAvailable: Boolean(item.has_fulltext) || Boolean(item.ia),
            hasPreview: Boolean(item.has_fulltext) || Boolean(item.ia) || Boolean(item.edition_key),
            tags: (Boolean(item.has_fulltext) || Boolean(item.ia)) ? ['full'] : ['preview'],
            previewLink: `https://openlibrary.org${item.key}`,
            publishedDate: item.first_publish_year || 'Unknown',
            pageCount: item.number_of_pages_median || 0,
            infoLink: `https://openlibrary.org${item.key}`,
            source: 'Open Library',
            categories: item.subject || ['General'],
          }))
          console.log(`Found ${openLibraryBooks.length} books from Open Library`)
          allBooks.push(...openLibraryBooks)
        }
      } catch (err) {
        console.error('Open Library API error:', err)
      }

      console.log('Total books before dedup:', allBooks.length)

      // Filter out invalid books and remove duplicates
      const validBooks = allBooks.filter(book => 
        book && book.title && book.authors && book.image
      )

      // deduplicate by title, preferring items that have full availability
      const uniqueMap = new Map()
      for (const b of validBooks) {
        const key = b.title.toLowerCase()
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, b)
        } else {
          const existing = uniqueMap.get(key)
          // if incoming has full availability while existing does not, prefer incoming
          if (b.isFullAvailable && !existing.isFullAvailable) {
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

      // Sort so full books appear first, then previews, then unavailable
      uniqueBooks.sort((a, b) => {
        const score = (book) => (book.isFullAvailable ? 2 : (book.hasPreview ? 1 : 0))
        return score(b) - score(a)
      })

      console.log('Total valid books:', validBooks.length)
      console.log('Total unique books:', uniqueBooks.length)

      if (append) {
        // Append while keeping uniqueness
        setBooks((prev) => {
          const combined = [...prev, ...uniqueBooks]
          const map = new Map()
          for (const b of combined) {
            const key = b.title.toLowerCase()
            if (!map.has(key)) map.set(key, b)
            else {
              const existing = map.get(key)
              if (b.isFullAvailable && !existing.isFullAvailable) map.set(key, b)
            }
          }
          const merged = Array.from(map.values())
          if (merged.length === prev.length) {
            setHasMore(false)
            return prev
          }
          setHasMore(true)
          return merged
        })
      } else {
        setBooks(uniqueBooks)
        setHasMore(true)
      }

      if (!append && uniqueBooks.length === 0) {
        setError('⚠️ No books found. Try searching for: "fiction", "history", "science", or any other genre.')
      }
    } catch (err) {
      setError('Failed to fetch books. Please try again.')
      console.error('Error fetching books:', err)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchBooks(searchQuery, 1, false)
  }, [])

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

  return (
    <div className="bookstore">
      <div className="bookstore-header">
        <div className="bookstore-title">
          <h1>📚 BookPlus</h1>
          <p>Your digital library with millions of books</p>
        </div>
        <SearchBar onSearch={handleSearch} />
      </div>

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
            <p>Loading books from Internet Archive, Google Books, Project Gutenberg & Open Library...</p>
            <small>This may take a few seconds</small>
          </div>
        ) : books.length > 0 ? (
          <>
            <div className="results-info">
              <p>✅ Found {books.length} books for "{searchQuery}"</p>
            </div>
            <BookGrid books={books} onReadNow={handleReadNow} />
            {hasMore && (
              <div className="load-more-wrap">
                <button className="load-more-btn" onClick={handleLoadMore} disabled={loading}>
                  {loading ? 'Loading...' : 'Load More Books'}
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
    </div>
  )
}

export default BookStore
