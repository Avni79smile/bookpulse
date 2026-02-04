import { useState, useEffect } from 'react'
import '../styles/BookReader.css'

function BookReader({ book, onBack }) {
  const [activeTab, setActiveTab] = useState('read')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [archiveMetadata, setArchiveMetadata] = useState(null)
  const [loadingMetadata, setLoadingMetadata] = useState(false)
  const [audioSources, setAudioSources] = useState([])

  useEffect(() => {
    // Load Internet Archive metadata if it's an archive book
    if (book.id?.startsWith('archive-')) {
      loadArchiveMetadata()
    }
  }, [book])

  const loadArchiveMetadata = async () => {
    try {
      setLoadingMetadata(true)
      const archiveId = book.infoLink.split('/').pop()
      const response = await fetch(
        `https://archive.org/metadata/${archiveId}`
      )
      const data = await response.json()
      setArchiveMetadata(data)
      // Collect audio file sources (mp3, m4a, ogg, opus)
      if (data?.files && Array.isArray(data.files)) {
        const audioFiles = data.files
          .filter(f => (f.name && /\.(mp3|m4a|ogg|opus)$/i.test(f.name)) || (f.format && /mp3|audio|ogg|m4a/i.test(f.format)))
          .map(f => ({
            name: f.name,
            url: `https://archive.org/download/${archiveId}/${f.name}`,
            format: f.format || ''
          }))
        setAudioSources(audioFiles)
      }
      console.log('Archive metadata:', data)
    } catch (err) {
      console.error('Error loading archive metadata:', err)
    } finally {
      setLoadingMetadata(false)
    }
  }

  const handleFullscreen = (e) => {
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

  const getReadUrl = () => {
    // Prefer explicit previewLink when it's already embeddable
    if (book.previewLink) {
      if (book.previewLink.includes('archive.org/embed')) return book.previewLink
      if (book.id?.startsWith('gutenberg-')) return book.previewLink
      // try to make other preview links embeddable
      return book.previewLink.replace('?host=', '?embedded=true&host=')
    }

    // Fallback for Internet Archive using infoLink
    if (book.id?.startsWith('archive-') && book.infoLink) {
      const archiveId = book.infoLink.split('/').pop()
      return `https://archive.org/embed/${archiveId}`
    }

    return book.previewLink || book.infoLink || ''
  }

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
                  <a href={getReadUrl()} target="_blank" rel="noreferrer" className="topbar-btn">Open in new tab</a>
                  <button className="topbar-btn" onClick={handleFullscreen}>Fullscreen</button>
                  <a href={book.infoLink} target="_blank" rel="noreferrer" className="topbar-btn">View Source</a>
                </div>
              </div>
              {!iframeLoaded && (
                <div className="reader-loading">
                  <div className="spinner"></div>
                  <p>Loading book...</p>
                </div>
              )}
              <iframe
                src={getReadUrl()}
                className="reader-iframe"
                onLoad={() => setIframeLoaded(true)}
                title={`${book.title} Reader`}
                sandbox="allow-same-origin allow-scripts allow-popups allow-modals allow-presentation allow-top-navigation"
                style={{ width: '100%', height: '100%' }}
              ></iframe>
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
              <p>Stream or download high-quality audio</p>

              {book.id?.startsWith('archive-') ? (
                audioSources && audioSources.length > 0 ? (
                  <div className="audio-player-list">
                    <audio controls className="audio-player" preload="none">
                      {audioSources.map((s, idx) => (
                        <source key={idx} src={s.url} />
                      ))}
                      Your browser does not support the audio element.
                    </audio>
                    <div className="audio-files">
                      {audioSources.map((s, idx) => (
                        <div className="audio-file" key={idx}>
                          <a href={s.url} target="_blank" rel="noreferrer" className="audio-btn primary-btn">▶️ Play in new tab</a>
                          <a href={s.url} download className="audio-btn secondary-btn">⬇️ Download</a>
                          <div className="audio-file-name">{s.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="no-audio">
                    <p>Audio not available for this book</p>
                    <small>Try "View on Internet Archive" for more formats.</small>
                  </div>
                )
              ) : (
                <div className="no-audio">
                  <p>Audio not available for this book</p>
                  <small>Audio is available for Internet Archive books only.</small>
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
                <img src={book.image} alt={book.title} className="info-cover" />
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
                    <h3>📚 Book Details</h3>
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

                                    {book.source === 'Google Books' && (
                                      <div className="archive-info">
                                        <h3>From Google Books</h3>
                                        <p>
                                          This book is indexed through Google Books, providing access to millions of titles from publishers and libraries worldwide.
                                        </p>
                                      </div>
                                    )}

                                    {book.source === 'Open Library' && (
                                      <div className="archive-info">
                                        <h3>From Open Library</h3>
                                        <p>
                                          This book is available through Open Library, a project by the Internet Archive offering free access to books worldwide.
                                        </p>
                                      </div>
                                    )}
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
