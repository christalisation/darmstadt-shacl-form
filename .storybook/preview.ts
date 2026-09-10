import type { Preview } from '@storybook/web-components-vite'
import { html } from 'lit'

// Side-effect import: registers the <shacl-form> custom element, exactly as
// index.html / rml/index.html do for the real demos.
import '../src/form-default'

// Page-level chrome (card container, font, colors) reproducing the visual
// context both demos wrap <shacl-form> in — see stories/demo-chrome.css for
// why only this subset of their CSS is reused (not their toolbar/grid).
import '../stories/demo-chrome.css'

const preview: Preview = {
  decorators: [
    story => html`
      <main class="sb-demo-main">
        <section id="form-panel" class="panel">${story()}</section>
      </main>
    `,
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