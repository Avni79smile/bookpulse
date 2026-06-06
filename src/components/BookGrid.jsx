import '../styles/BookGrid.css'
import BookCard from './BookCard'

function BookGrid({ books, onReadNow }) {
  return (
    <div className="book-grid">
      {books.map((book) => (
        <BookCard key={book.id} book={book} onReadNow={onReadNow} />
      ))}
    </div>
  )
}

export default BookGrid
