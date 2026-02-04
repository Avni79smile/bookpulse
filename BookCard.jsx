import '../styles/BookCard.css'

function BookCard({ book, onReadNow }) {
  const accessType = book.isFullAvailable ? 'FULL' : book.hasPreview ? 'PREVIEW' : 'NOT AVAILABLE'
  const badgeColor = book.isFullAvailable ? 'full' : book.hasPreview ? 'preview' : 'unavailable'

  // Safely handle description
  const description = typeof book.description === 'string' 
    ? book.description.substring(0, 100) 
    : 'No description available'

  return (
    <div className="book-card">
      <div className="book-image-wrapper">
        <img src={book.image} alt={book.title} className="book-image" />
        <div className={`access-badge ${badgeColor}`}>
          {accessType}
        </div>
      </div>
      <div className="book-info">
        <h3 className="book-title">{book.title}</h3>
        <p className="book-author">{book.authors}</p>
        <p className="book-category">{book.categories?.[0] || 'Fiction'}</p>
        <p className="book-year">{book.publishedDate.toString().split('-')[0]}</p>
        <p className="book-pages">{book.pageCount || 'N/A'} pages</p>
        
        <div className="book-description">
          {description}...
        </div>

        <button 
          className={`read-btn ${badgeColor}`}
          onClick={() => onReadNow(book)}
        >
          📖 READ NOW {accessType === 'PREVIEW' ? '(Preview)' : ''}
        </button>
      </div>
    </div>
  )
}

export default BookCard
