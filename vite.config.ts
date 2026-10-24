import vue from '@vitejs/plugin-vue'
import crypto from 'node:crypto'
import fs from 'node:fs'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import {
  createVariant, DATA_DIR, InvalidResume, isName, listResumes, resolveResume, ROOT, save, VARIANTS_DIR,
} from './src/core/index.ts'

const etagOf = (text: string) => `"${crypto.createHash('sha1').update(text).digest('hex')}"`

// Dev-only file API: the editor reads and writes data/*.json, the same files
// agents edit, and hears about changes made on disk through server-sent events.
// Writes carry If-Match, so an edit made on disk meanwhile is never overwritten.
function resumeFiles(): Plugin {
  const clients = new Set<ServerResponse>()
  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
    res.end(JSON.stringify(body))
  }
  const readBody = (req: NodeJS.ReadableStream) =>
    new Promise<string>((resolve, reject) => {
      let s = ''
      req.on('data', c => (s += c))
      req.on('end', () => resolve(s))
      req.on('error', reject)
    })

  return {
    name: 'resume-files',
    apply: 'serve',
    configureServer(server) {
      fs.mkdirSync(VARIANTS_DIR, { recursive: true })
      // The event carries the file's ETag, so the editor can skip re-reading its own saves.
      const notify = (file: string) => {
        if (!file.endsWith('.json')) return
        const name = path.basename(file, '.json')
        let etag = ''
        try {
          etag = etagOf(fs.readFileSync(file, 'utf8'))
        } catch {}
        for (const c of clients) c.write(`data: ${JSON.stringify({ name, etag })}\n\n`)
      }
      server.watcher.add(DATA_DIR)
      server.watcher.on('change', notify)
      server.watcher.on('add', notify)

      server.middlewares.use('/api', async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://x')
          const [, kind, rawName] = url.pathname.split('/')
          if (kind === 'events') {
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
            res.write(': hi\n\n')
            clients.add(res)
            req.on('close', () => clients.delete(res))
            return
          }
          if (kind === 'resumes' && req.method === 'GET') {
            return send(res, 200, listResumes().map(r => ({ name: r.name, file: path.relative(ROOT, r.file) })))
          }
          // Writes must be JSON: a cross-site page can't send that without a CORS preflight.
          if (req.method !== 'GET' && !req.headers['content-type']?.startsWith('application/json')) {
            return send(res, 415, { error: 'Expected application/json' })
          }
          const name = decodeURIComponent(rawName ?? '')
          // Only plain names ("base", "sample", variant slugs) are accepted, never paths.
          if (kind === 'resume' && isName(name)) {
            const { file } = resolveResume(name)
            const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
            if (req.method === 'GET') {
              if (current === null) return send(res, 404, { error: 'Not found' })
              return send(res, 200, JSON.parse(current), { ETag: etagOf(current) })
            }
            if (req.method === 'PUT') {
              const expected = req.headers['if-match']
              if (expected && current !== null && expected !== etagOf(current)) {
                return send(res, 409, { error: 'Changed on disk since it was loaded' })
              }
              try {
                const { text } = save(file, JSON.parse(await readBody(req)))
                return send(res, 200, { saved: true }, { ETag: etagOf(text) })
              } catch (e) {
                if (e instanceof InvalidResume) return send(res, 422, { issues: e.issues })
                throw e
              }
            }
            if (req.method === 'POST') {
              const { from = 'base' } = JSON.parse((await readBody(req)) || '{}')
              if (typeof from !== 'string' || !isName(from)) return send(res, 400, { error: 'Invalid source resume' })
              createVariant(name, from)
              return send(res, 201, { created: true })
            }
          }
          send(res, 404, { error: 'Unknown endpoint' })
        } catch (e) {
          send(res, 400, { error: (e as Error).message })
        }
      })
    },
  }
}

export default defineConfig({
  root: 'web',
  publicDir: false,
  plugins: [vue(), resumeFiles()],
  server: { fs: { allow: [ROOT] } },
  build: { outDir: '../dist', emptyOutDir: true },
  optimizeDeps: { exclude: ['@myriaddreamin/typst-ts-web-compiler', '@myriaddreamin/typst-ts-renderer'] },
})
