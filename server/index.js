import express from 'express'
import cors from 'cors'
import dns from 'node:dns'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'

dns.setDefaultResultOrder('ipv4first')

const execFileAsync = promisify(execFile)
const { Pool } = pg

const app = express()
const PORT = process.env.PORT || 5175
const TMDB_API_KEY = process.env.TMDB_API_KEY || '7172c9a75fb01a4fa514de0d57a2f4c7'
const OMDB_KEY = process.env.OMDB_KEY || '8f081069'
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

app.use(express.json())

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
  if (!pool) {
    return
  }

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
  for (const word of sourceWords) { if (candidateWords.has(word)) overlap += 1 }
  return overlap
}

process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason))
process.on('uncaughtException', (error) => console.error('Uncaught exception:', error))

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
    if (hostname.startsWith('ia') && hostname.endsWith('.us.archive.org')) return true
    const allowed = [
      'www.gutenberg.org', 'gutenberg.org', 'gutendex.com',
      'archive.org', 'www.archive.org',
    ]
    return allowed.includes(hostname)
  } catch { return false }
}

// ─── Routes ────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get('/', (_req, res) => res.status(200).send('BookPulse API running. Open /api/health for status.'))

// Gutenberg — now served from embedded catalog (no external network call)
app.get('/api/gutenberg/search', (req, res) => {
  try {
    const query = req.query.query || ''
    const page = parseInt(req.query.page, 10) || 1
    const data = searchCatalog(query, page)
    res.json(data)
  } catch (err) {
    console.error('Gutenberg search error:', err.message)
    res.status(500).json({ error: 'Gutenberg search failed', results: [] })
  }
})

// Gutenberg file proxy (unchanged — gutenberg.org files work fine)
app.get('/api/gutenberg/file', async (req, res) => {
  try {
    const url = req.query.url
    if (!url || !assertAllowedUrl(url)) {
      res.status(400).json({ error: 'Invalid URL' }); return
    }
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
    } catch (curlErr) {
      console.error('[gutenberg/file] curl failed:', curlErr.message)
    }
    const response = await withTimeout(url, 25000)
    if (!response.ok) throw new Error(`Upstream responded ${response.status}`)
    const text = await response.text()
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.send(text)
  } catch (e) {
    console.error('[gutenberg/file] failed:', e.message)
    res.status(500).json({ error: 'Gutenberg file failed' })
  }
})

// Internet Archive — search (audiobooks + texts)
app.get('/api/ia/search', async (req, res) => {
  try {
    const query = req.query.query || 'fiction'
    const page = req.query.page || 1
    const rows = req.query.rows || 50
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl=identifier,title,creator,description,date,mediatype,format&output=json&rows=${rows}&page=${page}`
    const response = await withTimeout(url)
    const data = await response.json()
    res.json(data)
  } catch { res.status(500).json({ error: 'IA search failed' }) }
})

app.get('/api/ia/metadata/:id', async (req, res) => {
  try {
    const url = `https://archive.org/metadata/${req.params.id}`
    const response = await withTimeout(url)
    const data = await response.json()
    res.json(data)
  } catch { res.status(500).json({ error: 'IA metadata failed' }) }
})

app.get('/api/ia/download', async (req, res) => {
  try {
    const item = req.query.item
    const file = req.query.file
    if (!item || !file) { res.status(400).json({ error: 'Missing item or file' }); return }
    const url = `https://archive.org/download/${item}/${file}`
    const response = await withTimeout(url)
    if (!response.ok) { res.status(response.status).json({ error: 'IA download upstream error' }); return }
    res.setHeader('content-type', response.headers.get('content-type') || 'application/octet-stream')
    const buffer = Buffer.from(await response.arrayBuffer())
    res.send(buffer)
  } catch { res.status(500).json({ error: 'IA download failed' }) }
})

// LibriVox — routed through Internet Archive LibriVox collection
app.get('/api/librivox/search', async (req, res) => {
  try {
    const query = req.query.query || ''
    const page = parseInt(req.query.page, 10) || 1
    const rows = 50
    const offset = (page - 1) * rows

    let q
    if (query) {
      q = `(title:(${query}) OR creator:(${query})) AND collection:librivoxaudio`
    } else {
      q = 'collection:librivoxaudio AND mediatype:audio'
    }

    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl=identifier,title,creator,description,date,subject,downloads&output=json&rows=${rows}&start=${offset}&sort[]=downloads+desc`
    const response = await withTimeout(url, 12000)
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

    res.json({ books })
  } catch (err) {
    console.error('LibriVox/IA search failed:', err.message)
    res.status(500).json({ error: 'LibriVox search failed', books: [] })
  }
})

// Google Books
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
  } catch { res.status(500).json({ error: 'Google Books failed' }) }
})

// Open Library
app.get('/api/openlibrary/search', async (req, res) => {
  try {
    const query = req.query.query || 'fiction'
    const page = req.query.page || 1
    const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&has_fulltext=true&public_scan_b=true&limit=50&page=${page}`
    const response = await withTimeout(url)
    const data = await response.json()
    res.json(data)
  } catch { res.status(500).json({ error: 'Open Library search failed' }) }
})

// Movie trailers
app.get('/api/movies/trailers', async (req, res) => {
  try {
    const titles = typeof req.query.titles === 'string' && req.query.titles.trim()
      ? req.query.titles.split(',').map(item => item.trim()).filter(Boolean)
      : DEFAULT_ADAPTATION_TITLES

    const selectedTitles = titles.slice(0, 12)
    const results = await Promise.all(selectedTitles.map(async (title) => {
      try {
        const queryTitle = normalizeTitleForSearch(title).split(':')[0].trim() || title
        const tmdbSearchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(queryTitle)}&include_adult=false`
        const searchResponse = await withTimeout(tmdbSearchUrl, 12000)
        const searchData = await searchResponse.json()
        const movie = Array.isArray(searchData?.results)
          ? [...searchData.results].filter(item => item?.title).sort((a, b) => scoreMovieMatch(title, b) - scoreMovieMatch(title, a))[0]
          : null

        if (!movie?.id) return null

        const videosUrl = `https://api.themoviedb.org/3/movie/${movie.id}/videos?api_key=${TMDB_API_KEY}`
        const videosResponse = await withTimeout(videosUrl, 12000)
        const videosData = await videosResponse.json()
        const trailer = Array.isArray(videosData?.results)
          ? videosData.results.find(v => v.site === 'YouTube' && v.type === 'Trailer') || videosData.results.find(v => v.site === 'YouTube')
          : null

        const releaseYear = typeof movie.release_date === 'string' ? movie.release_date.slice(0, 4) : ''
        const fallbackPoster = movie.backdrop_path
          ? `https://image.tmdb.org/t/p/w780${movie.backdrop_path}`
          : movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
          : trailer?.key ? `https://img.youtube.com/vi/${trailer.key}/hqdefault.jpg`
          : 'https://via.placeholder.com/640x360?text=Classic+Film'

        let omdbOverview = '', omdbPoster = ''
        if (OMDB_KEY) {
          try {
            const omdbUrl = `https://www.omdbapi.com/?apikey=${OMDB_KEY}&t=${encodeURIComponent(movie.title)}${releaseYear ? `&y=${releaseYear}` : ''}`
            const omdbResponse = await withTimeout(omdbUrl, 10000)
            const omdbData = await omdbResponse.json()
            if (omdbData?.Response === 'True') {
              omdbOverview = typeof omdbData.Plot === 'string' ? omdbData.Plot : ''
              omdbPoster = typeof omdbData.Poster === 'string' && omdbData.Poster !== 'N/A' ? omdbData.Poster : ''
            }
          } catch (omdbErr) { console.warn('OMDB lookup failed:', omdbErr?.message) }
        }

        return {
          id: `tmdb-${movie.id}`,
          title: movie.title,
          image: omdbPoster || fallbackPoster,
          url: trailer?.key ? `https://www.youtube.com/watch?v=${trailer.key}` : `https://www.themoviedb.org/movie/${movie.id}`,
          year: releaseYear || 'N/A',
          overview: omdbOverview || movie.overview || 'Classic public-domain adaptation.',
          sourceBookTitle: title,
        }
      } catch { return null }
    }))

    res.json({ results: results.filter(Boolean) })
  } catch (err) {
    console.error('Movie trailers fetch failed:', err)
    res.status(500).json({ error: 'Movie trailers fetch failed' })
  }
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
      id: key,
      device_id,
      book_id: key,
      title,
      author: author || '',
      image: image || '',
      source: source || '',
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
    id: key,
    device_id,
    book_id: key,
    title: title || '',
    chapter: chapter || 0,
    position: position || 0,
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
    console.error('Get bookmarks error:', err.message)
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
    console.error('Add bookmark error:', err.message)
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
    console.error('Delete bookmark error:', err.message)
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
    console.error('Get progress error:', err.message)
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
    console.error('Save progress error:', err.message)
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
    console.error('Get all progress error:', err.message)
    res.status(500).json({ error: 'Failed to fetch progress' })
  }
})

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
