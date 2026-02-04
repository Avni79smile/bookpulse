import { useState } from 'react'
import './App.css'
import BookStore from './components/BookStore'
import BookReader from './components/BookReader'

function App() {
  const [selectedBook, setSelectedBook] = useState(null)

  const handleReadBook = (book) => {
    setSelectedBook(book)
  }

  const handleBackToStore = () => {
    setSelectedBook(null)
  }

  return (
    <div className="app">
      {selectedBook ? (
        <BookReader book={selectedBook} onBack={handleBackToStore} />
      ) : (
        <BookStore onReadBook={handleReadBook} />
      )}
    </div>
  )
}

export default App
