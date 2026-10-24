import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { DATA_DIR, listResumes, resolveResume, ROOT, VARIANTS_DIR, writeJson } from './src/core/paths.ts'
import { validate } from './src/core/schema.ts'

// Dev-only file API: the editor reads and writes data/*.json, the same files
// agents edit, and hears about changes made on disk through server-sent events.
function resumeFiles(): Plugin {
  const clients = new Set<ServerResponse>()
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
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
      const notify = (file: string) => {
        if (!file.endsWith('.json')) return
        const name = path.basename(file, '.json')
        for (const c of clients) c.write(`data: ${JSON.stringify({ name })}\n\n`)
      }
      server.watcher.add(DATA_DIR)
      server.watcher.on('change', notify)
      server.watcher.on('add', notify)

      server.middlewares.use('/api', async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://x')
          const [, kind, name] = url.pathname.split('/')
          if (kind === 'events') {
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
            res.write(': hi\n\n')
            clients.add(res)
            req.on('close', () => clients.delete(res))
            return
          }
          if (kind === 'resumes' && req.method === 'GET') {
            return send(res, 200, listResumes().map(r => r.name))
          }
          if (kind === 'resume' && name) {
            const { file } = resolveResume(decodeURIComponent(name))
            if (!file.startsWith(DATA_DIR)) return send(res, 400, { error: 'Outside data/' })
            if (req.method === 'GET') {
              if (!fs.existsSync(file)) return send(res, 404, { error: 'Not found' })
              return send(res, 200, JSON.parse(fs.readFileSync(file, 'utf8')))
            }
            if (req.method === 'PUT') {
              const data = JSON.parse(await readBody(req))
              const v = validate(data)
              if (!v.ok) return send(res, 422, { issues: v.issues })
              const next = JSON.stringify(data, null, 2) + '\n'
              if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== next) writeJson(file, data)
              return send(res, 200, { saved: true })
            }
            if (req.method === 'POST') {
              // Create a variant: body { from }
              const { from = 'base' } = JSON.parse((await readBody(req)) || '{}')
              if (fs.existsSync(file)) return send(res, 409, { error: 'Already exists' })
              const src = JSON.parse(fs.readFileSync(resolveResume(from).file, 'utf8'))
              writeJson(file, { ...src, $schema: '../../schema/resume.schema.json' })
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
