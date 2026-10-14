// Characterizes core/node/xone-001: branch fields render, but their values currently reach neither validation nor serialized RDF.
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { html } from 'lit'
import { userEvent, within, expect } from 'storybook/test'
import { DataFactory } from 'n3'
import {
    findQuads, getInnerEditableInput, getShaclForm, getShaclFormRoot,
    loadFixture, parseQuads, violationsForFocusNode, waitForFormReady,
} from './_shared'

const SHAPES_CONTENT = loadFixture('evaluation/fixtures/shacl/core-node-xone-001.ttl')
const NS = 'http://datashapes.org/sh/tests/core/node/xone-001.test#'
const FULL_NAME_PREDICATE = DataFactory.namedNode(`${NS}fullName`)
const FIRST_NAME_PREDICATE = DataFactory.namedNode(`${NS}firstName`)
const LAST_NAME_PREDICATE = DataFactory.namedNode(`${NS}lastName`)
const XONE_COMPONENT = 'http://www.w3.org/ns/shacl#XoneConstraintComponent'

interface Args {
    shapesContent: string
}

const meta: Meta<Args> = {
    title: 'SHACL Core/interaction/xone-001',
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
                component: 'Real userEvent authoring workflows for the official W3C `core/node/xone-001` fixture (node-level sh:xone between a fullName branch and a firstName+lastName branch). Surfaces a significant output-layer finding — see file header — rather than asserting the originally expected "silently accepts both branches" behaviour, which turned out not to be what actually happens.',
            },
        },
    },
}
export default meta

function getAlternativeSelect(root: HTMLElement): HTMLSelectElement {
    const select = [...root.querySelectorAll('select')].find(s =>
        [...s.options].some(o => o.textContent?.includes('Select alternative'))
    )
    if (!select) {
        throw new Error('logical alternative <select> ("Select alternative") not found')
    }
    return select as HTMLSelectElement
}

function getFocusNodeId(root: HTMLElement): string {
    return root.querySelector('shacl-node')!.getAttribute('data-node-id')!
}

export const ValidFullNameBranch: StoryObj<Args> = {
    name: 'Choose and fill the fullName branch',
    play: async ({ canvasElement, step }) => {
        const form = getShaclForm(canvasElement)
        await waitForFormReady(form)
        const root = getShaclFormRoot(form)
        const canvas = within(root)
        const focusNodeId = getFocusNodeId(root)

        await step('Select the first declared sh:xone branch (by RDF-list position, not by the unstable blank-node option label)', async () => {
            const select = getAlternativeSelect(root)
            await userEvent.selectOptions(select, select.options[1].value)
        })

        let input: HTMLInputElement
        await step('Verify the fullName branch rendered, and fill it', async () => {
            const label = canvas.getByText('fullName') as HTMLLabelElement
            input = getInnerEditableInput(label.control as HTMLElement)
            await userEvent.click(input)
            await userEvent.type(input, 'Carla Miller')
        })

        await step('UI state: the widget correctly holds the typed value', async () => {
            await expect(input).toHaveValue('Carla Miller')
        })

        await step('Finding: the value does not reach the validation graph (report.conforms stays false, XoneConstraintComponent still reported)', async () => {
            const report = await form.validate(false, true)
            const ownViolations = violationsForFocusNode(report, focusNodeId)
            await expect(ownViolations.some(v => v.constraintComponent?.value === XONE_COMPONENT),
                'sh:xone is still reported as violated even though a branch was filled — see file header finding').toBe(true)
        })

        await step('Finding: the value does not reach the serialized RDF either', async () => {
            const turtle = form.serialize()
            const quads = parseQuads(turtle)
            await expect(findQuads(quads, { predicate: FULL_NAME_PREDICATE }).length,
                'fullName is not expected to appear in the output — node-level sh:xone branch content is not currently wired into toRDF()').toBe(0)
        })
    },
}

export const ValidFirstLastNameBranch: StoryObj<Args> = {
    name: 'Choose and fill the firstName+lastName branch',
    play: async ({ canvasElement, step }) => {
        const form = getShaclForm(canvasElement)
        await waitForFormReady(form)
        const root = getShaclFormRoot(form)
        const canvas = within(root)
        const focusNodeId = getFocusNodeId(root)

        await step('Select the second declared sh:xone branch', async () => {
            const select = getAlternativeSelect(root)
            await userEvent.selectOptions(select, select.options[2].value)
        })

        let firstNameInput: HTMLInputElement
        let lastNameInput: HTMLInputElement
        await step('Verify the firstName+lastName branch rendered, and fill both fields', async () => {
            firstNameInput = getInnerEditableInput((canvas.getByText('firstName') as HTMLLabelElement).control as HTMLElement)
            await userEvent.click(firstNameInput)
            await userEvent.type(firstNameInput, 'Robert')

            lastNameInput = getInnerEditableInput((canvas.getByText('lastName') as HTMLLabelElement).control as HTMLElement)
            await userEvent.click(lastNameInput)
            await userEvent.type(lastNameInput, 'Coin')
        })

        await step('UI state: both widgets correctly hold the typed values', async () => {
            await expect(firstNameInput).toHaveValue('Robert')
            await expect(lastNameInput).toHaveValue('Coin')
        })

        await step('Finding: same as the fullName branch — neither value reaches validation or output', async () => {
            const report = await form.validate(false, true)
            const ownViolations = violationsForFocusNode(report, focusNodeId)
            await expect(ownViolations.some(v => v.constraintComponent?.value === XONE_COMPONENT)).toBe(true)

            const turtle = form.serialize()
            const quads = parseQuads(turtle)
            await expect(findQuads(quads, { predicate: FIRST_NAME_PREDICATE }).length).toBe(0)
            await expect(findQuads(quads, { predicate: LAST_NAME_PREDICATE }).length).toBe(0)
        })
    },
}

export const InvalidBothBranchesFilled: StoryObj<Args> = {
    name: 'Invalid: fill fullName, switch branch, fill firstName+lastName too',
    play: async ({ canvasElement, step }) => {
        const form = getShaclForm(canvasElement)
        await waitForFormReady(form)
        const root = getShaclFormRoot(form)
        const canvas = within(root)
        const select = getAlternativeSelect(root)

        await step('Fill the fullName branch first', async () => {
            await userEvent.selectOptions(select, select.options[1].value)
            const input = getInnerEditableInput((canvas.getByText('fullName') as HTMLLabelElement).control as HTMLElement)
            await userEvent.click(input)
            await userEvent.type(input, 'Dory Dunce')
        })

        await step('Switch the selector to the firstName+lastName branch and fill it too', async () => {
            await userEvent.selectOptions(select, select.options[2].value)
            const firstNameInput = getInnerEditableInput((canvas.getByText('firstName') as HTMLLabelElement).control as HTMLElement)
            await userEvent.click(firstNameInput)
            await userEvent.type(firstNameInput, 'Dory')
            const lastNameInput = getInnerEditableInput((canvas.getByText('lastName') as HTMLLabelElement).control as HTMLElement)
            await userEvent.click(lastNameInput)
            await userEvent.type(lastNameInput, 'Dunce')
        })

        // Branch values never reach validation or serialization, so switching cannot reveal whether the old branch is discarded. Assert the observed behavior directly.
        await step('Record the actual behaviour: neither branch\'s content is visible to serialize() or validate(), switching or not', async () => {
            const turtle = form.serialize()
            const quads = parseQuads(turtle)
            await expect(findQuads(quads, { predicate: FULL_NAME_PREDICATE }).length, 'the discarded fullName branch is (unsurprisingly) absent').toBe(0)
            await expect(findQuads(quads, { predicate: FIRST_NAME_PREDICATE }).length, 'the current firstName branch is ALSO absent — not because switching correctly discarded it, but because node-level sh:xone branch content never reaches toRDF() at all (see file header)').toBe(0)
            await expect(findQuads(quads, { predicate: LAST_NAME_PREDICATE }).length).toBe(0)
        })
    },
}
