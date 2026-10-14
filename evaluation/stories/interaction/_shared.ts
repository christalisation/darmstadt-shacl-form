// Shared helpers for SHACL interaction stories; the filename keeps Storybook from indexing this module as a story.
import { waitFor, within } from 'storybook/test'
import { Parser as N3Parser } from 'n3'
import type { Quad, Term } from '@rdfjs/types'

export { loadFixture } from '../shacl-core/_shared'

// Waits for the <shacl-form> custom element to finish its async shapes/values load.
export async function waitForFormReady(form: HTMLElement): Promise<void> {
    await waitFor(() => {
        if (form.hasAttribute('loading')) {
            throw new Error('shacl-form still loading')
        }
    }, { timeout: 4000, interval: 25 })
}

export interface ShaclValidationResult {
    focusNode?: Term
    path?: Term
    message?: unknown
    value?: Term
    constraintComponent?: Term
}

export interface ShaclValidationReport {
    conforms: boolean
    results: ShaclValidationResult[]
}

export type ShaclFormElement = HTMLElement & {
    serialize(format?: string): string
    validate(ignoreEmptyValues?: boolean, includeEmptyActiveRootNode?: boolean): Promise<ShaclValidationReport | undefined>
}

// Fixture examples can make the full report non-conforming, so check only the node authored by this story.
export function violationsForFocusNode(report: ShaclValidationReport | undefined, focusNodeId: string): ShaclValidationResult[] {
    return (report?.results || []).filter(r => r.focusNode?.value === focusNodeId)
}

export function getShaclForm(canvasElement: HTMLElement): ShaclFormElement {
    const form = canvasElement.querySelector('shacl-form') as ShaclFormElement | null
    if (!form) {
        throw new Error('no <shacl-form> element found in canvasElement')
    }
    return form
}

// Storybook queries do not cross the form shadow root; scope them to this root instead.
export function getShaclFormRoot(form: ShaclFormElement): HTMLElement {
    const root = (form as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot
    if (!root) {
        throw new Error('shacl-form has no shadow root')
    }
    return root as unknown as HTMLElement
}

/** Parses the form's serialized Turtle output into RDF/JS quads for structural assertions. */
export function parseQuads(turtle: string): Quad[] {
    return new N3Parser({ format: 'text/turtle' }).parse(turtle)
}

/** Finds quads matching the given subject/predicate/object (any omitted term matches anything). */
export function findQuads(quads: Quad[], match: { subject?: Term, predicate?: Term, object?: Term }): Quad[] {
    return quads.filter(quad =>
        (!match.subject || quad.subject.equals(match.subject)) &&
        (!match.predicate || quad.predicate.equals(match.predicate)) &&
        (!match.object || quad.object.equals(match.object))
    )
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

// Use label.control because the bundled accessible-name queries fail when scoped to a ShadowRoot.
export function getControlByLabel(root: HTMLElement, text: string | RegExp): HTMLElement {
    const label = within(root).getByText(text) as HTMLLabelElement
    if (!(label instanceof HTMLLabelElement)) {
        throw new Error(`element matching ${text} is not a <label> (got <${(label as HTMLElement).tagName}>)`)
    }
    const control = label.control
    if (!control) {
        throw new Error(`label matching ${text} has no associated control (missing "for"/id pairing, or target isn't a labelable element)`)
    }
    return control as HTMLElement
}

// Rokit editors keep the native input in their own shadow root; userEvent must target that input.
export function getInnerEditableInput(control: HTMLElement): HTMLInputElement {
    const shadow = (control as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot
    const input = shadow?.querySelector('input, textarea')
    if (!input) {
        throw new Error(`<${control.tagName}> has no inner native input/textarea in its shadow root`)
    }
    return input as HTMLInputElement
}
