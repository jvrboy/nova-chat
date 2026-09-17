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
// Add the web app's static paths so requests for them never hit the Worker.
// Note: Cloudflare Pages rejects overlapping rules, so we de-duplicate any
// path that is already covered by a broader splat rule (e.g. /app/* covers
// /app/assets/*, so we don't add the latter if the former is present).
const candidates = ['/static/*', '/app/assets/*', '/sounds/*', '/app/*']
for (const p of candidates) {
  if (!routes.exclude.includes(p)) routes.exclude.push(p)
}
// Remove overlapping rules: if a path is a prefix of another (with splat),
// drop the more specific one (the broader rule already covers it).
const isSplat = (p) => p.endsWith('/*')
const prefix = (p) => p.replace(/\/\*$/, '')
routes.exclude = routes.exclude.filter((p) => {
  if (!isSplat(p)) return true
  const myPrefix = prefix(p)
  // keep p only if NO other rule is a broader prefix of p
  const covered = routes.exclude.some((other) => other !== p && isSplat(other) && prefix(p).startsWith(prefix(other) + '/'))
  return !covered
})
writeFileSync(routesPath, JSON.stringify(routes))
console.log('fix-routes: exclude =', routes.exclude.join(', '))
