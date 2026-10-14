// Interaction coverage for core/property/minCount-001, complementing its static C1 story.
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { html } from 'lit'
import { userEvent, within, expect } from 'storybook/test'
import { DataFactory } from 'n3'
import {
    findQuads, getControlByLabel, getInnerEditableInput, getShaclForm, getShaclFormRoot,
    loadFixture, parseQuads, violationsForFocusNode, waitForFormReady,
} from './_shared'

const SHAPES_CONTENT = loadFixture('evaluation/fixtures/shacl/core-property-minCount-001.ttl')
const FIRST_NAME_PREDICATE = DataFactory.namedNode('http://datashapes.org/sh/tests/core/property/minCount-001.test#firstName')

interface Args {
    shapesContent: string
}

const meta: Meta<Args> = {
    title: 'SHACL Core/interaction/minCount-001',
    render: args => html`
        <shacl-form
            data-shapes=${args.shapesContent}
            data-collapse=""
            data-values-namespace="http://example.org/"
            data-show-node-ids
        ></shacl-form>
    `,
    args: {
        shapesContent: SHAPES_CONTENT,
    },
    parameters: {
        docs: {
            description: {
                component: 'Real userEvent authoring workflows for the official W3C `core/property/minCount-001` fixture (`sh:minCount 1` on a string property), complementing the static SHACL Core/C1-value-constraints story.',
            },
        },
    },
}
export default meta

export const ValidAuthoring: StoryObj<Args> = {
    name: 'Valid: fill the required firstName',
    play: async ({ canvasElement, step }) => {
        const form = getShaclForm(canvasElement)
        await waitForFormReady(form)
        const root = getShaclFormRoot(form)

        let input: HTMLInputElement
        await step('Type a value into the required firstName field', async () => {
            const control = getControlByLabel(root, 'firstName')
            input = getInnerEditableInput(control)
            await userEvent.click(input)
            await userEvent.type(input, 'John')
        })

        await step('Verify the UI shows the authored, valid value', async () => {
            await expect(input).toHaveValue('John')
            await expect(input.validity.valid).toBe(true)
        })

        await step('Verify the serialized RDF contains the authored triple', async () => {
            const turtle = form.serialize()
            const quads = parseQuads(turtle)
            const matches = findQuads(quads, { predicate: FIRST_NAME_PREDICATE })
            await expect(matches.length, `expected exactly one ex:firstName triple:\n${turtle}`).toBe(1)
            await expect(matches[0].object.value).toBe('John')
        })
    },
}

export const InvalidAuthoring: StoryObj<Args> = {
    name: 'Invalid: leave firstName empty, attempt to commit',
    play: async ({ canvasElement, step }) => {
        const form = getShaclForm(canvasElement)
        await waitForFormReady(form)
        const root = getShaclFormRoot(form)
        const canvas = within(root)

        let input: HTMLInputElement
        await step('Confirm the required firstName field starts empty', async () => {
            const control = getControlByLabel(root, 'firstName')
            input = getInnerEditableInput(control)
            await expect(input).toHaveValue('')
        })

        const focusNodeId = root.querySelector('shacl-node')!.getAttribute('data-node-id')!

        let rootCountBefore: number
        await step('Attempt to commit the root ("Add node") without filling firstName', async () => {
            rootCountBefore = root.querySelectorAll('shacl-node').length
            const addNodeButton = canvas.getByRole('button', { name: /add node/i })
            await userEvent.click(addNodeButton)
        })

        // minCount maps to native `required`; commit calls reportValidity() and blocks an empty value. The assertions below capture that behavior.
        await step('Verify the actual behaviour: prevented / reported / silently accepted', async () => {
            await expect(input.validity.valid, 'native constraint validation should mark the empty required field invalid').toBe(false)

            const rootCountAfter = root.querySelectorAll('shacl-node').length
            await expect(rootCountAfter, 'commit should be blocked: no second root instance should have been created').toBe(rootCountBefore)

            // The fixture has its own invalid ex:Person, so scope the report to this story's focus node.
            const report = await form.validate(false, true)
            const ownViolations = violationsForFocusNode(report, focusNodeId)
            await expect(ownViolations.length, 'expected our own authored node to have a SHACL violation (missing firstName)').toBeGreaterThan(0)
            await expect(ownViolations.some(v => v.constraintComponent?.value === 'http://www.w3.org/ns/shacl#MinCountConstraintComponent')).toBe(true)
        })
    },
}
