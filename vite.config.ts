import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { defineConfig } from 'vitest/config'

// See: https://vitejs.dev/config/
export default defineConfig({
  build: {
    minify: true,
    sourcemap: true,
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
  test: {
    globals: true,
    environment: 'jsdom',
    include: [ 'lib/**/*.test.ts' ],
    coverage: {
      provider: 'v8',
      reporter: [ 'text', 'html' ],
      reportsDirectory: 'coverage',
      cleanOnRerun: true,
      include: [ 'lib' ],
      exclude: [
        'lib/**/*.test.ts',
        'lib/editor.vue', // we always get 100% coverage???
      ],
      reportOnFailure: true,
    },
  },
  plugins: [ vue(), dts({
    tsconfigPath: './tsconfig.app.json',
    rollupTypes: true,
  }) ],
})
