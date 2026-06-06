import { execSync, spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const concurrentlyBin = resolve(__dirname, '..', 'node_modules', 'concurrently', 'dist', 'bin', 'concurrently.js')

const portsToClear = [5000, process.env.PORT || 5175]

const killPortOnWindows = (targetPort) => {
  try {
    const output = execSync(`netstat -ano | findstr :${targetPort}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
    const pids = new Set()

    for (const line of output.split(/\r?\n/)) {
      const match = line.match(/\s+(\d+)\s*$/)
      if (match) pids.add(match[1])
    }

    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
      } catch {
        // Ignore processes that already exited or cannot be killed.
      }
    }
  } catch {
    // No existing listener found for this port.
  }
}

if (process.platform === 'win32') {
  for (const port of portsToClear) {
    killPortOnWindows(port)
  }
}

const child = spawn(process.execPath, [
  concurrentlyBin,
  '--names',
  'client,api',
  '--prefix-colors',
  'cyan,magenta',
  '--restart-tries',
  '20',
  '--restart-after',
  '2000',
  'npm run dev:client',
  'npm run server:clean',
], {
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})

process.on('SIGINT', () => {
  if (!child.killed) child.kill('SIGINT')
})

process.on('SIGTERM', () => {
  if (!child.killed) child.kill('SIGTERM')
})
