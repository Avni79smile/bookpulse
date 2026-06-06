import { execSync, spawn } from 'node:child_process'
import process from 'node:process'

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

const child = spawn(process.execPath, ['server/index.js'], {
  stdio: 'inherit',
  env: process.env,
})

const shutdown = (signal) => {
  if (!child.killed) child.kill(signal)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
