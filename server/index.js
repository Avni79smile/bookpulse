import express from 'express'
import cors from 'cors'
import dns from 'node:dns'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import yts from 'yt-search'

dns.setDefaultResultOrder('ipv4first')

const execFileAsync = promisify(execFile)
const { Pool } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DIST_PATH = path.join(__dirname, '..', 'dist')
const IS_PROD = existsSync(path.join(DIST_PATH, 'index.html'))

const app = express()
const PORT = process.env.PORT || 5175
const TMDB_API_KEY = process.env.TMDB_API_KEY
const OMDB_KEY = process.env.OMDB_KEY
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

// In production, serve the built React app static files
if (IS_PROD) {
  app.use(express.static(DIST_PATH))
}


app.use(express.json())

// ─── Structured API Logger ─────────────────────────────────────────────────
const apiLog = {
  info: (route, msg, extra = {}) => {
    const extras = Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''
    console.log(`[API:${route}] ${msg}${extras}`)
  },
  warn: (route, msg, extra = {}) => {
    const extras = Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''
    console.warn(`[API:${route}] WARN: ${msg}${extras}`)
  },
  error: (route, msg, err, extra = {}) => {
    const errMsg = err instanceof Error ? err.message : String(err)
    const errCode = err?.code ? ` (code=${err.code})` : ''
    const extras = Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''
    console.error(`[API:${route}] ERROR: ${msg} — ${errMsg}${errCode}${extras}`)
  },
}

// ─── Simple In-Memory TTL Cache ────────────────────────────────────────────
class SimpleCache {
  constructor() { this._store = new Map() }

  get(key) {
    const entry = this._store.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) { this._store.delete(key); return null }
    return entry.value
  }

  set(key, value, ttlMs) {
    this._store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  has(key) { return this.get(key) !== null }

  size() { return this._store.size }
}

const cache = new SimpleCache()

const CACHE_TTL = {
  IA_SEARCH:     5  * 60 * 1000,   // 5 min — IA search results
  IA_META:       10 * 60 * 1000,   // 10 min — item metadata rarely changes
  LIBRIVOX:      5  * 60 * 1000,   // 5 min
  GOOGLE_BOOKS:  10 * 60 * 1000,   // 10 min
  OPEN_LIBRARY:  10 * 60 * 1000,   // 10 min
  MOVIE_TRAIL:   30 * 60 * 1000,   // 30 min — trailer results are very stable
  AUDIO_RESOLVE: 30 * 60 * 1000,   // 30 min — resolved chapter lists are stable
}

// ─── PostgreSQL Database ───────────────────────────────────────────────────
const pool = hasDatabaseUrl ? new Pool({ connectionString: process.env.DATABASE_URL }) : null
let databaseAvailable = Boolean(pool)
const bookmarksStore = new Map()
const progressStore = new Map()

const getDeviceStore = (store, deviceId) => {
  if (!store.has(deviceId)) store.set(deviceId, new Map())
  return store.get(deviceId)
}

const useMemoryFallback = (err, context) => {
  if (databaseAvailable) {
    databaseAvailable = false
    console.warn(`${context}: database unavailable, using in-memory storage`, err?.message || err)
  }
}

const initDb = async () => {
  if (!pool) { return }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id SERIAL PRIMARY KEY,
        device_id TEXT NOT NULL,
        book_id TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT,
        image TEXT,
        source TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(device_id, book_id)
      );
      CREATE TABLE IF NOT EXISTS reading_progress (
        id SERIAL PRIMARY KEY,
        device_id TEXT NOT NULL,
        book_id TEXT NOT NULL,
        title TEXT,
        chapter INTEGER DEFAULT 0,
        position INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(device_id, book_id)
      );
    `)
    console.log('Database tables ready')
  } catch (err) {
    useMemoryFallback(err, 'DB init error')
  }
}
initDb()

// ─── Curated Gutenberg Catalog (120+ books) ────────────────────────────────
const makeBook = (id, title, authorName, birthYear, deathYear, subjects = [], bookshelves = [], downloads = 10000) => ({
  id,
  title,
  authors: [{ name: authorName, birth_year: birthYear, death_year: deathYear }],
  subjects,
  bookshelves,
  formats: {
    'text/plain; charset=utf-8': `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
    'image/jpeg': `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`,
    'text/html; charset=utf-8': `https://www.gutenberg.org/files/${id}/${id}-h/${id}-h.htm`,
  },
  download_count: downloads,
})

const GUTENBERG_CATALOG = [
  // Austen
  makeBook(1342, 'Pride and Prejudice', 'Austen, Jane', 1775, 1817, ['England -- Social life', 'Love stories', 'Sisters -- Fiction'], ['Best Books Ever Listings', 'General Fiction'], 52000),
  makeBook(158,  'Emma', 'Austen, Jane', 1775, 1817, ['England -- Social life', 'Love stories', 'Women -- Fiction'], ['Romance', 'General Fiction'], 30000),
  makeBook(161,  'Sense and Sensibility', 'Austen, Jane', 1775, 1817, ['England -- Social life', 'Sisters -- Fiction', 'Love stories'], ['Romance', 'General Fiction'], 29000),
  makeBook(105,  'Persuasion', 'Austen, Jane', 1775, 1817, ['England -- Social life', 'Love stories'], ['Romance', 'General Fiction'], 28000),
  makeBook(141,  'Mansfield Park', 'Austen, Jane', 1775, 1817, ['Love stories', 'England -- Social life', 'Cousins -- Fiction'], ['Romance', 'General Fiction'], 18000),
  makeBook(121,  'Northanger Abbey', 'Austen, Jane', 1775, 1817, ['Gothic fiction', 'Romance -- Fiction'], ['Romance', 'Gothic Fiction', 'General Fiction'], 14000),
  // Horror / Gothic
  makeBook(84,   'Frankenstein; or, The Modern Prometheus', 'Shelley, Mary Wollstonecraft', 1797, 1851, ['Horror tales', 'Science fiction', 'Monsters -- Fiction'], ['Horror', 'Science Fiction'], 48000),
  makeBook(345,  'Dracula', 'Stoker, Bram', 1847, 1912, ['Horror tales', 'Vampires -- Fiction'], ['Horror', 'Gothic Fiction'], 36000),
  makeBook(174,  'The Picture of Dorian Gray', 'Wilde, Oscar', 1854, 1900, ['Horror tales', 'Aesthetic movement'], ['Horror', 'Classic Literature'], 35000),
  makeBook(43,   'The Strange Case of Dr Jekyll and Mr Hyde', 'Stevenson, Robert Louis', 1850, 1894, ['Horror tales', 'Science fiction', 'Psychological fiction'], ['Horror', 'Science Fiction'], 33000),
  makeBook(768,  'Wuthering Heights', 'Brontë, Emily', 1818, 1848, ['Love stories', 'Revenge -- Fiction', 'Gothic fiction'], ['Gothic Fiction', 'Romance'], 32000),
  makeBook(521,  'The House of the Seven Gables', 'Hawthorne, Nathaniel', 1804, 1864, ['Historical fiction', 'Salem (Mass.) -- Fiction'], ['Gothic Fiction', 'Historical Fiction'], 7000),
  makeBook(5827, 'The Fall of the House of Usher and Other Tales', 'Poe, Edgar Allan', 1809, 1849, ['Horror tales', 'Gothic fiction', 'Short stories'], ['Horror', 'Short Stories', 'Gothic Fiction'], 7500),
  makeBook(60,   'The Gold-Bug and Other Tales', 'Poe, Edgar Allan', 1809, 1849, ['Horror tales', 'Short stories', 'Detective and mystery stories'], ['Horror', 'Short Stories', 'Detective Fiction'], 5000),
  makeBook(1041, 'The Legend of Sleepy Hollow', 'Irving, Washington', 1783, 1859, ['Horror tales', 'Ghosts -- Fiction', 'New York -- Fiction'], ['Horror', 'Short Stories'], 7800),
  // Dickens
  makeBook(98,   'A Tale of Two Cities', 'Dickens, Charles', 1812, 1870, ['France -- History -- Revolution', 'Historical fiction'], ['Historical Fiction'], 38000),
  makeBook(1400, 'Great Expectations', 'Dickens, Charles', 1812, 1870, ['Orphans -- Fiction', 'Young men -- Fiction', 'England -- Social life'], ['General Fiction', 'Historical Fiction'], 26000),
  makeBook(46,   'A Christmas Carol in Prose', 'Dickens, Charles', 1812, 1870, ['Christmas stories', 'Ghosts -- Fiction'], ['General Fiction', 'Holiday Fiction'], 25000),
  makeBook(730,  'Oliver Twist', 'Dickens, Charles', 1812, 1870, ['Orphans -- Fiction', 'Crime -- Fiction', 'London -- Fiction'], ['General Fiction', 'Historical Fiction'], 11000),
  makeBook(564,  'David Copperfield', 'Dickens, Charles', 1812, 1870, ['Orphans -- Fiction', 'Young men -- England -- Fiction'], ['General Fiction', 'Historical Fiction', 'Classic Literature'], 9000),
  // Adventure / Classic
  makeBook(2701, 'Moby-Dick; or, The Whale', 'Melville, Herman', 1819, 1891, ['Whaling -- Fiction', 'Sea stories', 'Adventure fiction'], ['Adventure Fiction'], 42000),
  makeBook(120,  'Treasure Island', 'Stevenson, Robert Louis', 1850, 1894, ['Treasure troves -- Fiction', 'Adventure fiction', 'Pirates'], ['Adventure Fiction'], 34000),
  makeBook(863,  'The Count of Monte Cristo', 'Dumas, Alexandre', 1802, 1870, ['Adventure fiction', 'Historical fiction', 'Revenge -- Fiction'], ['Adventure Fiction', 'Historical Fiction'], 21000),
  makeBook(135,  'Les Misérables', 'Hugo, Victor', 1802, 1885, ['France -- Social life', 'Historical fiction', 'Poverty -- Fiction'], ['Historical Fiction', 'General Fiction'], 20500),
  makeBook(2488, 'The Three Musketeers', 'Dumas, Alexandre', 1802, 1870, ['Adventure fiction', 'Historical fiction', 'France -- History'], ['Adventure Fiction', 'Historical Fiction'], 9000),
  makeBook(1257, 'The Scarlet Pimpernel', 'Orczy, Emmuska', 1865, 1947, ['Adventure fiction', 'Historical fiction', 'France -- History -- Revolution'], ['Adventure Fiction', 'Historical Fiction'], 8000),
  makeBook(349,  'Kidnapped', 'Stevenson, Robert Louis', 1850, 1894, ['Adventure fiction', 'Scotland -- History -- Fiction'], ['Adventure Fiction', 'Historical Fiction', "Children's Literature"], 7000),
  makeBook(766,  'David Balfour', 'Stevenson, Robert Louis', 1850, 1894, ['Adventure fiction', 'Scotland -- Fiction'], ['Adventure Fiction', 'Historical Fiction'], 3000),
  // Twain
  makeBook(76,   'Adventures of Huckleberry Finn', 'Twain, Mark', 1835, 1910, ['Missouri -- Fiction', 'Adventure fiction', 'River life'], ['Adventure Fiction', 'Humor'], 37000),
  makeBook(74,   'The Adventures of Tom Sawyer', 'Twain, Mark', 1835, 1910, ['Boys -- Fiction', 'Adventure fiction', 'Missouri'], ['Adventure Fiction', "Children's Literature"], 22500),
  makeBook(102,  "Pudd'nhead Wilson", 'Twain, Mark', 1835, 1910, ['Missouri -- Fiction', 'Satire'], ['General Fiction', 'Humor', 'Classic Literature'], 4000),
  // Sherlock Holmes
  makeBook(1661, 'The Adventures of Sherlock Holmes', 'Doyle, Arthur Conan', 1859, 1930, ['Detective and mystery stories', 'Holmes, Sherlock'], ['Detective Fiction', 'Mystery Fiction'], 40000),
  makeBook(244,  'A Study in Scarlet', 'Doyle, Arthur Conan', 1859, 1930, ['Detective and mystery stories', 'Holmes, Sherlock'], ['Detective Fiction', 'Mystery Fiction'], 24000),
  makeBook(834,  'The Memoirs of Sherlock Holmes', 'Doyle, Arthur Conan', 1859, 1930, ['Detective and mystery stories', 'Holmes, Sherlock'], ['Detective Fiction', 'Mystery Fiction'], 18000),
  makeBook(2852, 'The Hound of the Baskervilles', 'Doyle, Arthur Conan', 1859, 1930, ['Detective and mystery stories', 'Moors -- England -- Fiction'], ['Detective Fiction', 'Mystery Fiction', 'Horror'], 15000),
  makeBook(2097, 'The Sign of the Four', 'Doyle, Arthur Conan', 1859, 1930, ['Detective and mystery stories', 'Holmes, Sherlock'], ['Detective Fiction', 'Mystery Fiction'], 12000),
  makeBook(108,  'The Return of Sherlock Holmes', 'Doyle, Arthur Conan', 1859, 1930, ['Detective and mystery stories', 'Holmes, Sherlock'], ['Detective Fiction', 'Mystery Fiction'], 10000),
  // Brontë
  makeBook(1260, 'Jane Eyre: An Autobiography', 'Brontë, Charlotte', 1816, 1855, ['Orphans -- Fiction', 'Love stories', 'Gothic fiction'], ['Gothic Fiction', 'Romance'], 31000),
  makeBook(9182, 'Villette', 'Brontë, Charlotte', 1816, 1855, ['Women -- Fiction', 'Belgium -- Fiction'], ['Romance', 'General Fiction'], 5000),
  // Children's Literature
  makeBook(11,   "Alice's Adventures in Wonderland", 'Carroll, Lewis', 1832, 1898, ['Fantasy fiction', "Children's stories"], ['Fantasy Fiction', "Children's Literature"], 47000),
  makeBook(12,   'Through the Looking-Glass', 'Carroll, Lewis', 1832, 1898, ['Fantasy fiction', "Children's stories"], ['Fantasy Fiction', "Children's Literature"], 18500),
  makeBook(55,   'The Wonderful Wizard of Oz', 'Baum, L. Frank', 1856, 1919, ['Fantasy fiction', "Children's stories"], ['Fantasy Fiction', "Children's Literature"], 19000),
  makeBook(514,  'Little Women', 'Alcott, Louisa May', 1832, 1888, ['Sisters -- Fiction', 'New England -- Social life', 'Family -- Fiction'], ['General Fiction', "Children's Literature"], 27000),
  makeBook(514,  'Little Men', 'Alcott, Louisa May', 1832, 1888, ["Children's stories", 'Schools -- Fiction'], ["Children's Literature", 'General Fiction'], 5000),
  makeBook(45,   'Anne of Green Gables', 'Montgomery, L. M.', 1874, 1942, ['Orphans -- Fiction', "Children's stories", 'Prince Edward Island'], ["Children's Literature", 'Romance', 'General Fiction'], 9500),
  makeBook(140,  'The Jungle Book', 'Kipling, Rudyard', 1865, 1936, ["Children's stories", 'Animals -- Fiction', 'India -- Fiction'], ["Children's Literature", 'Adventure Fiction'], 10000),
  makeBook(16,   'Peter Pan in Kensington Gardens', 'Barrie, J. M.', 1860, 1937, ["Children's stories", 'Fantasy fiction', 'Fairies -- Fiction'], ["Children's Literature", 'Fantasy Fiction'], 9000),
  makeBook(8164, 'The Wind in the Willows', 'Grahame, Kenneth', 1859, 1932, ["Children's stories", 'Animals -- Fiction'], ["Children's Literature", 'Fantasy Fiction'], 8500),
  makeBook(3296, "Grimm's Fairy Tales", 'Grimm, Wilhelm; Grimm, Jacob', 1786, 1859, ['Fairy tales', "Children's stories"], ["Children's Literature", 'Fairy Tales'], 7200),
  makeBook(19942,'Twenty Thousand Leagues Under the Sea', 'Verne, Jules', 1828, 1905, ['Science fiction', 'Submarines -- Fiction', 'Underwater exploration'], ['Science Fiction', 'Adventure Fiction'], 9000),
  makeBook(1268, 'Around the World in Eighty Days', 'Verne, Jules', 1828, 1905, ['Adventure fiction', 'Voyages around the world -- Fiction'], ['Adventure Fiction', 'Science Fiction'], 8500),
  makeBook(3988, 'Journey to the Center of the Earth', 'Verne, Jules', 1828, 1905, ['Science fiction', 'Adventure fiction'], ['Science Fiction', 'Adventure Fiction'], 8000),
  // Wells / Science Fiction
  makeBook(36,   'The War of the Worlds', 'Wells, H. G.', 1866, 1946, ['Science fiction', 'Martians -- Fiction', 'Interplanetary voyages'], ['Science Fiction'], 20000),
  makeBook(35,   'The Time Machine', 'Wells, H. G.', 1866, 1946, ['Science fiction', 'Time travel -- Fiction'], ['Science Fiction'], 19500),
  makeBook(5230, 'The Invisible Man', 'Wells, H. G.', 1866, 1946, ['Science fiction', 'Invisible man -- Fiction'], ['Science Fiction', 'Horror'], 10000),
  makeBook(159,  'The Island of Doctor Moreau', 'Wells, H. G.', 1866, 1946, ['Science fiction', 'Horror tales'], ['Science Fiction', 'Horror'], 8000),
  makeBook(1013, 'The First Men in the Moon', 'Wells, H. G.', 1866, 1946, ['Science fiction', 'Moon -- Fiction'], ['Science Fiction'], 6000),
  // Russian Literature
  makeBook(2554, 'Crime and Punishment', 'Dostoyevsky, Fyodor', 1821, 1881, ['Psychological fiction', 'Crime -- Fiction', 'Russia'], ['General Fiction', 'Classic Literature'], 15500),
  makeBook(2600, 'War and Peace', 'Tolstoy, Leo', 1828, 1910, ['Historical fiction', 'Russia -- History -- War of 1812', 'Napoleonic Wars'], ['Historical Fiction', 'Classic Literature'], 15000),
  makeBook(1399, 'Anna Karenina', 'Tolstoy, Leo', 1828, 1910, ['Love stories', 'Adultery -- Fiction', 'Russia -- Social life'], ['Romance', 'Classic Literature'], 14500),
  makeBook(28054,'The Brothers Karamazov', 'Dostoyevsky, Fyodor', 1821, 1881, ['Russia -- Fiction', 'Brothers -- Fiction', 'Psychological fiction'], ['General Fiction', 'Classic Literature'], 9000),
  makeBook(2638, 'The Idiot', 'Dostoyevsky, Fyodor', 1821, 1881, ['Psychological fiction', 'Russia -- Fiction'], ['General Fiction', 'Classic Literature'], 6000),
  makeBook(8117, 'The Possessed', 'Dostoyevsky, Fyodor', 1821, 1881, ['Russia -- Social life', 'Political fiction'], ['General Fiction', 'Classic Literature'], 4000),
  // Other Classic Fiction
  makeBook(5200, 'The Metamorphosis', 'Kafka, Franz', 1883, 1924, ['Psychological fiction', 'Fantasy fiction', 'Germany'], ['General Fiction', 'Short Stories'], 18000),
  makeBook(7676, 'The Trial', 'Kafka, Franz', 1883, 1924, ['Psychological fiction', 'Trials (Fiction)', 'Germany'], ['General Fiction', 'Classic Literature'], 8000),
  makeBook(996,  'Don Quixote', 'Cervantes Saavedra, Miguel de', 1547, 1616, ['Knights and knighthood -- Fiction', 'Adventure fiction'], ['Adventure Fiction', 'Classic Literature'], 17500),
  makeBook(2814, 'Dubliners', 'Joyce, James', 1882, 1941, ['Short stories', 'Dublin (Ireland) -- Fiction'], ['Short Stories', 'Classic Literature'], 14000),
  makeBook(4300, 'Ulysses', 'Joyce, James', 1882, 1941, ['Ireland -- Social life', 'Dublin (Ireland) -- Fiction'], ['General Fiction', 'Classic Literature'], 8000),
  makeBook(2641, 'A Room with a View', 'Forster, E. M.', 1879, 1970, ['Love stories', 'England -- Fiction', 'Italy -- Fiction'], ['Romance', 'General Fiction'], 13000),
  makeBook(2500, 'Siddhartha', 'Hesse, Hermann', 1877, 1962, ['Philosophical fiction', 'Buddhism', 'India -- Fiction'], ['Philosophy', 'Classic Literature'], 12000),
  makeBook(2348, 'Madame Bovary', 'Flaubert, Gustave', 1821, 1880, ['Love stories', 'Adultery -- Fiction', 'France -- Fiction'], ['Romance', 'Classic Literature'], 8000),
  makeBook(219,  'Heart of Darkness', 'Conrad, Joseph', 1857, 1924, ['Africa -- Fiction', 'Psychological fiction'], ['General Fiction', 'Classic Literature'], 22000),
  makeBook(2542, "A Doll's House", 'Ibsen, Henrik', 1828, 1906, ['Plays', 'Domestic drama', 'Marriage -- Drama'], ['Drama', 'Classic Literature'], 9000),
  makeBook(2148, 'The Red Badge of Courage', 'Crane, Stephen', 1871, 1900, ['War stories', 'American Civil War -- Fiction'], ['Historical Fiction', 'War Fiction'], 8000),
  makeBook(215,  'The Call of the Wild', 'London, Jack', 1876, 1916, ['Dogs -- Fiction', 'Adventure fiction', 'Alaska -- Fiction'], ['Adventure Fiction', "Children's Literature"], 12000),
  makeBook(1074, 'The Sea-Wolf', 'London, Jack', 1876, 1916, ['Sea stories', 'Adventure fiction'], ['Adventure Fiction', 'Classic Literature'], 6000),
  makeBook(3176, 'The Awakening', 'Chopin, Kate', 1850, 1904, ['Women -- Fiction', 'Louisiana -- Fiction', 'Love stories'], ['General Fiction', 'Classic Literature', 'Romance'], 9000),
  makeBook(4517, 'Ethan Frome', 'Wharton, Edith', 1862, 1937, ['Love stories', 'New England -- Fiction'], ['Romance', 'Classic Literature'], 7000),
  makeBook(10154,'Sister Carrie', 'Dreiser, Theodore', 1871, 1945, ['Chicago (Ill.) -- Fiction', 'Women -- Fiction'], ['General Fiction', 'Classic Literature'], 5000),
  makeBook(42671,'The Secret Garden', 'Burnett, Frances Hodgson', 1849, 1924, ["Children's stories", 'Gardens -- Fiction', 'Orphans -- Fiction'], ["Children's Literature", 'General Fiction'], 9000),
  makeBook(3279, 'Little Lord Fauntleroy', 'Burnett, Frances Hodgson', 1849, 1924, ["Children's stories", 'Aristocracy -- Fiction'], ["Children's Literature", 'General Fiction'], 5000),
  // Philosophy / Non-Fiction
  makeBook(1232, 'The Prince', 'Machiavelli, Niccolò', 1469, 1527, ['Political science', 'State, The'], ['Philosophy', 'Classic Literature'], 12500),
  makeBook(3825, 'Walden', 'Thoreau, Henry David', 1817, 1862, ['Solitude', 'Nature', 'Simple living'], ['Philosophy', 'Classic Literature'], 13000),
  makeBook(3207, 'Leviathan', 'Hobbes, Thomas', 1588, 1679, ['Political science', 'State, The', 'Philosophy'], ['Philosophy', 'Classic Literature'], 6000),
  makeBook(23,   'Narrative of the Life of Frederick Douglass', 'Douglass, Frederick', 1818, 1895, ['Slaves -- Biography', 'African Americans -- Biography'], ['Biography', 'History', 'Classic Literature'], 8200),
  makeBook(25,   'The Scarlet Letter', 'Hawthorne, Nathaniel', 1804, 1864, ['Historical fiction', 'Puritan New England', 'Adultery -- Fiction'], ['Historical Fiction', 'Classic Literature'], 10500),
  // Poetry / Drama
  makeBook(6130, 'The Iliad of Homer', 'Homer', null, null, ['Epic poetry', 'Trojan War'], ['Poetry', 'Classic Literature'], 12000),
  makeBook(1727, 'The Odyssey', 'Homer', null, null, ['Epic poetry', 'Odysseus (Greek mythology)'], ['Poetry', 'Classic Literature', 'Adventure Fiction'], 11500),
  makeBook(844,  'The Importance of Being Earnest', 'Wilde, Oscar', 1854, 1900, ['Comedies', 'Drama'], ['Drama', 'Classic Literature', 'Humor'], 11000),
  makeBook(902,  'The Happy Prince and Other Tales', 'Wilde, Oscar', 1854, 1900, ['Fairy tales', "Children's stories"], ['Fairy Tales', "Children's Literature"], 9000),
  makeBook(1064, 'The Raven', 'Poe, Edgar Allan', 1809, 1849, ['Poetry', 'Horror tales'], ['Poetry', 'Classic Literature'], 7400),
  // Shakespeare
  makeBook(1513, 'Romeo and Juliet', 'Shakespeare, William', 1564, 1616, ['Tragedy', 'Love -- Drama', 'Plays'], ['Drama', 'Classic Literature', 'Romance'], 18000),
  makeBook(1524, 'Hamlet, Prince of Denmark', 'Shakespeare, William', 1564, 1616, ['Tragedy', 'Plays', 'Revenge -- Drama'], ['Drama', 'Classic Literature'], 14000),
  makeBook(1533, 'Macbeth', 'Shakespeare, William', 1564, 1616, ['Tragedy', 'Plays'], ['Drama', 'Classic Literature'], 12000),
  makeBook(1529, 'Othello, the Moor of Venice', 'Shakespeare, William', 1564, 1616, ['Tragedy', 'Plays'], ['Drama', 'Classic Literature'], 10000),
  makeBook(2242, "A Midsummer Night's Dream", 'Shakespeare, William', 1564, 1616, ['Comedy', 'Plays', 'Fairies -- Drama'], ['Drama', 'Classic Literature'], 9000),
  makeBook(1500, 'The Merchant of Venice', 'Shakespeare, William', 1564, 1616, ['Comedy', 'Plays'], ['Drama', 'Classic Literature'], 8000),
  makeBook(1128, 'King Lear', 'Shakespeare, William', 1564, 1616, ['Tragedy', 'Plays', 'Kings and rulers -- Drama'], ['Drama', 'Classic Literature'], 7500),
  makeBook(1522, 'Julius Caesar', 'Shakespeare, William', 1564, 1616, ['Tragedy', 'Plays', 'Rome -- History -- Drama'], ['Drama', 'Classic Literature', 'Historical Fiction'], 7000),
  makeBook(1523, 'The Tempest', 'Shakespeare, William', 1564, 1616, ['Plays', 'Fantasy fiction'], ['Drama', 'Classic Literature'], 6500),
  // Other
  makeBook(7370, 'Anthem', 'Rand, Ayn', 1905, 1982, ['Dystopian fiction', 'Science fiction', 'Individualism'], ['Science Fiction', 'Dystopian Fiction'], 13500),
  makeBook(10,   'The Bible, King James Version', 'Various', null, null, ['Religion', 'Bibles'], ['Religion', 'Classic Literature'], 12000),
  makeBook(408,  'The Life of Napoleon Bonaparte', 'Abbott, John S. C.', 1805, 1877, ['Biography', 'Napoleon I, Emperor of the French'], ['Biography', 'History'], 5000),
].filter((book, index, arr) => arr.findIndex(b => b.id === book.id) === index)

const searchCatalog = (query, page = 1, pageSize = 32) => {
  const q = (query || '').toLowerCase().trim()
  const filtered = q
    ? GUTENBERG_CATALOG.filter(b => {
        const titleMatch = b.title.toLowerCase().includes(q)
        const authorMatch = b.authors.some(a => a.name.toLowerCase().includes(q))
        const subjectMatch = b.subjects.some(s => s.toLowerCase().includes(q))
        const shelfMatch = b.bookshelves.some(s => s.toLowerCase().includes(q))
        return titleMatch || authorMatch || subjectMatch || shelfMatch
      })
    : [...GUTENBERG_CATALOG]

  filtered.sort((a, b) => b.download_count - a.download_count)

  const start = (page - 1) * pageSize
  const results = filtered.slice(start, start + pageSize)
  return {
    count: filtered.length,
    next: start + pageSize < filtered.length ? `page=${page + 1}` : null,
    previous: page > 1 ? `page=${page - 1}` : null,
    results,
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────
const DEFAULT_ADAPTATION_TITLES = [
  'Pride and Prejudice', 'Moby Dick', 'Treasure Island',
  'Frankenstein', 'Dracula', 'The Time Machine',
]

const normalizeTitleForSearch = (value) => String(value || '')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/[^\w\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const MATCH_STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'at', 'to',
  'for', 'by', 'with', 'from', 'as', 'is', 'was', 'are', 'its',
])

const scoreMovieMatch = (bookTitle, movie) => {
  const norm = (val) => normalizeTitleForSearch(val).toLowerCase()
  const source = norm(bookTitle)
  const candidate = norm(movie?.title || '')
  if (!source || !candidate) return 0

  if (source === candidate) return 100

  // Strip subtitles (text after : or ;) for a tighter core comparison
  const sourceCore = source.split(/\s*[:;]\s*/)[0].trim()
  const candidateCore = candidate.split(/\s*[:;]\s*/)[0].trim()

  if (sourceCore && candidateCore) {
    if (sourceCore === candidateCore) return 95
    if (candidate === sourceCore || source === candidateCore) return 88
    if (candidate.includes(sourceCore) || source.includes(candidateCore)) return 78
    if (candidateCore.includes(sourceCore) || sourceCore.includes(candidateCore)) return 72
  }

  // Meaningful-word overlap (skip stop words and very short tokens)
  const toWords = (str) => str.split(/\s+/).filter(w => w.length > 2 && !MATCH_STOP_WORDS.has(w))
  const sourceWords = toWords(source)
  const candidateWordSet = new Set(toWords(candidate))

  if (sourceWords.length === 0 || candidateWordSet.size === 0) return 0

  let overlap = 0
  for (const word of sourceWords) {
    if (candidateWordSet.has(word)) overlap++
  }

  const ratio = overlap / Math.max(sourceWords.length, candidateWordSet.size)
  return Math.round(ratio * 65) // cap at 65 for word-level matches
}

const CONFIDENCE_MIN = 35 // reject matches below this threshold

process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason))
process.on('uncaughtException', (error) => console.error('Uncaught exception:', error))

const allowedOrigin = process.env.CORS_ORIGIN || '*'
app.use(cors({ origin: allowedOrigin }))

// ─── withTimeout — logs the URL + route on abort/error ────────────────────
const withTimeout = async (url, timeoutMs = 12000, route = 'unknown', extraHeaders = {}) => {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/plain,text/html;q=0.9,*/*;q=0.8',
        ...extraHeaders,
      },
    })
    return response
  } catch (err) {
    if (err.name === 'AbortError') {
      apiLog.error(route, `Timeout after ${timeoutMs}ms`, err, { url })
    } else {
      apiLog.error(route, 'Fetch failed', err, { url })
    }
    throw err
  } finally {
    clearTimeout(id)
  }
}

const assertAllowedUrl = (url) => {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname
    if (hostname.startsWith('ia') && hostname.endsWith('.us.archive.org')) return true
    const allowed = [
      'www.gutenberg.org', 'gutenberg.org', 'gutendex.com',
      'archive.org', 'www.archive.org',
    ]
    return allowed.includes(hostname)
  } catch { return false }
}

// ─── Routes ────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true, cacheSize: cache.size() }))

app.get('/', (_req, res) => {
  if (IS_PROD) return res.sendFile(path.join(DIST_PATH, 'index.html'))
  res.status(200).send('BookPulse API running. Open /api/health for status.')
})

// Gutenberg — served from embedded catalog (no network call)
app.get('/api/gutenberg/search', (req, res) => {
  try {
    const query = req.query.query || ''
    const page = parseInt(req.query.page, 10) || 1
    const data = searchCatalog(query, page)
    res.json(data)
  } catch (err) {
    apiLog.error('gutenberg/search', 'Catalog search failed', err)
    res.status(500).json({ error: 'Gutenberg search failed', results: [] })
  }
})

// Gutenberg file proxy
app.get('/api/gutenberg/file', async (req, res) => {
  const ROUTE = 'gutenberg/file'
  try {
    const url = req.query.url
    if (!url || !assertAllowedUrl(url)) {
      apiLog.warn(ROUTE, 'Rejected disallowed URL', { url })
      res.status(400).json({ error: 'Invalid URL' }); return
    }

    // Try curl first (handles redirects and compression better)
    try {
      const { stdout } = await execFileAsync(
        'curl',
        ['-L', '--max-time', '30', '--silent', '--show-error', '--compressed', String(url)],
        { maxBuffer: 20 * 1024 * 1024 }
      )
      if (stdout && stdout.trim()) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.send(stdout); return
      }
      apiLog.warn(ROUTE, 'curl returned empty body, falling back to fetch', { url })
    } catch (curlErr) {
      apiLog.warn(ROUTE, 'curl failed, falling back to fetch', curlErr, { url })
    }

    // Fallback: native fetch
    const response = await withTimeout(url, 25000, ROUTE)
    if (!response.ok) {
      apiLog.error(ROUTE, `Upstream ${response.status}`, null, { url })
      throw new Error(`Upstream responded ${response.status}`)
    }
    const text = await response.text()
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.send(text)
  } catch (err) {
    apiLog.error(ROUTE, 'Failed to fetch book file', err, { url: req.query.url })
    res.status(500).json({ error: 'Gutenberg file fetch failed. The book may be temporarily unavailable.' })
  }
})

// Internet Archive — search
app.get('/api/ia/search', async (req, res) => {
  const ROUTE = 'ia/search'
  try {
    const query = req.query.query || 'fiction'
    const page = req.query.page || 1
    const rows = req.query.rows || 50
    const cacheKey = `ia:search:${query}:${page}:${rows}`

    const cached = cache.get(cacheKey)
    if (cached) {
      apiLog.info(ROUTE, 'Cache hit', { query, page })
      return res.json(cached)
    }

    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl=identifier,title,creator,description,date,mediatype,format&output=json&rows=${rows}&page=${page}`
    const response = await withTimeout(url, 12000, ROUTE)

    if (!response.ok) {
      apiLog.error(ROUTE, `Upstream ${response.status}`, null, { query })
      return res.status(502).json({ error: 'Internet Archive search unavailable', response: { docs: [] } })
    }

    const data = await response.json()
    cache.set(cacheKey, data, CACHE_TTL.IA_SEARCH)
    res.json(data)
  } catch (err) {
    apiLog.error(ROUTE, 'Search failed', err, { query: req.query.query })
    res.status(502).json({ error: 'Internet Archive search failed. Try again shortly.', response: { docs: [] } })
  }
})

// Internet Archive — metadata
app.get('/api/ia/metadata/:id', async (req, res) => {
  const ROUTE = 'ia/metadata'
  const id = req.params.id
  try {
    const cacheKey = `ia:meta:${id}`
    const cached = cache.get(cacheKey)
    if (cached) {
      apiLog.info(ROUTE, 'Cache hit', { id })
      return res.json(cached)
    }

    const url = `https://archive.org/metadata/${id}`
    const response = await withTimeout(url, 12000, ROUTE)

    if (!response.ok) {
      apiLog.error(ROUTE, `Upstream ${response.status}`, null, { id })
      return res.status(502).json({ error: 'Could not load item metadata', metadata: {} })
    }

    const data = await response.json()
    cache.set(cacheKey, data, CACHE_TTL.IA_META)
    res.json(data)
  } catch (err) {
    apiLog.error(ROUTE, 'Metadata fetch failed', err, { id })
    res.status(502).json({ error: 'Internet Archive metadata unavailable.', metadata: {} })
  }
})

// Audio resolve — fetch + validate chapters for a book (IA metadata → clean chapter list)
// Falls back to LibriVox search by title if no archiveId is supplied.
app.get('/api/audio/resolve', async (req, res) => {
  const ROUTE = 'audio/resolve'
  const { archiveId, title } = req.query

  if (!archiveId && !title) {
    return res.status(400).json({ error: 'archiveId or title required', chapters: [] })
  }

  const cacheKey = `audio:resolve:${archiveId || ''}:${(title || '').toLowerCase().replace(/\s+/g, '_')}`
  const cached = cache.get(cacheKey)
  if (cached) {
    apiLog.info(ROUTE, 'Cache hit', { archiveId, title })
    return res.json(cached)
  }

  // Helper: clean a filename into a readable chapter title
  const cleanTitle = (raw, index) => {
    if (!raw || typeof raw !== 'string') return `Chapter ${index + 1}`
    return raw
      .replace(/\.(mp3|m4a|ogg|opus|flac)$/i, '')
      .replace(/_/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim() || `Chapter ${index + 1}`
  }

  // Helper: extract chapters from IA metadata files array
  const extractChapters = (files, id) => {
    const audioExts = /\.(mp3|m4a|ogg|opus)$/i
    // Prefer originals; fall back to derivatives only if no originals exist
    const originals = files.filter(f => f.name && audioExts.test(f.name) && f.source === 'original')
    const pool = originals.length > 0 ? originals : files.filter(f => f.name && audioExts.test(f.name) && f.source !== 'derivative' /* include unknown source */)
    const finalPool = pool.length > 0 ? pool : files.filter(f => f.name && audioExts.test(f.name))

    // Sort by track number, then by filename numerics
    finalPool.sort((a, b) => {
      const tA = parseInt(a.track) || parseInt(a.name?.match(/(\d+)/)?.[1]) || 0
      const tB = parseInt(b.track) || parseInt(b.name?.match(/(\d+)/)?.[1]) || 0
      return tA - tB
    })

    return finalPool.map((f, idx) => ({
      id: idx,
      title: f.title ? cleanTitle(f.title, idx) : cleanTitle(f.name, idx),
      audioUrl: `https://archive.org/download/${id}/${encodeURIComponent(f.name)}`,
      duration: f.length ? parseFloat(f.length) : 0,
      format: f.format || '',
    }))
  }

  // Step 1: try the provided archiveId first
  if (archiveId) {
    try {
      const metaUrl = `https://archive.org/metadata/${archiveId}`
      const metaResp = await withTimeout(metaUrl, 12000, ROUTE)
      if (metaResp.ok) {
        const meta = await metaResp.json()
        const restricted = meta?.metadata?.['access-restricted'] === 'true' || meta?.metadata?.access_restricted === 'true'
        if (!restricted && Array.isArray(meta?.files)) {
          const chapters = extractChapters(meta.files, archiveId)
          if (chapters.length > 0) {
            const result = { chapters, archiveId, source: 'ia_metadata', total: chapters.length }
            cache.set(cacheKey, result, CACHE_TTL.AUDIO_RESOLVE)
            apiLog.info(ROUTE, `Resolved ${chapters.length} chapters from IA metadata`, { archiveId })
            return res.json(result)
          }
        }
        if (restricted) {
          apiLog.warn(ROUTE, 'Archive item is access-restricted', { archiveId })
          const result = { chapters: [], archiveId, source: 'ia_metadata', total: 0, restricted: true }
          cache.set(cacheKey, result, CACHE_TTL.AUDIO_RESOLVE)
          return res.json(result)
        }
      }
    } catch (err) {
      apiLog.warn(ROUTE, 'IA metadata fetch failed for archiveId, trying title search', { archiveId, err: err.message })
    }
  }

  // Step 2: fall back to LibriVox/IA search by title
  if (title) {
    try {
      const q = `(title:(${title}) OR creator:(${title})) AND collection:librivoxaudio AND mediatype:audio`
      const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl=identifier,title,creator&output=json&rows=5&sort[]=downloads+desc`
      const searchResp = await withTimeout(searchUrl, 10000, ROUTE)
      if (searchResp.ok) {
        const searchData = await searchResp.json()
        const docs = searchData?.response?.docs || []
        if (docs.length > 0) {
          const bestId = docs[0].identifier
          const metaUrl = `https://archive.org/metadata/${bestId}`
          const metaResp = await withTimeout(metaUrl, 12000, ROUTE)
          if (metaResp.ok) {
            const meta = await metaResp.json()
            if (Array.isArray(meta?.files)) {
              const chapters = extractChapters(meta.files, bestId)
              if (chapters.length > 0) {
                const result = { chapters, archiveId: bestId, source: 'librivox_search', total: chapters.length }
                cache.set(cacheKey, result, CACHE_TTL.AUDIO_RESOLVE)
                apiLog.info(ROUTE, `Resolved ${chapters.length} chapters via title search`, { title, foundId: bestId })
                return res.json(result)
              }
            }
          }
        }
      }
    } catch (err) {
      apiLog.error(ROUTE, 'Title fallback search failed', err, { title })
    }
  }

  // Nothing found
  const empty = { chapters: [], archiveId: archiveId || null, source: 'none', total: 0 }
  cache.set(cacheKey, empty, 2 * 60 * 1000) // cache "not found" for 2 min only
  apiLog.warn(ROUTE, 'No audio resolved', { archiveId, title })
  res.json(empty)
})

// Internet Archive — download proxy
app.get('/api/ia/download', async (req, res) => {
  const ROUTE = 'ia/download'
  try {
    const item = req.query.item
    const file = req.query.file
    if (!item || !file) {
      apiLog.warn(ROUTE, 'Missing item or file params', { item, file })
      res.status(400).json({ error: 'Missing item or file' }); return
    }

    const url = `https://archive.org/download/${item}/${file}`
    const response = await withTimeout(url, 20000, ROUTE)

    if (!response.ok) {
      apiLog.error(ROUTE, `Upstream ${response.status}`, null, { item, file })
      res.status(response.status).json({ error: 'Internet Archive download unavailable' }); return
    }

    res.setHeader('content-type', response.headers.get('content-type') || 'application/octet-stream')
    const buffer = Buffer.from(await response.arrayBuffer())
    res.send(buffer)
  } catch (err) {
    apiLog.error(ROUTE, 'Download proxy failed', err, { item: req.query.item, file: req.query.file })
    res.status(502).json({ error: 'Internet Archive download failed. The file may be temporarily unavailable.' })
  }
})

// LibriVox — routed through Internet Archive
app.get('/api/librivox/search', async (req, res) => {
  const ROUTE = 'librivox/search'
  try {
    const query = req.query.query || ''
    const page = parseInt(req.query.page, 10) || 1
    const rows = 50
    const offset = (page - 1) * rows
    const cacheKey = `librivox:${query}:${page}`

    const cached = cache.get(cacheKey)
    if (cached) {
      apiLog.info(ROUTE, 'Cache hit', { query, page })
      return res.json(cached)
    }

    let q
    if (query) {
      q = `(title:(${query}) OR creator:(${query})) AND collection:librivoxaudio`
    } else {
      q = 'collection:librivoxaudio AND mediatype:audio'
    }

    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl=identifier,title,creator,description,date,subject,downloads&output=json&rows=${rows}&start=${offset}&sort[]=downloads+desc`
    const response = await withTimeout(url, 12000, ROUTE)

    if (!response.ok) {
      apiLog.error(ROUTE, `Upstream ${response.status}`, null, { query })
      return res.status(502).json({ error: 'LibriVox search unavailable', books: [] })
    }

    const data = await response.json()
    const docs = data?.response?.docs || []

    const books = docs.map(item => ({
      id: item.identifier,
      title: item.title || 'Untitled',
      description: Array.isArray(item.description) ? item.description[0] : (item.description || ''),
      authors: [{
        first_name: '',
        last_name: Array.isArray(item.creator) ? item.creator[0] : (item.creator || 'Unknown'),
      }],
      url_librivox: `https://librivox.org/`,
      url_iarchive: `https://archive.org/details/${item.identifier}`,
      url_image: `https://archive.org/services/img/${item.identifier}`,
      copyright_year: item.date ? item.date.substring(0, 4) : null,
      archiveId: item.identifier,
    }))

    const result = { books }
    cache.set(cacheKey, result, CACHE_TTL.LIBRIVOX)
    res.json(result)
  } catch (err) {
    apiLog.error(ROUTE, 'Search failed', err, { query: req.query.query })
    res.status(502).json({ error: 'LibriVox search failed. Try again shortly.', books: [] })
  }
})

// Google Books
app.get('/api/google/books', async (req, res) => {
  const ROUTE = 'google/books'
  try {
    const query = req.query.query || 'fiction'
    const startIndex = req.query.startIndex || 0
    const filter = req.query.filter || ''
    const cacheKey = `google:${query}:${startIndex}:${filter}`

    const cached = cache.get(cacheKey)
    if (cached) {
      apiLog.info(ROUTE, 'Cache hit', { query, startIndex })
      return res.json(cached)
    }

    const apiKey = process.env.GOOGLE_BOOKS_KEY
    const keyPart = apiKey ? `&key=${apiKey}` : ''
    const filterPart = filter ? `&filter=${filter}` : ''
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=40&startIndex=${startIndex}&printType=books${filterPart}${keyPart}`

    const response = await withTimeout(url, 10000, ROUTE)

    if (!response.ok) {
      apiLog.error(ROUTE, `Upstream ${response.status}`, null, { query })
      return res.status(502).json({ error: 'Google Books unavailable', items: [], totalItems: 0 })
    }

    const data = await response.json()
    cache.set(cacheKey, data, CACHE_TTL.GOOGLE_BOOKS)
    res.json(data)
  } catch (err) {
    apiLog.error(ROUTE, 'Search failed', err, { query: req.query.query })
    res.status(502).json({ error: 'Google Books search failed. Try again shortly.', items: [], totalItems: 0 })
  }
})

// Open Library
app.get('/api/openlibrary/search', async (req, res) => {
  const ROUTE = 'openlibrary/search'
  try {
    const query = req.query.query || 'fiction'
    const page = req.query.page || 1
    const cacheKey = `openlibrary:${query}:${page}`

    const cached = cache.get(cacheKey)
    if (cached) {
      apiLog.info(ROUTE, 'Cache hit', { query, page })
      return res.json(cached)
    }

    const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&has_fulltext=true&public_scan_b=true&limit=50&page=${page}`
    const response = await withTimeout(url, 12000, ROUTE)

    if (!response.ok) {
      apiLog.error(ROUTE, `Upstream ${response.status}`, null, { query })
      return res.status(502).json({ error: 'Open Library unavailable', docs: [], numFound: 0 })
    }

    const data = await response.json()
    cache.set(cacheKey, data, CACHE_TTL.OPEN_LIBRARY)
    res.json(data)
  } catch (err) {
    apiLog.error(ROUTE, 'Search failed', err, { query: req.query.query })
    res.status(502).json({ error: 'Open Library search failed. Try again shortly.', docs: [], numFound: 0 })
  }
})

// Movie trailers
app.get('/api/movies/trailers', async (req, res) => {
  const ROUTE = 'movies/trailers'
  try {
    const rawTitles = req.query.titles
    const titles = typeof rawTitles === 'string' && rawTitles.trim()
      ? rawTitles.split('|').map(item => item.trim()).filter(Boolean)
      : DEFAULT_ADAPTATION_TITLES

    const selectedTitles = titles.slice(0, 12)
    const cacheKey = `trailers:${selectedTitles.join('|')}`

    const cached = cache.get(cacheKey)
    if (cached) {
      apiLog.info(ROUTE, 'Cache hit', { count: selectedTitles.length })
      return res.json(cached)
    }

    // Process in small batches to avoid overwhelming YouTube's search
    const BATCH = 4
    const allResults = []
    for (let i = 0; i < selectedTitles.length; i += BATCH) {
      const batch = selectedTitles.slice(i, i + BATCH)
      const batchResults = await Promise.all(batch.map(async (title) => {
        try {
          const queryTitle = normalizeTitleForSearch(title).split(/[:;]/)[0].trim() || title

          // Search YouTube for an official trailer — no API key required
          let ytVideo = null
          try {
            const ytResult = await Promise.race([
              yts({ query: `${queryTitle} official trailer`, pages: 1 }),
              new Promise((_, rej) => setTimeout(() => rej(new Error('yt-search timeout')), 10000)),
            ])
            const videos = Array.isArray(ytResult?.videos) ? ytResult.videos : []
            // Prefer a result with "trailer" in the title
            ytVideo =
              videos.find(v => /trailer/i.test(v.title) && v.videoId) ||
              videos.find(v => v.videoId) ||
              null
          } catch (ytErr) {
            apiLog.warn(ROUTE, `YouTube search failed for "${title}": ${ytErr.message}`)
            return null
          }

          if (!ytVideo?.videoId) {
            apiLog.warn(ROUTE, `No YouTube result for "${title}"`)
            return null
          }

          apiLog.info(ROUTE, `YouTube matched "${title}" → "${ytVideo.title}"`)

          const ytThumb = `https://img.youtube.com/vi/${ytVideo.videoId}/hqdefault.jpg`
          const trailerUrl = `https://www.youtube.com/watch?v=${ytVideo.videoId}`

          // Extract year from video title if present
          const yearMatch = (ytVideo.title || '').match(/\b(19[3-9]\d|20[012]\d)\b/)
          const year = yearMatch ? yearMatch[0] : 'N/A'

          // Enrich with OMDb poster/overview/rating (optional)
          let omdbPoster = '', omdbOverview = '', omdbRating = ''
          if (OMDB_KEY) {
            try {
              const omdbUrl = `https://www.omdbapi.com/?apikey=${OMDB_KEY}&t=${encodeURIComponent(queryTitle)}${year !== 'N/A' ? `&y=${year}` : ''}`
              const omdbResponse = await withTimeout(omdbUrl, 8000, ROUTE)
              if (omdbResponse.ok) {
                const omdbData = await omdbResponse.json()
                if (omdbData?.Response === 'True') {
                  omdbPoster = typeof omdbData.Poster === 'string' && omdbData.Poster !== 'N/A' ? omdbData.Poster : ''
                  omdbOverview = typeof omdbData.Plot === 'string' && omdbData.Plot !== 'N/A' ? omdbData.Plot : ''
                  omdbRating = typeof omdbData.imdbRating === 'string' && omdbData.imdbRating !== 'N/A' ? omdbData.imdbRating : ''
                } else {
                  apiLog.warn(ROUTE, `OMDB no result for "${queryTitle}"`, { reason: omdbData?.Error })
                }
              }
            } catch (omdbErr) {
              apiLog.warn(ROUTE, `OMDB lookup failed for "${queryTitle}"`, omdbErr)
            }
          }

          const image = omdbPoster || ytThumb || 'https://placehold.co/400x600/1a1c23/f3b327?text=Classic+Film'

          return {
            id: `yt-${ytVideo.videoId}`,
            title: queryTitle,
            image,
            url: trailerUrl,
            hasTrailer: true,
            year,
            overview: omdbOverview || 'A classic public-domain adaptation.',
            rating: omdbRating,
            confidence: 80,
            sourceBookTitle: title,
          }
        } catch (innerErr) {
          apiLog.error(ROUTE, `Unhandled error for title "${title}"`, innerErr)
          return null
        }
      }))
      allResults.push(...batchResults)
    }
    const results = allResults

    const filtered = results.filter(Boolean)
    apiLog.info(ROUTE, `Resolved ${filtered.length}/${selectedTitles.length} trailers`)

    const result = { results: filtered }
    if (filtered.length > 0) cache.set(cacheKey, result, CACHE_TTL.MOVIE_TRAIL)
    res.json(result)
  } catch (err) {
    apiLog.error(ROUTE, 'Top-level failure', err)
    res.status(502).json({ error: 'Movie trailers fetch failed. Try again shortly.', results: [] })
  }
})

// ─── Unified Search ────────────────────────────────────────────────────────

const normalizeTitle = (title) =>
  String(title || '')
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const pickTextLink = (formats = {}) => {
  const entries = Object.entries(formats).filter(([, url]) => typeof url === 'string' && url)
  const isCompressed = (mime, url) => /zip|gzip|x-bzip2|x-rar/i.test(mime) || /\.(zip|gz|bz2|rar)(\?|$)/i.test(url)
  const isPlain = (mime) => /text\/plain/i.test(mime)
  const isHtml = (mime) => /text\/html/i.test(mime)
  const candidates = entries
    .map(([mime, url]) => ({ mime: mime.toLowerCase(), url: url.replace(/^http:\/\//i, 'https://') }))
    .filter(({ mime, url }) => !isCompressed(mime, url))
  return (
    candidates.find(({ mime }) => isPlain(mime) && /utf-8/i.test(mime))?.url ||
    candidates.find(({ mime }) => isPlain(mime))?.url ||
    candidates.find(({ mime }) => isHtml(mime) && /utf-8/i.test(mime))?.url ||
    candidates.find(({ mime }) => isHtml(mime))?.url ||
    null
  )
}

const scoreBook = (book) => {
  let s = 0
  if (book.hasText && book.textLink) s += 40
  else if (book.hasText) s += 20
  if (book.hasAudio) s += 25
  if (book.hasCover) s += 15
  if (book.source === 'Project Gutenberg') s += 10
  if (book.source === 'Open Library') s += 5
  return s
}

app.get('/api/search/unified', async (req, res) => {
  const ROUTE = 'search/unified'
  const query = (req.query.query || 'fiction').trim()
  const page = parseInt(req.query.page, 10) || 1
  const cacheKey = `unified:${query}:${page}`

  const cached = cache.get(cacheKey)
  if (cached) {
    apiLog.info(ROUTE, 'Cache hit', { query, page })
    return res.json(cached)
  }

  const sourceStatus = {}

  // ── 1. Gutenberg — local catalog, instant ─────────────────────────────────
  let gutenbergBooks = []
  try {
    const data = searchCatalog(query, page)
    gutenbergBooks = (data.results || []).map(item => {
      const textLink = pickTextLink(item.formats || {})
      const cover = item.formats?.['image/jpeg'] || null
      const validCover = cover && !cover.includes('placeholder') ? cover : null
      return {
        id: `gutenberg-${item.id}`,
        title: item.title,
        authors: item.authors?.map(a => a.name).join(', ') || 'Unknown Author',
        image: validCover,
        description: 'A classic work from Project Gutenberg\'s public domain collection.',
        source: 'Project Gutenberg',
        hasText: Boolean(textLink),
        hasAudio: false,
        hasCover: Boolean(validCover),
        textLink: textLink || null,
        previewLink: `https://www.gutenberg.org/ebooks/${item.id}`,
        infoLink: `https://www.gutenberg.org/ebooks/${item.id}`,
        publishedDate: 'Classic',
        pageCount: 0,
        isFullAvailable: Boolean(textLink),
        hasPreview: true,
        tags: ['classic', 'full'],
      }
    }).filter(b => b.hasText)
    sourceStatus.gutenberg = { ok: true, count: gutenbergBooks.length }
    apiLog.info(ROUTE, `Gutenberg: ${gutenbergBooks.length}`, { query })
  } catch (err) {
    apiLog.error(ROUTE, 'Gutenberg catalog error', err)
    sourceStatus.gutenberg = { ok: false, error: err.message }
  }

  // ── 2–5. External sources — all in parallel ────────────────────────────────
  const [iaResult, librivoxResult, googleResult, olResult] = await Promise.allSettled([
    // Internet Archive
    (async () => {
      const q = query
        ? `(title:(${query}) OR creator:(${query})) AND collection:(librivox OR audio_bookspoetry) AND access-restricted:false`
        : 'collection:librivoxaudio AND mediatype:audio'
      const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl=identifier,title,creator,description,date,mediatype,format&output=json&rows=30&page=${page}`
      const r = await withTimeout(url, 12000, ROUTE)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })(),
    // LibriVox (via IA)
    (async () => {
      const q = query
        ? `(title:(${query}) OR creator:(${query})) AND collection:librivoxaudio`
        : 'collection:librivoxaudio AND mediatype:audio'
      const offset = (page - 1) * 30
      const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl=identifier,title,creator,description,date,downloads&output=json&rows=30&start=${offset}&sort[]=downloads+desc`
      const r = await withTimeout(url, 12000, ROUTE)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })(),
    // Google Books (free ebooks only)
    (async () => {
      const startIndex = (page - 1) * 20
      const apiKey = process.env.GOOGLE_BOOKS_KEY
      const keyPart = apiKey ? `&key=${apiKey}` : ''
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20&startIndex=${startIndex}&printType=books&filter=free-ebooks${keyPart}`
      const r = await withTimeout(url, 10000, ROUTE)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })(),
    // Open Library (public scan only)
    (async () => {
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&has_fulltext=true&public_scan_b=true&limit=30&page=${page}`
      const r = await withTimeout(url, 12000, ROUTE)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })(),
  ])

  // Process IA
  let iaBooks = []
  if (iaResult.status === 'fulfilled') {
    const docs = iaResult.value?.response?.docs || []
    iaBooks = docs.filter(item => item.title).map(item => ({
      id: `archive-${item.identifier}`,
      title: item.title,
      authors: Array.isArray(item.creator) ? item.creator.join(', ') : (item.creator || 'Unknown Author'),
      image: `https://archive.org/services/img/${item.identifier}`,
      description: Array.isArray(item.description) ? item.description[0] : (item.description || 'Audiobook from Internet Archive.'),
      source: 'Internet Archive',
      hasText: false, hasAudio: true, hasCover: true,
      textLink: null,
      previewLink: `https://archive.org/embed/${item.identifier}`,
      infoLink: `https://archive.org/details/${item.identifier}`,
      publishedDate: item.date || 'Unknown',
      pageCount: 0, isFullAvailable: true, hasPreview: true,
      tags: ['full', 'audio'],
      archiveId: item.identifier,
    }))
    sourceStatus.internetArchive = { ok: true, count: iaBooks.length }
    apiLog.info(ROUTE, `Internet Archive: ${iaBooks.length}`, { query })
  } else {
    apiLog.error(ROUTE, 'Internet Archive failed', iaResult.reason)
    sourceStatus.internetArchive = { ok: false, error: iaResult.reason?.message }
  }

  // Process LibriVox
  let librivoxBooks = []
  if (librivoxResult.status === 'fulfilled') {
    const docs = librivoxResult.value?.response?.docs || []
    librivoxBooks = docs.filter(item => item.title).map(item => ({
      id: `librivox-${item.identifier}`,
      title: item.title,
      authors: Array.isArray(item.creator) ? item.creator[0] : (item.creator || 'Unknown Author'),
      image: `https://archive.org/services/img/${item.identifier}`,
      description: Array.isArray(item.description) ? item.description[0] : (item.description || 'Audiobook from LibriVox.'),
      source: 'LibriVox',
      hasText: false, hasAudio: true, hasCover: true,
      textLink: null,
      previewLink: `https://archive.org/embed/${item.identifier}`,
      infoLink: `https://archive.org/details/${item.identifier}`,
      publishedDate: item.date ? String(item.date).substring(0, 4) : 'Unknown',
      pageCount: 0, isFullAvailable: true, hasPreview: true,
      tags: ['full', 'audio'],
      archiveId: item.identifier,
    }))
    sourceStatus.librivox = { ok: true, count: librivoxBooks.length }
    apiLog.info(ROUTE, `LibriVox: ${librivoxBooks.length}`, { query })
  } else {
    apiLog.error(ROUTE, 'LibriVox failed', librivoxResult.reason)
    sourceStatus.librivox = { ok: false, error: librivoxResult.reason?.message }
  }

  // Process Google Books
  let googleBooks = []
  if (googleResult.status === 'fulfilled') {
    const items = googleResult.value?.items || []
    googleBooks = items
      .filter(item => {
        if (!item.volumeInfo?.title) return false
        const a = item.accessInfo || {}
        return a.publicDomain === true || a.viewability === 'ALL_PAGES' ||
               a.accessViewStatus === 'FULL_PUBLIC_DOMAIN' ||
               a.epub?.isAvailable || a.pdf?.isAvailable
      })
      .map(item => {
        const imgLinks = item.volumeInfo.imageLinks
        const rawImg = imgLinks?.thumbnail || imgLinks?.smallThumbnail || null
        const image = rawImg ? rawImg.replace(/^http:\/\//i, 'https://') : null
        return {
          id: `google-${item.id}`,
          title: item.volumeInfo.title,
          authors: item.volumeInfo.authors?.join(', ') || 'Unknown Author',
          image,
          description: typeof item.volumeInfo.description === 'string' ? item.volumeInfo.description : '',
          source: 'Google Books',
          hasText: true, hasAudio: false,
          hasCover: Boolean(image),
          textLink: null,
          previewLink: (item.accessInfo?.webReaderLink || item.volumeInfo.previewLink || '').replace(/^http:\/\//i, 'https://'),
          infoLink: (item.volumeInfo.infoLink || '').replace(/^http:\/\//i, 'https://'),
          publishedDate: item.volumeInfo.publishedDate || 'Unknown',
          pageCount: item.volumeInfo.pageCount || 0,
          isFullAvailable: true, hasPreview: true,
          tags: ['full', 'free'],
          googleId: item.id,
        }
      })
    sourceStatus.googleBooks = { ok: true, count: googleBooks.length }
    apiLog.info(ROUTE, `Google Books: ${googleBooks.length}`, { query })
  } else {
    apiLog.error(ROUTE, 'Google Books failed', googleResult.reason)
    sourceStatus.googleBooks = { ok: false, error: googleResult.reason?.message }
  }

  // Process Open Library
  let olBooks = []
  if (olResult.status === 'fulfilled') {
    const docs = olResult.value?.docs || []
    olBooks = docs.filter(item => item.has_fulltext && item.public_scan_b && item.title).map(item => {
      const image = item.cover_i ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg` : null
      return {
        id: `openlibrary-${String(item.key || item.title).replace(/[^a-z0-9]/gi, '_')}`,
        title: item.title,
        authors: item.author_name?.join(', ') || 'Unknown Author',
        image,
        description: `Published ${item.first_publish_year || 'unknown year'}. Available in Open Library.`,
        source: 'Open Library',
        hasText: true, hasAudio: false,
        hasCover: Boolean(item.cover_i),
        textLink: null,
        previewLink: `https://openlibrary.org${item.key}`,
        infoLink: `https://openlibrary.org${item.key}`,
        publishedDate: item.first_publish_year || 'Unknown',
        pageCount: item.number_of_pages_median || 0,
        isFullAvailable: true, hasPreview: true,
        tags: ['full', 'public-domain'],
      }
    })
    sourceStatus.openLibrary = { ok: true, count: olBooks.length }
    apiLog.info(ROUTE, `Open Library: ${olBooks.length}`, { query })
  } else {
    apiLog.error(ROUTE, 'Open Library failed', olResult.reason)
    sourceStatus.openLibrary = { ok: false, error: olResult.reason?.message }
  }

  // ── Merge, deduplicate, rank ───────────────────────────────────────────────
  // Priority order: Gutenberg first (best text quality), then others
  const allBooks = [...gutenbergBooks, ...googleBooks, ...olBooks, ...iaBooks, ...librivoxBooks]

  const seen = new Map()
  for (const book of allBooks) {
    const key = normalizeTitle(book.title)
    if (!key) continue
    if (!seen.has(key)) {
      seen.set(key, { ...book })
    } else {
      const existing = seen.get(key)
      const incoming = { ...book }
      // Enrich existing with audio availability from duplicates
      if (incoming.hasAudio && !existing.hasAudio) {
        existing.hasAudio = true
        existing.archiveId = existing.archiveId || incoming.archiveId
        existing.tags = [...new Set([...(existing.tags || []), 'audio'])]
      }
      // Replace if incoming scores higher
      if (scoreBook(incoming) > scoreBook(existing)) {
        // Preserve audio enrichment
        if (existing.hasAudio) { incoming.hasAudio = true; incoming.archiveId = incoming.archiveId || existing.archiveId }
        seen.set(key, incoming)
      }
    }
  }

  const uniqueBooks = Array.from(seen.values())
  uniqueBooks.sort((a, b) => {
    const diff = scoreBook(b) - scoreBook(a)
    if (diff !== 0) return diff
    if (b.hasCover !== a.hasCover) return b.hasCover ? 1 : -1
    return 0
  })

  apiLog.info(ROUTE, `Result: ${uniqueBooks.length} unique from ${allBooks.length} total`, { query, page })

  const result = { query, page, total: uniqueBooks.length, books: uniqueBooks, sourceStatus }
  if (uniqueBooks.length > 0) cache.set(cacheKey, result, CACHE_TTL.IA_SEARCH)
  res.json(result)
})

// ─── Database Endpoints ────────────────────────────────────────────────────

const loadBookmarksForDevice = async (deviceId) => {
  if (databaseAvailable && pool) {
    try {
      const result = await pool.query(
        'SELECT * FROM bookmarks WHERE device_id = $1 ORDER BY created_at DESC',
        [deviceId]
      )
      return result.rows
    } catch (err) {
      useMemoryFallback(err, 'Get bookmarks error')
    }
  }
  return Array.from(getDeviceStore(bookmarksStore, deviceId).values())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

const saveBookmarkForDevice = async ({ device_id, book_id, title, author, image, source }) => {
  if (databaseAvailable && pool) {
    try {
      await pool.query(
        `INSERT INTO bookmarks (device_id, book_id, title, author, image, source)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (device_id, book_id) DO NOTHING`,
        [device_id, book_id, title, author || '', image || '', source || '']
      )
      return
    } catch (err) {
      useMemoryFallback(err, 'Add bookmark error')
    }
  }
  const deviceStore = getDeviceStore(bookmarksStore, device_id)
  const key = String(book_id)
  if (!deviceStore.has(key)) {
    deviceStore.set(key, {
      id: key, device_id, book_id: key, title,
      author: author || '', image: image || '', source: source || '',
      created_at: new Date().toISOString(),
    })
  }
}

const deleteBookmarkForDevice = async (deviceId, bookId) => {
  if (databaseAvailable && pool) {
    try {
      await pool.query('DELETE FROM bookmarks WHERE device_id = $1 AND book_id = $2', [deviceId, bookId])
      return
    } catch (err) {
      useMemoryFallback(err, 'Delete bookmark error')
    }
  }
  getDeviceStore(bookmarksStore, deviceId).delete(String(bookId))
}

const loadProgressForBook = async (deviceId, bookId) => {
  if (databaseAvailable && pool) {
    try {
      const result = await pool.query(
        'SELECT * FROM reading_progress WHERE device_id = $1 AND book_id = $2',
        [deviceId, bookId]
      )
      return result.rows[0] || null
    } catch (err) {
      useMemoryFallback(err, 'Get progress error')
    }
  }
  return getDeviceStore(progressStore, deviceId).get(String(bookId)) || null
}

const saveProgressForBook = async ({ device_id, book_id, title, chapter, position }) => {
  if (databaseAvailable && pool) {
    try {
      await pool.query(
        `INSERT INTO reading_progress (device_id, book_id, title, chapter, position)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (device_id, book_id) DO UPDATE
         SET chapter = EXCLUDED.chapter, position = EXCLUDED.position,
             title = EXCLUDED.title, updated_at = NOW()`,
        [device_id, book_id, title || '', chapter || 0, position || 0]
      )
      return
    } catch (err) {
      useMemoryFallback(err, 'Save progress error')
    }
  }
  const deviceStore = getDeviceStore(progressStore, device_id)
  const key = String(book_id)
  deviceStore.set(key, {
    id: key, device_id, book_id: key, title: title || '',
    chapter: chapter || 0, position: position || 0,
    updated_at: new Date().toISOString(),
  })
}

const loadAllProgressForDevice = async (deviceId) => {
  if (databaseAvailable && pool) {
    try {
      const result = await pool.query(
        'SELECT * FROM reading_progress WHERE device_id = $1 ORDER BY updated_at DESC',
        [deviceId]
      )
      return result.rows
    } catch (err) {
      useMemoryFallback(err, 'Get all progress error')
    }
  }
  return Array.from(getDeviceStore(progressStore, deviceId).values())
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
}

// GET bookmarks for a device
app.get('/api/bookmarks', async (req, res) => {
  const { device_id } = req.query
  if (!device_id) return res.status(400).json({ error: 'device_id required' })
  try {
    const bookmarks = await loadBookmarksForDevice(device_id)
    res.json({ bookmarks })
  } catch (err) {
    apiLog.error('bookmarks/get', 'Failed to fetch bookmarks', err, { device_id })
    res.status(500).json({ error: 'Failed to fetch bookmarks' })
  }
})

// POST add bookmark
app.post('/api/bookmarks', async (req, res) => {
  const { device_id, book_id, title, author, image, source } = req.body
  if (!device_id || !book_id || !title) return res.status(400).json({ error: 'device_id, book_id, title required' })
  try {
    await saveBookmarkForDevice({ device_id, book_id, title, author, image, source })
    res.json({ success: true })
  } catch (err) {
    apiLog.error('bookmarks/add', 'Failed to save bookmark', err, { device_id, book_id })
    res.status(500).json({ error: 'Failed to add bookmark' })
  }
})

// DELETE remove bookmark
app.delete('/api/bookmarks', async (req, res) => {
  const { device_id, book_id } = req.query
  if (!device_id || !book_id) return res.status(400).json({ error: 'device_id, book_id required' })
  try {
    await deleteBookmarkForDevice(device_id, book_id)
    res.json({ success: true })
  } catch (err) {
    apiLog.error('bookmarks/delete', 'Failed to delete bookmark', err, { device_id, book_id })
    res.status(500).json({ error: 'Failed to delete bookmark' })
  }
})

// GET reading progress
app.get('/api/progress', async (req, res) => {
  const { device_id, book_id } = req.query
  if (!device_id || !book_id) return res.status(400).json({ error: 'device_id, book_id required' })
  try {
    const progress = await loadProgressForBook(device_id, book_id)
    res.json({ progress })
  } catch (err) {
    apiLog.error('progress/get', 'Failed to fetch progress', err, { device_id, book_id })
    res.status(500).json({ error: 'Failed to fetch progress' })
  }
})

// PUT save reading progress
app.put('/api/progress', async (req, res) => {
  const { device_id, book_id, title, chapter, position } = req.body
  if (!device_id || !book_id) return res.status(400).json({ error: 'device_id, book_id required' })
  try {
    await saveProgressForBook({ device_id, book_id, title, chapter, position })
    res.json({ success: true })
  } catch (err) {
    apiLog.error('progress/save', 'Failed to save progress', err, { device_id, book_id })
    res.status(500).json({ error: 'Failed to save progress' })
  }
})

// GET all reading progress for a device
app.get('/api/progress/all', async (req, res) => {
  const { device_id } = req.query
  if (!device_id) return res.status(400).json({ error: 'device_id required' })
  try {
    const progress = await loadAllProgressForDevice(device_id)
    res.json({ progress })
  } catch (err) {
    apiLog.error('progress/all', 'Failed to fetch all progress', err, { device_id })
    res.status(500).json({ error: 'Failed to fetch progress' })
  }
})

// ─── SPA Catch-all (production only, must be after all API routes) ──────────
if (IS_PROD) {
  app.get('*', (_req, res) => res.sendFile(path.join(DIST_PATH, 'index.html')))
}

// ─── Server Start ──────────────────────────────────────────────────────────
const server = app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`))

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use.`)
    process.exit(1)
  } else {
    console.error('Server error:', err)
    process.exit(1)
  }
})
