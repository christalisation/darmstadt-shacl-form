// Authoring test cases for W3C SHACL test core/property/minCount-001.
// Spec of the cases: evaluation/suites/shacl-core/property/minCount-001/manifest.ttl
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { userEvent, within, waitFor, expect } from 'storybook/test'
import {
    authorRootIri, deepEditableInputs, describeReport, expectIsomorphic, expectNoValidationTargetLeak,
    getControlByLabel, getInnerEditableInput, getShaclForm, getShaclFormRoot,
    loadSuiteFile, renderSuiteForm, violationsForFocusNode, waitForFormReady,
    type SuiteFormArgs,
} from '../../_harness'

const CASE = 'shacl-core/property/minCount-001'
const EX = 'http://datashapes.org/sh/tests/core/property/minCount-001.test#'
const SHAPES = loadSuiteFile(CASE, 'shapes.ttl')
const EXPECTED_VALID = loadSuiteFile(CASE, 'expected/valid.ttl')

const meta: Meta<SuiteFormArgs> = {
    title: 'Suites/SHACL Core/property/minCount-001',
    render: renderSuiteForm,
    args: {
        shapes: SHAPES,
        shapeSubject: `${EX}PersonShape`,
    },
    parameters: {
        docs: {
            description: {
                component: 'Authoring test cases derived from W3C `core/property/minCount-001` (`sh:minCount 1` on `ex:firstName`). See `manifest.ttl` in the same test case folder.',
            },
        },
    },
}
export default meta

type Story = StoryObj<SuiteFormArgs>

export const CreateValid: Story = {
    name: 'create-valid',
    play: async ({ canvasElement, step }) => {
        const form = getShaclForm(canvasElement)
        await waitForFormReady(form)
        const root = getShaclFormRoot(form)

        await step('Author the IRI ex:ValidResource', async () => {
            await authorRootIri(root, `${EX}ValidResource`)
        })

        await step('Fill firstName = "John"', async () => {
            const input = getInnerEditableInput(getControlByLabel(root, 'firstName'))
            await userEvent.click(input)
            await userEvent.type(input, 'John')
            await userEvent.tab()
        })

        await step('Output is isomorphic to expected/valid.ttl and leaks no validation target', async () => {
            const quads = await expectIsomorphic(form, EXPECTED_VALID)
            await expectNoValidationTargetLeak(quads)
        })

        await step('SHACL reports no violation for the authored node', async () => {
            const report = await form.validate(false, true)
            await expect(violationsForFocusNode(report, `${EX}ValidResource`)).toHaveLength(0)
        })
    },
}

export const CreateMissing: Story = {
    name: 'create-missing',
    play: async ({ canvasElement, step }) => {
        const form = getShaclForm(canvasElement)
        await waitForFormReady(form)
        const root = getShaclFormRoot(form)
        const input = getInnerEditableInput(getControlByLabel(root, 'firstName'))
        const focusNodeId = root.querySelector('shacl-node')!.getAttribute('data-node-id')!

        let rootCountBefore = 0
        await step('Try to commit the root without filling firstName', async () => {
            await expect(input).toHaveValue('')
            rootCountBefore = root.querySelectorAll('shacl-node').length
            await userEvent.click(within(root).getByRole('button', { name: /add node/i }))
        })

        await step('Commit is blocked', async () => {
            await expect(input.validity.valid, 'empty required field should be invalid').toBe(false)
            await expect(root.querySelectorAll('shacl-node').length, 'no new root instance should be created').toBe(rootCountBefore)
        })

        await step('SHACL reports sh:MinCountConstraintComponent for the authored node', async () => {
            const report = await form.validate(false, true)
            const own = violationsForFocusNode(report, focusNodeId)
            // shacl-engine represents result paths as path structures, not plain Terms,
            // so the check is on the constraint component; the full report is printed on failure.
            await expect(
                own.some(v => v.constraintComponent?.value === 'http://www.w3.org/ns/shacl#MinCountConstraintComponent'),
                `no sh:MinCountConstraintComponent result for focus node ${focusNodeId}.\n${describeReport(report)}`,
            ).toBe(true)
        })
    },
}

export const EditPreserve: Story = {
    name: 'edit-preserve',
    args: {
        values: EXPECTED_VALID,
        valuesSubject: `${EX}ValidResource`,
    },
    play: async ({ canvasElement, step }) => {
        const form = getShaclForm(canvasElement)
        await waitForFormReady(form)

        // Data first: preservation is checked even if the display check below fails.
        await step('Re-serialised graph is isomorphic to the loaded graph', async () => {
            const quads = await expectIsomorphic(form, EXPECTED_VALID)
            await expectNoValidationTargetLeak(quads)
        })

        await step('Loaded value is shown in the form', async () => {
            // Search all editable inputs (through nested shadow roots) rather than by label:
            // labels of loaded values are not always linked to their control.
            // Widgets may fill their inner input asynchronously, so wait up to 2 s.
            const root = getShaclFormRoot(form)
            await waitFor(() => {
                const values = deepEditableInputs(root).map(input => input.value)
                if (!values.includes('John')) {
                    throw new Error(`no input shows "John" after waiting; inputs: ${JSON.stringify(values)}`)
                }
            }, { timeout: 2000, interval: 50 })
        })
    },
}
