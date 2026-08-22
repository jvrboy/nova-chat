import { defineConfig } from 'vitest/config'

// Dedicated Vitest config: keeps tests independent of vite.config.ts, whose
// Cloudflare build/dev-server plugins require runtime bindings that don't
// exist under plain Node.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
