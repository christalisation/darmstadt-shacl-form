// Two test projects:
//   - "unit"      : the existing Vitest tests in test/ (Node, no browser)
//   - "storybook" : every story with a play() function, run in headless Chromium
// Run one with `vitest run --project=unit` or `--project=storybook`, or both with `vitest run`.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: 'unit',
                    include: ['test/**/*.test.ts'],
                },
            },
            {
                plugins: [
                    storybookTest({
                        configDir: path.join(dirname, '.storybook'),
                        storybookScript: 'npm run storybook -- --no-open',
                    }),
                ],
                test: {
                    name: 'storybook',
                    browser: {
                        enabled: true,
                        headless: true,
                        provider: playwright({}),
                        instances: [{ browser: 'chromium' }],
                    },
                },
            },
        ],
    },
})
