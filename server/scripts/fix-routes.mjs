// Post-build step: ensure Cloudflare Pages serves the static web app and static
// assets directly, bypassing the Worker. The @hono/vite-build plugin generates
// dist/_routes.json as { include: ["/*"], exclude: ["/static/*"] }. We append
// the web app's static paths so requests for them never hit the Worker (which
// only handles /api/* and the / admin page).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const routesPath = join(root, 'dist', '_routes.json')

if (!existsSync(routesPath)) {
  console.warn('fix-routes: dist/_routes.json not found, skipping')
  process.exit(0)
}

const routes = JSON.parse(readFileSync(routesPath, 'utf8'))
routes.exclude = routes.exclude ?? []
for (const p of ['/static/*', '/app/assets/*']) {
  if (!routes.exclude.includes(p)) routes.exclude.push(p)
}
writeFileSync(routesPath, JSON.stringify(routes))
console.log('fix-routes: exclude =', routes.exclude.join(', '))
