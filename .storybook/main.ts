import type { StorybookConfig } from '@storybook/web-components-vite';

const config: StorybookConfig = {
  "stories": [
    "../evaluation/stories/**/*.mdx", //TODO: déplacer les stories dans storybook/evaluation
    "../evaluation/stories/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@storybook/addon-docs",
    "@storybook/addon-vitest"
  ],
  "framework": "@storybook/web-components-vite"
};
export default config;
