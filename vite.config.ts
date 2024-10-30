import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { defineConfig } from 'vitest/config'

export default defineConfig((env) => {
  const demo = env.mode === 'demo'
  return defineConfig({
    build: {
      minify: false,
      sourcemap: true,
      outDir: demo ? 'demo' : 'dist',
      copyPublicDir: demo,
      lib: demo ? undefined :{
        formats: [ 'es' ],
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
      include: [ 'test/**/*.test.ts' ],
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
})
