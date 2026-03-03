import express from 'express'
import cors from 'cors'
import dns from 'node:dns'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

dns.setDefaultResultOrder('ipv4first')

const execFileAsync = promisify(execFile)

const app = express()
const PORT = process.env.PORT || 5175
const TMDB_API_KEY = process.env.TMDB_API_KEY || '7172c9a75fb01a4fa514de0d57a2f4c7'
const OMDB_KEY = process.env.OMDB_KEY || '8f081069'

const DEFAULT_ADAPTATION_TITLES = [
  'Pride and Prejudice',
  'Moby Dick',
  'Treasure Island',
  'Frankenstein',
  'Dracula',
  'The Time Machine',
]

const normalizeTitleForSearch = (value) => String(value || '')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/[^\w\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const scoreMovieMatch = (bookTitle, movie) => {
  const source = normalizeTitleForSearch(bookTitle).toLowerCase()
  const candidate = normalizeTitleForSearch(movie?.title || '').toLowerCase()
  if (!source || !candidate) return 0
  if (source === candidate) return 100
  if (candidate.includes(source)) return 80
  if (source.includes(candidate)) return 60
  const sourceWords = new Set(source.split(' ').filter(Boolean))
  const candidateWords = new Set(candidate.split(' ').filter(Boolean))
  let overlap = 0
  for (const word of sourceWords) {
    if (candidateWords.has(word)) overlap += 1
  }
  return overlap
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
})

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
})

const allowedOrigin = process.env.CORS_ORIGIN || '*'
app.use(cors({ origin: allowedOrigin }))

const withTimeout = async (url, timeoutMs = 12000) => {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/plain,text/html;q=0.9,*/*;q=0.8',
      },
    })
    return response
  } finally {
    clearTimeout(id)
  }
}

const assertAllowedUrl = (url) => {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname
    const allowed = [
      'www.gutenberg.org',
      'gutenberg.org',
      'gutendex.com',
      'archive.org',
      'www.archive.org',
      'ia802',
      'ia803',
      'ia804',
      'ia805',
      'ia806',
      'ia807',
      'ia808',
      'ia809',
      'ia810',
      'ia811',
      'ia812',
      'ia813',
      'ia814',
      'ia815',
      'ia816',
      'ia817',
      'ia818',
      'ia819',
      'ia820',
      'ia821',
      'ia822',
      'ia823',
      'ia824',
      'ia825',
      'ia826',
      'ia827',
      'ia828',
      'ia829',
      'ia830',
      'ia831',
      'ia832',
      'ia833',
      'ia834',
      'ia835',
      'ia836',
      'ia837',
      'ia838',
      'ia839',
      'ia840',
      'ia841',
      'ia842',
      'ia843',
      'ia844',
      'ia845',
      'ia846',
      'ia847',
      'ia848',
      'ia849',
      'ia850',
      'ia851',
      'ia852',
      'ia853',
      'ia854',
      'ia855',
      'ia856',
      'ia857',
      'ia858',
      'ia859',
      'ia860',
      'ia861',
      'ia862',
      'ia863',
      'ia864',
      'ia865',
      'ia866',
      'ia867',
      'ia868',
      'ia869',
      'ia870',
      'ia871',
      'ia872',
      'ia873',
      'ia874',
      'ia875',
      'ia876',
      'ia877',
      'ia878',
      'ia879',
      'ia880',
      'ia881',
      'ia882',
      'ia883',
      'ia884',
      'ia885',
      'ia886',
      'ia887',
      'ia888',
      'ia889',
      'ia890',
      'ia891',
      'ia892',
      'ia893',
      'ia894',
      'ia895',
      'ia896',
      'ia897',
      'ia898',
      'ia899',
      'ia900',
      'ia901',
      'ia902',
      'ia903',
      'ia904',
      'ia905',
      'ia906',
      'ia907',
      'ia908',
      'ia909',
      'ia910',
      'ia911',
      'ia912',
      'ia913',
      'ia914',
      'ia915',
      'ia916',
      'ia917',
      'ia918',
      'ia919',
      'ia920',
      'ia921',
      'ia922',
      'ia923',
      'ia924',
      'ia925',
      'ia926',
      'ia927',
      'ia928',
      'ia929',
      'ia930',
      'ia931',
      'ia932',
      'ia933',
      'ia934',
      'ia935',
      'ia936',
      'ia937',
      'ia938',
      'ia939',
      'ia940',
      'ia941',
      'ia942',
      'ia943',
      'ia944',
      'ia945',
      'ia946',
      'ia947',
      'ia948',
      'ia949',
      'ia950',
      'ia951',
      'ia952',
      'ia953',
      'ia954',
      'ia955',
      'ia956',
      'ia957',
      'ia958',
      'ia959',
      'ia960',
      'ia961',
      'ia962',
      'ia963',
      'ia964',
      'ia965',
      'ia966',
      'ia967',
      'ia968',
      'ia969',
      'ia970',
      'ia971',
      'ia972',
      'ia973',
      'ia974',
      'ia975',
      'ia976',
      'ia977',
      'ia978',
      'ia979',
      'ia980',
      'ia981',
      'ia982',
      'ia983',
      'ia984',
      'ia985',
      'ia986',
      'ia987',
      'ia988',
      'ia989',
      'ia990',
      'ia991',
      'ia992',
      'ia993',
      'ia994',
      'ia995',
      'ia996',
      'ia997',
      'ia998',
      'ia999'
    ]

    if (hostname.startsWith('ia') && hostname.endsWith('.us.archive.org')) {
      return true
    }

    return allowed.includes(hostname)
  } catch {
    return false
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/', (_req, res) => {
  res.status(200).send('BookPulse API is running. Use /api/health for status or open the app at http://localhost:5173')
})

app.get('/api/ia/search', async (req, res) => {
  try {
    const query = req.query.query || 'fiction'
    const page = req.query.page || 1
    const rows = req.query.rows || 50
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl=identifier,title,creator,description,date,mediatype,format&output=json&rows=${rows}&page=${page}`
    const response = await withTimeout(url)
    const data = await response.json()
    res.json(data)
  } catch {
    res.status(500).json({ error: 'IA search failed' })
  }
})

app.get('/api/ia/metadata/:id', async (req, res) => {
  try {
    const url = `https://archive.org/metadata/${req.params.id}`
    const response = await withTimeout(url)
    const data = await response.json()
    res.json(data)
  } catch {
    res.status(500).json({ error: 'IA metadata failed' })
  }
})

app.get('/api/ia/download', async (req, res) => {
  try {
    const item = req.query.item
    const file = req.query.file
    if (!item || !file) {
      res.status(400).json({ error: 'Missing item or file' })
      return
    }
    const url = `https://archive.org/download/${item}/${file}`
    const response = await withTimeout(url)
    if (!response.ok) {
      res.status(response.status).json({ error: 'IA download upstream error' })
      return
    }
    res.setHeader('content-type', response.headers.get('content-type') || 'application/octet-stream')
    const buffer = Buffer.from(await response.arrayBuffer())
    res.send(buffer)
  } catch {
    res.status(500).json({ error: 'IA download failed' })
  }
})

app.get('/api/gutenberg/search', async (req, res) => {
  try {
    const query = req.query.query || 'classic'
    const page = req.query.page || 1
    const url = `https://gutendex.com/books/?search=${encodeURIComponent(query)}&page=${page}`
    try {
      const response = await withTimeout(url)
      if (!response.ok) {
        throw new Error(`Gutendex upstream responded ${response.status}`)
      }
      const data = await response.json()
      res.json(data)
      return
    } catch (fetchErr) {
      const { stdout } = await execFileAsync('curl', ['-L', '--max-time', '25', '--silent', '--show-error', String(url)])
      if (!stdout || !stdout.trim()) {
        throw fetchErr
      }
      const parsed = JSON.parse(stdout)
      res.json(parsed)
      return
    }
  } catch (err) {
    console.error('Gutenberg search failed:', err?.message || err)
    res.status(500).json({ error: 'Gutenberg search failed' })
  }
})

app.get('/api/gutenberg/file', async (req, res) => {
  try {
    const url = req.query.url
    if (!url || !assertAllowedUrl(url)) {
      res.status(400).json({ error: 'Invalid URL' })
      return
    }
    // Try curl first — most reliable for large text files with redirects
    try {
      const { stdout } = await execFileAsync(
        'curl',
        ['-L', '--max-time', '30', '--silent', '--show-error', '--compressed', String(url)],
        { maxBuffer: 20 * 1024 * 1024 }
      )
      if (stdout && stdout.trim()) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.send(stdout)
        return
      }
    } catch (curlErr) {
      console.error('[gutenberg/file] curl failed:', curlErr.message)
    }
    // Fallback: Node fetch
    const response = await withTimeout(url, 25000)
    if (!response.ok) {
      throw new Error(`Upstream responded ${response.status}`)
    }
    const text = await response.text()
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.send(text)
  } catch (e) {
    console.error('[gutenberg/file] failed:', e.message)
    res.status(500).json({ error: 'Gutenberg file failed' })
  }
})

app.get('/api/google/books', async (req, res) => {
  try {
    const query = req.query.query || 'fiction'
    const startIndex = req.query.startIndex || 0
    const filter = req.query.filter || ''
    const apiKey = process.env.GOOGLE_BOOKS_KEY
    const keyPart = apiKey ? `&key=${apiKey}` : ''
    const filterPart = filter ? `&filter=${filter}` : ''
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=40&startIndex=${startIndex}&printType=books${filterPart}${keyPart}`
    const response = await withTimeout(url)
    const data = await response.json()
    res.json(data)
  } catch {
    res.status(500).json({ error: 'Google Books failed' })
  }
})

app.get('/api/openlibrary/search', async (req, res) => {
  try {
    const query = req.query.query || 'fiction'
    const page = req.query.page || 1
    const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&has_fulltext=true&public_scan_b=true&limit=50&page=${page}`
    const response = await withTimeout(url)
    const data = await response.json()
    res.json(data)
  } catch {
    res.status(500).json({ error: 'Open Library search failed' })
  }
})

app.get('/api/librivox/search', async (req, res) => {
  try {
    const query = req.query.query || ''
    const page = req.query.page || 1
    const offset = (page - 1) * 50
    // LibriVox title search is strict; use ^title for partial match or fallback to listing all
    let url
    if (query) {
      url = `https://librivox.org/api/feed/audiobooks?format=json&title=^${encodeURIComponent(query)}&offset=${offset}&limit=50&extended=1`
    } else {
      url = `https://librivox.org/api/feed/audiobooks?format=json&offset=${offset}&limit=50&extended=1`
    }
    const response = await withTimeout(url)
    const data = await response.json()
    // If title search fails, try author search
    if (data.error && query) {
      const authorUrl = `https://librivox.org/api/feed/audiobooks?format=json&author=^${encodeURIComponent(query)}&offset=${offset}&limit=50&extended=1`
      const authorResponse = await withTimeout(authorUrl)
      const authorData = await authorResponse.json()
      if (!authorData.error) {
        return res.json(authorData)
      }
      // Fallback: return recent audiobooks
      const fallbackUrl = `https://librivox.org/api/feed/audiobooks?format=json&offset=${offset}&limit=50&extended=1`
      const fallbackResponse = await withTimeout(fallbackUrl)
      const fallbackData = await fallbackResponse.json()
      return res.json(fallbackData)
    }
    res.json(data)
  } catch {
    res.status(500).json({ error: 'LibriVox search failed' })
  }
})

app.get('/api/movies/trailers', async (req, res) => {
  try {
    const titles = typeof req.query.titles === 'string' && req.query.titles.trim()
      ? req.query.titles.split(',').map((item) => item.trim()).filter(Boolean)
      : DEFAULT_ADAPTATION_TITLES

    const selectedTitles = titles.slice(0, 12)

    const results = await Promise.all(selectedTitles.map(async (title) => {
      const queryTitle = normalizeTitleForSearch(title).split(':')[0].trim() || title
      const tmdbSearchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(queryTitle)}&include_adult=false`
      const searchResponse = await withTimeout(tmdbSearchUrl, 12000)
      const searchData = await searchResponse.json()
      const movie = Array.isArray(searchData?.results)
        ? [...searchData.results]
          .filter((item) => item?.title)
          .sort((a, b) => scoreMovieMatch(title, b) - scoreMovieMatch(title, a))[0]
        : null

      if (!movie?.id) {
        return null
      }

      const videosUrl = `https://api.themoviedb.org/3/movie/${movie.id}/videos?api_key=${TMDB_API_KEY}`
      const videosResponse = await withTimeout(videosUrl, 12000)
      const videosData = await videosResponse.json()

      const trailer = Array.isArray(videosData?.results)
        ? videosData.results.find((video) => video.site === 'YouTube' && video.type === 'Trailer')
          || videosData.results.find((video) => video.site === 'YouTube')
        : null

      const releaseYear = typeof movie.release_date === 'string' ? movie.release_date.slice(0, 4) : ''
      const fallbackPoster = movie.backdrop_path
        ? `https://image.tmdb.org/t/p/w780${movie.backdrop_path}`
        : movie.poster_path
          ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
          : trailer?.key
            ? `https://img.youtube.com/vi/${trailer.key}/hqdefault.jpg`
            : 'https://via.placeholder.com/640x360?text=Classic+Film'

      let omdbOverview = ''
      let omdbPoster = ''
      if (OMDB_KEY) {
        try {
          const omdbUrl = `https://www.omdbapi.com/?apikey=${OMDB_KEY}&t=${encodeURIComponent(movie.title)}${releaseYear ? `&y=${releaseYear}` : ''}`
          const omdbResponse = await withTimeout(omdbUrl, 10000)
          const omdbData = await omdbResponse.json()
          if (omdbData?.Response === 'True') {
            omdbOverview = typeof omdbData.Plot === 'string' ? omdbData.Plot : ''
            omdbPoster = typeof omdbData.Poster === 'string' && omdbData.Poster !== 'N/A' ? omdbData.Poster : ''
          }
        } catch (omdbErr) {
          console.warn('OMDB lookup failed:', omdbErr?.message || omdbErr)
        }
      }

      return {
        id: `tmdb-${movie.id}`,
        title: movie.title,
        image: omdbPoster || fallbackPoster,
        url: trailer?.key ? `https://www.youtube.com/watch?v=${trailer.key}` : `https://www.themoviedb.org/movie/${movie.id}`,
        year: releaseYear || 'N/A',
        overview: omdbOverview || movie.overview || 'Classic public-domain adaptation trailer.',
        sourceBookTitle: title,
      }
    }))

    res.json({ results: results.filter(Boolean) })
  } catch (err) {
    console.error('Movie trailers fetch failed:', err)
    res.status(500).json({ error: 'Movie trailers fetch failed' })
  }
})

const server = app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use. Kill the process using that port and restart.`)
    process.exit(1)
  } else {
    console.error('Server error:', err)
    process.exit(1)
  }
})
