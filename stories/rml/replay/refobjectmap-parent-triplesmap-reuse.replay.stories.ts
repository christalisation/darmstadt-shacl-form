// Visual REPLAY demonstration — NOT the regression test.
//
// See stories/rml/interaction/refobjectmap-parent-triplesmap-reuse.stories.ts
// for the automated regression test of this exact workflow (kept unchanged,
// not replaced). See objectmap-alternative-path-reuse.replay.stories.ts for
// the shared design notes (step() + built-in Interactions panel, why the
// add-button is driven via value+change-event rather than a real click).
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { html } from 'lit'
import { expect } from 'storybook/test'
import { rmlShapesGraph } from '../shapes'
import { findProperty, reuseExistingNode, selectRootShape, waitForFormReady } from '../interaction/_shared'

const TRIPLES_MAP_1_ID = 'http://example.org/existing-triplesmap-1'
const TRIPLES_MAP_2_ID = 'http://example.org/existing-triplesmap-2'

const existingValues = `
@prefix rml: <http://w3id.org/rml/> .
<${TRIPLES_MAP_1_ID}> a rml:TriplesMap ;
    rml:subject <http://example.org/existing-subject-1> ;
    rml:logicalSource [
        a rml:LogicalSource ;
        rml:source "existing1.csv" ;
        rml:referenceFormulation rml:CSV ;
    ] .
<${TRIPLES_MAP_2_ID}> a rml:TriplesMap ;
    rml:subject <http://example.org/existing-subject-2> ;
    rml:logicalSource [
        a rml:LogicalSource ;
        rml:source "existing2.csv" ;
        rml:referenceFormulation rml:CSV ;
    ] .
`

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
}
export default meta

export const RefObjectMapParentTriplesMapReuse: StoryObj<Args> = {
    name: 'RefObjectMap parentTriplesMap reuse',
    args: {
        valuesContent: existingValues,
    },
    play: async ({ canvasElement, step }) => {
        const form = canvasElement.querySelector('shacl-form') as HTMLElement & { serialize(): string }
        await waitForFormReady(form)
        await sleep(PAUSE_MS)

        let refObjectMapRoot: HTMLElement
        await step('1. Select the RefObjectMap root (two existing TriplesMaps already loaded)', async () => {
            refObjectMapRoot = selectRootShape(form, 'RefObjectMap')
            refObjectMapRoot.scrollIntoView({ block: 'center' })
            await sleep(PAUSE_MS)
        })

        let parentProperty: ReturnType<typeof findProperty>
        await step('2. Locate the parentTriplesMap property', async () => {
            parentProperty = findProperty(refObjectMapRoot, 'parentTriplesMap')
            if (!parentProperty) {
                throw new Error('parentTriplesMap property not found on RefObjectMap root')
            }
            parentProperty.scrollIntoView({ block: 'center' })
            await sleep(PAUSE_MS)
        })

        let instance: HTMLElement
        await step(`3. Reuse the existing TriplesMap (${TRIPLES_MAP_1_ID}) as parentTriplesMap`, async () => {
            instance = await reuseExistingNode(parentProperty!, TRIPLES_MAP_1_ID)
            instance.scrollIntoView({ block: 'center' })
            await sleep(PAUSE_MS)
        })

        await step('4. Show that RDF identity is preserved (same node, no duplicate)', async () => {
            const nestedNode = instance.querySelector<HTMLElement>('shacl-node')
            await expect(nestedNode).not.toBeNull()
            await expect(nestedNode!.dataset.nodeId).toBe(TRIPLES_MAP_1_ID)

            const turtle = form.serialize()
            await expect(turtle.includes(TRIPLES_MAP_1_ID)).toBe(true)
            await expect(turtle.includes(TRIPLES_MAP_2_ID)).toBe(false)
            await sleep(PAUSE_MS)
        })
    },
}
