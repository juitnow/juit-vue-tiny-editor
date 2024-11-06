import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import svg from 'vite-svg-loader'

export default defineConfig({
  base: process.env.VITE_BASE_URL,
  plugins: [ vue(), svg() ],
  build: {
    minify: true,
    sourcemap: true,
    outDir: 'demo',
    copyPublicDir: true,
  },
})
