import { defineConfig } from 'vite-plus'

export default defineConfig({
  // `vp pack` — bundles the extension with tsdown. VS Code loads the
  // extension host bundle as CommonJS, and the `vscode` module is provided
  // by the host at runtime, so it must stay external.
  pack: {
    entry: ['src/extension.ts'],
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    deps: { neverBundle: ['vscode'] },
    outDir: 'dist',
    sourcemap: true,
    dts: false,
    clean: true,
    minify: false,
  },
  // `vp test` — Vitest
  test: {
    include: ['src/**/*.test.ts'],
  },
  // `vp lint` — Oxlint
  lint: {
    ignorePatterns: ['dist/**', 'test/fixtures/**'],
  },
  // `vp fmt` — Oxfmt
  fmt: {
    singleQuote: true,
    semi: false,
    printWidth: 100,
  },
})
