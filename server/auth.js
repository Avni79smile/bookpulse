import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const JWT_SECRET = process.env.JWT_SECRET || 'dev-fallback-secret-change-in-production'

let oauthClient = null
if (GOOGLE_CLIENT_ID) {
  oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID)
}

export const verifyJWT = (token) => jwt.verify(token, JWT_SECRET)

export const setupAuthRoutes = (app, pool) => {
  // Public config — client ID is a public identifier, safe to expose
  app.get('/api/auth/config', (_req, res) => {
    res.json({ clientId: GOOGLE_CLIENT_ID })
  })

  // POST /api/auth/google — exchange Google ID token for our JWT
  app.post('/api/auth/google', async (req, res) => {
    const { credential, deviceId } = req.body
    if (!credential) return res.status(400).json({ error: 'credential required' })
    if (!oauthClient) return res.status(503).json({ error: 'Google auth not configured — set GOOGLE_CLIENT_ID' })

    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      })
      const payload = ticket.getPayload()
      const { sub: googleId, email, name, picture = '' } = payload

      let userId = googleId
      if (pool) {
        const result = await pool.query(
          `INSERT INTO users (google_id, email, name, picture)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (google_id) DO UPDATE
           SET email = EXCLUDED.email, name = EXCLUDED.name, picture = EXCLUDED.picture
           RETURNING id`,
          [googleId, email, name, picture]
        )
        userId = String(result.rows[0].id)

        // Migrate guest bookmarks to account on first sign-in
        if (deviceId && deviceId.startsWith('dev-')) {
          const accountId = `user-${userId}`
          await pool.query(
            `INSERT INTO bookmarks (device_id, book_id, title, author, image, source, created_at)
             SELECT $1, book_id, title, author, image, source, created_at
             FROM bookmarks WHERE device_id = $2
             ON CONFLICT (device_id, book_id) DO NOTHING`,
            [accountId, deviceId]
          ).catch(() => {})
          await pool.query(
            `INSERT INTO reading_progress (device_id, book_id, title, chapter, position, updated_at)
             SELECT $1, book_id, title, chapter, position, updated_at
             FROM reading_progress WHERE device_id = $2
             ON CONFLICT (device_id, book_id) DO NOTHING`,
            [accountId, deviceId]
          ).catch(() => {})
        }
      }

      const token = jwt.sign(
        { userId, email, name, picture },
        JWT_SECRET,
        { expiresIn: '7d' }
      )

      res.json({ token, user: { userId, email, name, picture } })
    } catch (err) {
      console.error('[Auth] Google verification error:', err.message)
      res.status(401).json({ error: 'Invalid Google credential' })
    }
  })

  // GET /api/auth/me — validate existing JWT
  app.get('/api/auth/me', (req, res) => {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) return res.json({ user: null })
    try {
      const decoded = verifyJWT(header.slice(7))
      const { userId, email, name, picture } = decoded
      res.json({ user: { userId, email, name, picture } })
    } catch {
      res.json({ user: null })
    }
  })

  // POST /api/auth/logout — client-side only, but endpoint for completeness
  app.post('/api/auth/logout', (_req, res) => {
    res.json({ success: true })
  })
}
