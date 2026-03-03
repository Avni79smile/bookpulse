import { useState } from 'react'
import '../styles/BookViewer.css'

function BookViewer({ book, onClose }) {
  const [activeTab, setActiveTab] = useState('read') // 'read' or 'audio'
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const isAudioAvailable = Boolean(book?.hasAudio)

  const handleIframeLoad = () => {
    setIframeLoaded(true)
  }

  const handleIframeError = () => {
    setLoadError(true)
  }

  const accessType = book.isFullAvailable ? 'Full Book' : 'Preview'
  const isGutenberg = book.id?.startsWith('gutenberg-')

  // Get preview URL
  const getPreviewUrl = () => {
    if (isGutenberg) {
      return book.previewLink
    } else if (book.previewLink) {
      return book.previewLink.replace('?host=', '?embedded=true&host=')
    }
    return null
  }

  return (
    <div className="book-viewer-overlay" onClick={onClose}>
      <div className="book-viewer-container" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-header">
          <div className="viewer-title-section">
            <h2>{book.title}</h2>
            <p className="viewer-author">{book.authors}</p>
            <div className="viewer-badges">
              <span className={`viewer-badge ${book.isFullAvailable ? 'full' : 'preview'}`}>
                📖 {accessType}
              </span>
              {book.source && (
                <span className="source-badge">
                  📚 {book.source}
                </span>
              )}
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="viewer-tabs">
          <button 
            className={`tab-btn ${activeTab === 'read' ? 'active' : ''}`}
            onClick={() => setActiveTab('read')}
          >
            📖 Read
          </button>
          {isAudioAvailable && (
            <button 
              className={`tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
              onClick={() => setActiveTab('audio')}
            >
              🎧 Listen
            </button>
          )}
          <button 
            className="tab-btn info-btn"
            onClick={() => window.open(book.infoLink, '_blank')}
          >
            ℹ️ More Info
          </button>
        </div>

        {/* Read Tab */}
        {activeTab === 'read' && (
          <div className="viewer-content">
            {!getPreviewUrl() ? (
              <div className="preview-unavailable">
                <div className="unavailable-message">
                  <p>📚 This book preview is not available on BookPlus</p>
                  <p>But you can read it here:</p>
                  <a href={book.infoLink} target="_blank" rel="noreferrer" className="info-link">
                    Open on {book.source} →
                  </a>
                </div>
              </div>
            ) : (
              <div className="viewer-wrapper">
                {!iframeLoaded && !loadError && (
                  <div className="loading-preview">
                    <div className="spinner"></div>
                    <p>Loading {accessType.toLowerCase()}...</p>
                    <small>Preparing your reading experience</small>
                  </div>
                )}
                {loadError && (
                  <div className="preview-unavailable">
                    <div className="unavailable-message">
                      <p>⚠️ Unable to load the preview in browser</p>
                      <p>The book is available here:</p>
                      <a href={getPreviewUrl()} target="_blank" rel="noreferrer" className="info-link">
                        Open Book →
                      </a>
                    </div>
                  </div>
                )}
                <div className="book-reader">
                  <iframe
                    src={getPreviewUrl()}
                    className={`book-iframe ${iframeLoaded ? 'loaded' : ''}`}
                    onLoad={handleIframeLoad}
                    onError={handleIframeError}
                    title={`${book.title} Preview`}
                    sandbox="allow-same-origin allow-scripts allow-popups allow-modals"
                  ></iframe>
                  <div className="reader-controls">
                    <p>📖 Use the reader controls to navigate through the book</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audio Tab */}
        {activeTab === 'audio' && isAudioAvailable && (
          <div className="audio-content">
            <div className="audio-player-container">
              <div className="audio-icon">🎧</div>
              <h3>Listen to this Book</h3>
              <p>Stream or download audio from Internet Archive</p>
              <div className="audio-button-group">
                <a 
                  href={`https://archive.org/details/${book.infoLink.split('/').pop()}`}
                  target="_blank"
                  rel="noreferrer"
                  className="audio-btn primary"
                >
                  🎵 Stream Audio
                </a>
                <a 
                  href={`https://archive.org/download/${book.infoLink.split('/').pop()}`}
                  target="_blank"
                  rel="noreferrer"
                  className="audio-btn secondary"
                >
                  ⬇️ Download Audio
                </a>
              </div>
              <small>Audio files are provided by Internet Archive</small>
            </div>
          </div>
        )}

        {/* Footer with Book Details */}
        <div className="viewer-footer">
          <div className="book-details">
            <div className="detail-item">
              <span className="detail-label">Published:</span>
              <span className="detail-value">{book.publishedDate}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Pages:</span>
              <span className="detail-value">{book.pageCount || 'N/A'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Category:</span>
              <span className="detail-value">{book.categories?.join(', ') || 'General'}</span>
            </div>
            {book.source && (
              <div className="detail-item">
                <span className="detail-label">Source:</span>
                <span className="detail-value">{book.source}</span>
              </div>
            )}
          </div>
          <div className="description-section">
            <h4>📖 About this book:</h4>
            <p>{book.description}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BookViewer
