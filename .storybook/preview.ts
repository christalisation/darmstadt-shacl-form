import type { Preview } from '@storybook/web-components-vite'

// Side-effect import: registers the <shacl-form> custom element, exactly as
// index.html / rml/index.html do for the real demos.
import '../src/form-default'

const preview: Preview = {
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