import { useState } from 'react'
import '../styles/SearchBar.css'

function SearchBar({ onSearch }) {
  const [query, setQuery] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (query.trim()) {
      onSearch(query)
    }
  }

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion)
    onSearch(suggestion)
  }

  const suggestions = ['Science Fiction', 'Mystery', 'Romance', 'History', 'Self-Help', 'Fantasy']

  return (
    <div className="search-bar">
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search books, authors, genres..."
          className="search-input"
        />
        <button type="submit" className="search-btn">
          🔍 Search
        </button>
      </form>
      <div className="suggestions">
        <span className="suggestions-label">Popular:</span>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            className="suggestion-btn"
            onClick={() => handleSuggestionClick(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}

export default SearchBar
