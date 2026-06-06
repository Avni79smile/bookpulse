import { spawn } from 'node:child_process'
import process from 'node:process'

const api = spawn('node', ['server/index.js'], {
  stdio: 'inherit',
  env: process.env,
})

const client = spawn('npx', ['vite'], {
  stdio: 'inherit',
  env: process.env,
})

const cleanup = () => {
  if (!api.killed) api.kill()
  if (!client.killed) client.kill()
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

api.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`API server exited with code ${code}`)
    cleanup()
    process.exit(code)
  }
})

client.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Vite client exited with code ${code}`)
    cleanup()
    process.exit(code)
  }
})
