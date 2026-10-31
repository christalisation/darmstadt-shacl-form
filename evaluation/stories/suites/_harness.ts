// Self-contained harness for the authoring test suite in evaluation/suites/.
// Deliberately independent of the hand-written stories: suite-file loading,
// a minimal form renderer, DOM helpers, IRI authoring and RDF-level oracles.
import { html } from 'lit'
import { ifDefined } from 'lit/directives/if-defined.js'
import { within, waitFor, expect } from 'storybook/test'
import { Parser as N3Parser } from 'n3'
import { isomorphic } from 'rdf-isomorphic'
import type { Quad, Term } from '@rdfjs/types'

export const SH_TARGET_NODE = 'http://www.w3.org/ns/shacl#targetNode'

// ---------------------------------------------------------------- suite files

// Vite keys raw imports by project-root-relative path, e.g. "/evaluation/suites/.../shapes.ttl".
const suiteFiles = import.meta.glob('/evaluation/suites/**/*.ttl', {
    eager: true,
    query: '?raw',
    import: 'default',
}) as Record<string, string>

/** Loads a Turtle file of a test case, e.g. loadSuiteFile('shacl-core/property/minCount-001', 'shapes.ttl'). */
export function loadSuiteFile(testCase: string, file: string): string {
    const key = `/evaluation/suites/${testCase}/${file}`
    const text = suiteFiles[key]
    if (text === undefined) {
        throw new Error(`Suite file not found: "${key}". Available: ${Object.keys(suiteFiles).join(', ')}`)
    }
    return text
}

// ---------------------------------------------------------------- rendering

export interface SuiteFormArgs {
    shapes: string
    shapeSubject?: string
    values?: string          // edit mode: existing data graph
    valuesSubject?: string   // edit mode: focus node to load
}

/** Bare <shacl-form>, without the demo page, so the test controls every input. */
export function renderSuiteForm(args: SuiteFormArgs) {
    return html`
        <shacl-form
            data-shapes=${args.shapes}
            data-shape-subject=${ifDefined(args.shapeSubject)}
            data-values=${ifDefined(args.values)}
            data-values-subject=${ifDefined(args.valuesSubject)}
            data-values-namespace="http://example.org/"
            data-show-node-ids
        ></shacl-form>
    `
}

// ---------------------------------------------------------------- form access

export interface ShaclValidationResult {
    focusNode?: Term
    path?: Term
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

export function getShaclForm(canvasElement: HTMLElement): ShaclFormElement {
    const form = canvasElement.querySelector('shacl-form') as ShaclFormElement | null
    if (!form) {
        throw new Error('no <shacl-form> element found in canvasElement')
    }
    return form
}

/** Waits for the <shacl-form> custom element to finish its async shapes/values load. */
export async function waitForFormReady(form: HTMLElement): Promise<void> {
    await waitFor(() => {
        if (form.hasAttribute('loading')) {
            throw new Error('shacl-form still loading')
        }
    }, { timeout: 4000, interval: 25 })
}

/** Storybook queries do not cross the form's shadow root; scope them to this root instead. */
export function getShaclFormRoot(form: ShaclFormElement): HTMLElement {
    const root = (form as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot
    if (!root) {
        throw new Error('shacl-form has no shadow root')
    }
    return root as unknown as HTMLElement
}

/** Finds a field by its label text (label.control, since accessible-name queries fail inside a ShadowRoot). */
export function getControlByLabel(root: HTMLElement, text: string | RegExp): HTMLElement {
    const label = within(root).getByText(text) as HTMLLabelElement
    if (!(label instanceof HTMLLabelElement)) {
        throw new Error(`element matching ${text} is not a <label> (got <${(label as HTMLElement).tagName}>)`)
    }
    const control = label.control
    if (!control) {
        throw new Error(`label matching ${text} has no associated control`)
    }
    return control as HTMLElement
}

/** Rokit editors keep the native input in their own shadow root; userEvent must target that input. */
export function getInnerEditableInput(control: HTMLElement): HTMLInputElement {
    const shadow = (control as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot
    const input = shadow?.querySelector('input, textarea')
    if (!input) {
        throw new Error(`<${control.tagName}> has no inner native input/textarea in its shadow root`)
    }
    return input as HTMLInputElement
}

/** Validation results for one focus node only (other nodes in the graph may be non-conforming). */
export function violationsForFocusNode(report: ShaclValidationReport | undefined, focusNodeId: string): ShaclValidationResult[] {
    return (report?.results || []).filter(r => r.focusNode?.value === focusNodeId)
}

// ---------------------------------------------------------------- authoring actions

/** All <input>/<textarea> elements under `root`, descending into nested shadow roots. */
export function deepEditableInputs(root: ParentNode): Array<HTMLInputElement | HTMLTextAreaElement> {
    const found: Array<HTMLInputElement | HTMLTextAreaElement> = []
    const visit = (node: ParentNode) => {
        for (const el of Array.from(node.querySelectorAll('*'))) {
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                found.push(el)
            }
            const shadow = (el as HTMLElement).shadowRoot
            if (shadow) {
                visit(shadow)
            }
        }
    }
    visit(root)
    return found
}

/** Sets the root node's IRI through its IRI editor (requires data-show-node-ids).
 *  The value is set and the "change" event dispatched directly, which is what the editor
 *  listens to (src/dom-form/node.ts); userEvent.clear() cannot focus this input in the test browser. */
export async function authorRootIri(root: HTMLElement, iri: string): Promise<void> {
    const input = root.querySelector('input.node-id-editor') as HTMLInputElement | null
    if (!input) {
        throw new Error('no root IRI editor (input.node-id-editor) found; is data-show-node-ids set?')
    }
    input.value = iri
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await expect(input.value, 'IRI editor should keep the authored IRI (invalid or duplicate IRIs are reverted)').toBe(iri)
}

/** Human-readable dump of a validation report, for assertion messages. */
export function describeReport(report: ShaclValidationReport | undefined): string {
    if (!report) {
        return 'validation report: undefined'
    }
    const lines = report.results.map(r =>
        `  focus=${r.focusNode?.value} component=${r.constraintComponent?.value} path=${JSON.stringify((r as { path?: unknown }).path)}`)
    return `validation report: conforms=${report.conforms}, ${report.results.length} result(s)\n${lines.join('\n')}`
}

// ---------------------------------------------------------------- RDF oracles

export function parseQuads(turtle: string): Quad[] {
    return new N3Parser({ format: 'text/turtle' }).parse(turtle)
}

/** Oracle "Pass": the serialized output is isomorphic to the expected graph. */
export async function expectIsomorphic(form: ShaclFormElement, expectedTurtle: string): Promise<Quad[]> {
    const turtle = form.serialize()
    const actual = parseQuads(turtle)
    const expected = parseQuads(expectedTurtle)
    await expect(
        isomorphic(actual, expected),
        `serialized graph is not isomorphic to the expected graph.\n--- actual ---\n${turtle}\n--- expected ---\n${expectedTurtle}`,
    ).toBe(true)
    return actual
}

/** The temporary sh:targetNode used to validate the authored node must not leak into the output. */
export async function expectNoValidationTargetLeak(quads: Quad[]): Promise<void> {
    const leaked = quads.filter(q => q.predicate.value === SH_TARGET_NODE)
    await expect(leaked.length, 'internal validation target (sh:targetNode) leaked into the serialized graph').toBe(0)
}
