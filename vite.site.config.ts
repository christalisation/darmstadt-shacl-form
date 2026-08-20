import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, Plugin } from 'vite'

const rootDir = dirname(fileURLToPath(import.meta.url))

function copyRmlFixtures(): Plugin {
  return {
    name: 'copy-rml-fixtures',
    closeBundle() {
      const outDir = resolve(rootDir, 'site-dist/rml')
      mkdirSync(outDir, { recursive: true })
      for (const file of readdirSync(resolve(rootDir, 'rml'))) {
        if (file.endsWith('.ttl')) {
          copyFileSync(resolve(rootDir, 'rml', file), resolve(outDir, basename(file)))
        }
      }
    },
  }
}

export default defineConfig({
  // Relative asset URLs keep the static demo working under a GitHub Pages
  // repository base path such as /darmstadt-shacl-form/.
  base: './',
  build: {
    emptyOutDir: true,
    outDir: 'site-dist',
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        rml: resolve(rootDir, 'rml/index.html'),
      },
    },
  },
  plugins: [copyRmlFixtures()],
})
