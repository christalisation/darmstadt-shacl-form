// Characterizes the mismatch between SHACL substring matching and browser full-value HTML pattern validation. Results are scoped to the node authored by each story because fixtures contain their own example instances.
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { userEvent, expect } from 'storybook/test'
import { DataFactory } from 'n3'
import {
    findQuads, getControlByLabel, getInnerEditableInput, getShaclForm, getShaclFormRoot,
    loadFixture, parseQuads, violationsForFocusNode, waitForFormReady,
} from './_shared'
import { renderShaclDemoPage } from '../shacl-core/demo-page'

const SHAPES_CONTENT = loadFixture('evaluation/fixtures/shacl/core-property-pattern-001.ttl')
const PROPERTY_PREDICATE = DataFactory.namedNode('http://datashapes.org/sh/tests/core/property/pattern-001.test#property')

interface Args {
    shapesContent: string
}

const meta: Meta<Args> = {
    title: 'SHACL Core/interaction/pattern-001',
    render: renderShaclDemoPage,
    args: {
        shapesContent: SHAPES_CONTENT,
    },
    parameters: {
        fullDemoPage: true,
        docs: {
            description: {
                component: 'Real userEvent authoring workflows for the official W3C `core/property/pattern-001` fixture (`sh:pattern "Joh"`). Documents a real semantic mismatch: SHACL sh:pattern is a substring search, but the native HTML `pattern` attribute it is mapped to requires a full-value match — see file header.',
            },
        },
    },
}
export default meta

export const ValidPerShaclSubstringMatch: StoryObj<Args> = {
    name: 'SHACL-valid ("John", from ex:ValidInstance1): native pattern mismatch',
    play: async ({ canvasElement, step }) => {
        const form = getShaclForm(canvasElement)
        await waitForFormReady(form)
        const root = getShaclFormRoot(form)

        let input: HTMLInputElement
        let focusNodeId: string
        await step('Type "John" — a value the official fixture lists as SHACL-valid (contains "Joh")', async () => {
            focusNodeId = root.querySelector('shacl-node')!.getAttribute('data-node-id')!
            const control = getControlByLabel(root, 'property')
            input = getInnerEditableInput(control)
            await userEvent.click(input)
            await userEvent.type(input, 'John')
        })

        await step('Verify the UI shows the typed value', async () => {
            await expect(input).toHaveValue('John')
        })

        await step('Document the actual behaviour: native full-match vs. SHACL substring-match', async () => {
            // Native pattern validation requires a full match, so it rejects "John" even though SHACL accepts the substring match.
            await expect(input.validity.patternMismatch, 'native pattern validation is expected to flag "John" as a mismatch (full-match semantics)').toBe(true)
            await expect(input.validity.valid).toBe(false)

            // SHACL accepts "John"; check only this story's node because the fixture also contains invalid examples.
            const report = await form.validate(false, true)
            const ownViolations = violationsForFocusNode(report, focusNodeId)
            await expect(ownViolations.length, `expected no SHACL violations for our own authored node:\n${JSON.stringify(ownViolations)}`).toBe(0)
        })

        await step('Verify the value is still serialized despite the native-invalid state', async () => {
            const turtle = form.serialize()
            const quads = parseQuads(turtle)
            const matches = findQuads(quads, { predicate: PROPERTY_PREDICATE })
            await expect(matches.length, `expected exactly one ex:property triple:\n${turtle}`).toBe(1)
            await expect(matches[0].object.value).toBe('John')
            await expect(canvasElement.querySelector('#rdf-output')?.textContent).toBe(turtle)
        })
    },
}

export const InvalidPerShacl: StoryObj<Args> = {
    name: 'SHACL-invalid ("Maria", from ex:InvalidInstance1)',
    play: async ({ canvasElement, step }) => {
        const form = getShaclForm(canvasElement)
        await waitForFormReady(form)
        const root = getShaclFormRoot(form)

        let input: HTMLInputElement
        let focusNodeId: string
        await step('Type "Maria" — a value the official fixture lists as SHACL-invalid (does not contain "Joh")', async () => {
            focusNodeId = root.querySelector('shacl-node')!.getAttribute('data-node-id')!
            const control = getControlByLabel(root, 'property')
            input = getInnerEditableInput(control)
            await userEvent.click(input)
            await userEvent.type(input, 'Maria')
        })

        // Unlike the required minCount field, a pattern mismatch does not block typing: "Maria" is accepted, reported invalid, and serialized.
        await step('Verify both native and SHACL validation report this as invalid', async () => {
            await expect(input.validity.patternMismatch).toBe(true)
            await expect(input.validity.valid).toBe(false)

            const report = await form.validate(false, true)
            const ownViolations = violationsForFocusNode(report, focusNodeId)
            await expect(ownViolations.length, 'expected our own authored node to have a SHACL violation for "Maria"').toBeGreaterThan(0)
            await expect(ownViolations.some(v => v.constraintComponent?.value === 'http://www.w3.org/ns/shacl#PatternConstraintComponent')).toBe(true)
        })

        await step('Verify the invalid value is nonetheless serialized (accepted but reported, not prevented)', async () => {
            const turtle = form.serialize()
            const quads = parseQuads(turtle)
            const matches = findQuads(quads, { predicate: PROPERTY_PREDICATE })
            await expect(matches.length, `expected exactly one ex:property triple:\n${turtle}`).toBe(1)
            await expect(matches[0].object.value).toBe('Maria')
            await expect(canvasElement.querySelector('#rdf-output')?.textContent).toBe(turtle)
        })
    },
}
