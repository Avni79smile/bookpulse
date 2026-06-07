const TOKEN_KEY = 'bookpulse-auth-token'
const USER_KEY = 'bookpulse-user'

export const getAuthToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

export const setAuth = (token, user) => {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch { /* storage unavailable */ }
}

export const clearAuth = () => {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch { /* storage unavailable */ }
}

export const getCurrentUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export const isLoggedIn = () => {
  try { return Boolean(getAuthToken() && getCurrentUser()) } catch { return false }
}

// Logged-in users get a stable "user-{userId}" device_id so their
// bookmarks/progress are synced across devices without schema changes.
export const getAccountDeviceId = () => {
  const user = getCurrentUser()
  return user ? `user-${user.userId}` : null
}

export const authHeaders = () => {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
