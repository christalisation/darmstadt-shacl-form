// Human-watchable replay of the automated ObjectMap reuse regression story.
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { html } from 'lit'
import { expect } from 'storybook/test'
import { rmlShapesGraph } from '../shapes'
import { findProperty, reuseAlternativePathBranch, selectRootShape, waitForFormReady } from '../interaction/_shared'

const EXISTING_OBJECTMAP_ID = 'http://example.org/existing-objectmap'

const existingValues = `
@prefix rml: <http://w3id.org/rml/> .
<${EXISTING_OBJECTMAP_ID}> a rml:ObjectMap ;
    rml:reference "$.Existing" .
`

// Pause between steps so each state is visible in the Interactions panel and screenshots.
const PAUSE_MS = 700

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

interface Args {
    valuesContent: string
}

const meta: Meta<Args> = {
    title: 'RML/replay',
    render: args => html`
        <shacl-form
            data-shapes=${rmlShapesGraph}
            data-values=${args.valuesContent}
            data-collapse=""
            data-values-namespace="http://example.org/"
            data-show-node-ids
            data-ignore-owl-imports
        ></shacl-form>
    `,
    parameters: {
        docs: {
            description: {
                component: 'Human-watchable replays of authoring workflows: press "Go to start" then step forward (or "Rerun") in the Interactions panel to watch each labeled step happen in the canvas above. These complement, not replace, the automated regression stories under RML/interaction.',
            },
        },
    },
}
export default meta

export const ObjectMapReuseThroughAlternativePath: StoryObj<Args> = {
    name: 'objectMap reuse through alternativePath + sh:or',
    args: {
        valuesContent: existingValues,
    },
    play: async ({ canvasElement, step }) => {
        const form = canvasElement.querySelector('shacl-form') as HTMLElement & { serialize(): string }
        await waitForFormReady(form)
        await sleep(PAUSE_MS)

        let pomNode: HTMLElement
        await step('1. Select the TriplesMap root and add a predicateObjectMap', async () => {
            const triplesMapRoot = selectRootShape(form, 'TriplesMap')
            await sleep(PAUSE_MS)
            const pomProperty = findProperty(triplesMapRoot, 'predicateObjectMap')
            if (!pomProperty) {
                throw new Error('predicateObjectMap property not found on TriplesMap root')
            }
            pomProperty.addPropertyInstance()
            await sleep(PAUSE_MS)
            const pomNodes = [...pomProperty.querySelectorAll('shacl-node')]
            pomNode = pomNodes[pomNodes.length - 1]
            if (!pomNode) {
                throw new Error('adding a predicateObjectMap instance did not render a nested shacl-node')
            }
            pomNode.scrollIntoView({ block: 'center' })
            await sleep(PAUSE_MS)
        })

        let objectAlternative: ReturnType<typeof findProperty>
        await step('2. Locate the object/objectMap/quotedTriplesMap alternativePath property', async () => {
            objectAlternative = findProperty(pomNode, 'object/objectMap/quotedTriplesMap')
            if (!objectAlternative) {
                throw new Error('object/objectMap/quotedTriplesMap alternativePath property not found on PredicateObjectMap')
            }
            objectAlternative.scrollIntoView({ block: 'center' })
            await sleep(PAUSE_MS)
        })

        let instance: HTMLElement
        await step('3. Choose "Reuse from this form" -> select the existing ObjectMap', async () => {
            instance = await reuseAlternativePathBranch(objectAlternative!, 'objectMap', EXISTING_OBJECTMAP_ID)
            instance.scrollIntoView({ block: 'center' })
            await sleep(PAUSE_MS)
        })

        await step('4. Show the final reference (no reopened selector, no duplicate node)', async () => {
            const referenceEditor = instance.querySelector<HTMLInputElement>('.reference-editor')
            await expect(referenceEditor).not.toBeNull()
            await expect(referenceEditor!.value).toBe(EXISTING_OBJECTMAP_ID)
            await expect(instance.querySelector(':scope > div > select')).toBeNull()
            await expect(instance.querySelectorAll('shacl-node').length).toBe(0)
            await sleep(PAUSE_MS)
        })
    },
}
