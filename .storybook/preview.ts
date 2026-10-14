import type { Preview } from '@storybook/web-components-vite'
import { html } from 'lit'

import '../src/form-default'
import '../demo/shacl-form.css'

const preview: Preview = {
  decorators: [
    (story, context) => context.parameters.fullDemoPage
      ? story()
      : html`<main class="sb-demo-main"><section class="panel">${story()}</section></main>`,
  ],
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
  },
};

export default preview;
