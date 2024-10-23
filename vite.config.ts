import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

// See: https://vitejs.dev/config/
export default defineConfig({
  build: {
    sourcemap: true,
    minify: false,
    lib: {
      entry: 'lib/index.ts',
      name: 'JuitTinyEdit',
      fileName: 'index',
    },
    rollupOptions: {
      external: [ 'vue' ],
      output: {
        globals: { vue: 'Vue' },
      },
    },
  },
  plugins: [ vue(), dts({
    tsconfigPath: './tsconfig.app.json',
    rollupTypes: true,
  }) ],
})
