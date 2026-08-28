/**
 * 로컬 확인용 미니 서버 — Vercel CLI 없이 api/ + dist/ 를 같이 띄운다.
 *   npm run build && node tests/serve.mjs [port]
 *
 * Vercel의 서버리스 규약(파일명 = 경로, export default (req,res))을 그대로
 * 흉내내므로, 배포본과 같은 코드를 로컬에서 그대로 돌려볼 수 있다.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.argv[2] || 3111)
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
}

const handlers = new Map()
async function loadHandler(name) {
  if (handlers.has(name)) return handlers.get(name)
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return null
  try {
    const mod = await import(join(ROOT, 'api', `${name}.js`))
    handlers.set(name, mod.default)
    return mod.default
  } catch {
    handlers.set(name, null)
    return null
  }
}

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) }
    })
  })

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (url.pathname.startsWith('/api/')) {
    const h = await loadHandler(url.pathname.slice(5))
    if (!h) { res.writeHead(404).end('no handler'); return }
    const shim = {
      status(c) { this._c = c; return this },
      setHeader(k, v) { res.setHeader(k, v); return this },
      json(b) { res.writeHead(this._c || 200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(b)) },
    }
    try {
      await h({ method: req.method, body: await readBody(req), query: Object.fromEntries(url.searchParams) }, shim)
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: e.message }))
    }
    return
  }

  const p = url.pathname === '/' ? '/index.html' : url.pathname
  try {
    const buf = await readFile(join(ROOT, 'dist', p))
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }).end(buf)
  } catch {
    // SPA 폴백
    try {
      const buf = await readFile(join(ROOT, 'dist', 'index.html'))
      res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(buf)
    } catch {
      res.writeHead(404).end('build first: npm run build')
    }
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`))
