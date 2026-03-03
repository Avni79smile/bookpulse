import '../styles/BookCard.css'
import { useState } from 'react'

function BookCard({ book, onReadNow }) {
  const [usePlaceholder, setUsePlaceholder] = useState(false)
  const accessType = book.isFullAvailable ? 'FULL' : book.hasPreview ? 'PREVIEW' : 'INFO'
  const badgeColor = book.isFullAvailable ? 'full' : book.hasPreview ? 'preview' : 'unavailable'

  // Generate beautiful book cover with artistic design
  const generateBookCover = () => {
    // Premium color palettes - dark, elegant, eye-catching
    const palettes = [
      { bg1: '%230d0d0d', bg2: '%231a1a2e', accent: '%23e94560', glow: '%23ff6b6b' },
      { bg1: '%23100f1a', bg2: '%231f1135', accent: '%23bd93f9', glow: '%23ff79c6' },
      { bg1: '%230a0f0d', bg2: '%231a2f2a', accent: '%2350fa7b', glow: '%238be9fd' },
      { bg1: '%23140d0a', bg2: '%232d1810', accent: '%23ffb86c', glow: '%23f1fa8c' },
      { bg1: '%230f0a14', bg2: '%23261535', accent: '%23ff79c6', glow: '%23bd93f9' },
      { bg1: '%230a0d14', bg2: '%23152535', accent: '%238be9fd', glow: '%2350fa7b' },
      { bg1: '%23140a0a', bg2: '%23351515', accent: '%23ff5555', glow: '%23ffb86c' },
      { bg1: '%230d0a14', bg2: '%23201535', accent: '%23cba6f7', glow: '%23f5c2e7' },
    ]
    
    const hash = book.title.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const palette = palettes[hash % palettes.length]
    const isAudio = book.hasAudio
    
    // Truncate title elegantly
    const displayTitle = book.title.length > 30 ? book.title.substring(0, 27) + '...' : book.title
    const titleLines = []
    const words = displayTitle.split(' ')
    let currentLine = ''
    
    for (const word of words) {
      if ((currentLine + ' ' + word).length > 12) {
        if (currentLine) titleLines.push(currentLine.trim())
        currentLine = word
      } else {
        currentLine = currentLine ? currentLine + ' ' + word : word
      }
    }
    if (currentLine) titleLines.push(currentLine.trim())
    
    const titleY = isAudio ? 42 : 38
    const titleSvg = titleLines.slice(0, 3).map((line, i) => 
      `%3Ctext x='50%25' y='${titleY + i * 12}%25' font-size='15' fill='white' text-anchor='middle' font-family='Georgia,serif' font-weight='700' letter-spacing='0.5'%3E${encodeURIComponent(line)}%3C/text%3E`
    ).join('')
    
    const authorName = book.authors?.split(',')[0] || 'Unknown Author'
    const shortAuthor = authorName.length > 20 ? authorName.substring(0, 17) + '...' : authorName
    
    // Create stunning SVG with glow effects and elegant design
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 300'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='${palette.bg1}'/%3E%3Cstop offset='100%25' stop-color='${palette.bg2}'/%3E%3C/linearGradient%3E%3CradialGradient id='glow1' cx='20%25' cy='20%25' r='50%25'%3E%3Cstop offset='0%25' stop-color='${palette.accent}' stop-opacity='0.3'/%3E%3Cstop offset='100%25' stop-color='${palette.accent}' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='glow2' cx='80%25' cy='80%25' r='60%25'%3E%3Cstop offset='0%25' stop-color='${palette.glow}' stop-opacity='0.2'/%3E%3Cstop offset='100%25' stop-color='${palette.glow}' stop-opacity='0'/%3E%3C/radialGradient%3E%3ClinearGradient id='border' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='${palette.accent}' stop-opacity='0.6'/%3E%3Cstop offset='50%25' stop-color='${palette.glow}' stop-opacity='0.3'/%3E%3Cstop offset='100%25' stop-color='${palette.accent}' stop-opacity='0.6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23bg)' width='200' height='300' rx='6'/%3E%3Crect fill='url(%23glow1)' width='200' height='300' rx='6'/%3E%3Crect fill='url(%23glow2)' width='200' height='300' rx='6'/%3E%3Crect x='8' y='8' width='184' height='284' fill='none' stroke='url(%23border)' stroke-width='1.5' rx='4'/%3E%3Crect x='14' y='14' width='172' height='272' fill='none' stroke='rgba(255,255,255,0.08)' stroke-width='1' rx='3'/%3E${isAudio ? `%3Ccircle cx='100' cy='65' r='26' fill='${palette.bg1}'/%3E%3Ccircle cx='100' cy='65' r='24' fill='none' stroke='${palette.accent}' stroke-width='2'/%3E%3Ctext x='100' y='73' font-size='24' fill='${palette.accent}' text-anchor='middle'%3E🎧%3C/text%3E` : `%3Crect x='50' y='55' width='100' height='2' fill='${palette.accent}' rx='1'/%3E%3Crect x='70' y='62' width='60' height='1' fill='${palette.glow}' rx='0.5' opacity='0.5'/%3E`}${titleSvg}%3Crect x='40' y='${76 + Math.min(titleLines.length, 3) * 2}%25' width='120' height='1' fill='${palette.accent}' opacity='0.4'/%3E%3Ctext x='50%25' y='86%25' font-size='10' fill='rgba(255,255,255,0.7)' text-anchor='middle' font-family='Arial,sans-serif' font-style='italic' letter-spacing='0.5'%3E${encodeURIComponent(shortAuthor)}%3C/text%3E%3Ctext x='50%25' y='94%25' font-size='7' fill='${palette.accent}' text-anchor='middle' font-family='Arial,sans-serif' letter-spacing='2' opacity='0.8'%3EBOOKPULSE%3C/text%3E%3C/svg%3E`
  }

  // Get image source - always use our beautiful generated covers for consistency
  const getImageSrc = () => {
    if (usePlaceholder) {
      return generateBookCover()
    }
    
    // Always use our classy generated covers for these sources (their covers are ugly/unreliable)
    if (book.source === 'LibriVox' || book.source === 'Internet Archive' || book.source === 'Gutenberg') {
      return generateBookCover()
    }
    
    // For Google Books and Open Library - check if image exists and looks reliable
    if (book.image && !book.image.includes('placeholder') && !book.image.includes('via.placeholder')) {
      // Skip Gutenberg cover URLs (they have ugly auto-generated covers)
      if (book.image.includes('gutenberg.org') || book.image.includes('covers.openlibrary.org/b/id/-')) {
        return generateBookCover()
      }
      return book.image
    }
    
    return generateBookCover()
  }

  // Handle image error
  const handleImageError = () => {
    setUsePlaceholder(true)
  }

  // Handle image load to detect tiny, broken, or ugly placeholder images
  const handleImageLoad = (e) => {
    // Detect tiny images
    if (e.target.naturalWidth < 50 || e.target.naturalHeight < 50) {
      setUsePlaceholder(true)
      return
    }
    // Detect square-ish placeholder images (real book covers are taller than wide)
    const ratio = e.target.naturalHeight / e.target.naturalWidth
    if (ratio < 1.1) {
      setUsePlaceholder(true)
    }
  }

  return (
    <div className="book-card">
      <div className="book-image-wrapper">
        <img 
          src={getImageSrc()} 
          alt={book.title} 
          className="book-image"
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
        {book.hasAudio && <span className="audio-indicator">🎧</span>}
        <div className={`access-badge ${badgeColor}`}>
          {accessType}
        </div>
        <div className="book-overlay">
          <button 
            className={`read-btn ${badgeColor}`}
            onClick={() => onReadNow(book)}
          >
            {book.hasAudio ? '🎧 Listen' : '📖 Read'}
          </button>
        </div>
      </div>
      <div className="book-info">
        <h3 className="book-title">{book.title}</h3>
        <p className="book-author">by {book.authors || 'Unknown'}</p>
        <div className="book-tags">
          {book.hasAudio && <span className="audiobook-tag">🎧 Audiobook</span>}
          {book.source && <span className="source-pill">{book.source}</span>}
        </div>
      </div>
      <div className="pulse-glow"></div>
    </div>
  )
}

export default BookCard
