import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { defineConfig } from 'vitest/config'

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
      reportOnFailure: true,
    },
  },
  plugins: [ vue(), dts({
    tsconfigPath: './tsconfig.app.json',
    rollupTypes: true,
  }) ],
})
