import { getAccountDeviceId, authHeaders } from './auth.js'

const DEVICE_KEY = 'bookpulse-device-id'

export const getDeviceId = () => {
  // Logged-in users: stable account-scoped ID
  const accountId = getAccountDeviceId()
  if (accountId) return accountId

  // Guests: persistent random device ID
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

const API = ''

export const addBookmark = async (book) => {
  const device_id = getDeviceId()
  try {
    await fetch(`${API}/api/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        device_id,
        book_id: book.id,
        title: book.title,
        author: book.authors || book.author || '',
        image: book.image || '',
        source: book.source || '',
      }),
    })
    return true
  } catch { return false }
}

export const removeBookmark = async (bookId) => {
  const device_id = getDeviceId()
  try {
    await fetch(`/api/bookmarks?device_id=${encodeURIComponent(device_id)}&book_id=${encodeURIComponent(bookId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return true
  } catch { return false }
}

export const getBookmarks = async () => {
  const device_id = getDeviceId()
  try {
    const res = await fetch(`/api/bookmarks?device_id=${encodeURIComponent(device_id)}`, {
      headers: authHeaders(),
    })
    const data = await res.json()
    return data.bookmarks || []
  } catch { return [] }
}

export const isBookmarked = (bookmarks, bookId) =>
  bookmarks.some((b) => b.book_id === bookId)

export const saveProgress = async (bookId, title, chapter, position) => {
  const device_id = getDeviceId()
  try {
    await fetch('/api/progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ device_id, book_id: bookId, title, chapter, position }),
    })
  } catch { /* silent */ }
}

export const getProgress = async (bookId) => {
  const device_id = getDeviceId()
  try {
    const res = await fetch(`/api/progress?device_id=${encodeURIComponent(device_id)}&book_id=${encodeURIComponent(bookId)}`, {
      headers: authHeaders(),
    })
    const data = await res.json()
    return data.progress || null
  } catch { return null }
}

export const getAllProgress = async () => {
  const device_id = getDeviceId()
  try {
    const res = await fetch(`/api/progress/all?device_id=${encodeURIComponent(device_id)}`, {
      headers: authHeaders(),
    })
    const data = await res.json()
    return data.progress || []
  } catch { return [] }
}
