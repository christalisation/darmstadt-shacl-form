// Applies the project-level Storybook config (decorators, global imports from preview.ts)
// to stories when they run as Vitest tests.
import { setProjectAnnotations } from '@storybook/web-components-vite'
import * as projectAnnotations from './preview'

setProjectAnnotations([projectAnnotations])
