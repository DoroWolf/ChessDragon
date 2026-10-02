import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/ChessDragon/' : '/',
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    assetsInlineLimit: 10240,
    // 多页入口：主程序 + 两个独立工具页（教程 / 棋盘编辑器）
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        editor: fileURLToPath(new URL('./editor.html', import.meta.url)),
        tutorial: fileURLToPath(new URL('./tutorial.html', import.meta.url)),
      },
    },
  },
})
