import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    ssr: 'src/engine-uci/cli.ts',
    outDir: 'dist-uci',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    sourcemap: true,
  },
})
