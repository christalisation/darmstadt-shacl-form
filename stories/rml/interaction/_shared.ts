// Shared helpers for the RML interaction (play()) regression stories.
// Deliberately named without a `.stories.ts` suffix so Storybook's `stories`
// glob does not try to index it as a stories file.
//
// These are a small, typed port of the interaction techniques already
// proven in test/rml-browser-smoke.mjs (findProperty-by-.template.label,
// exact-data-path matching for alternativePath reuse items, the RokitSelect
// add-button's value+change-event protocol) — see the report in the PR
// description / conversation history for why exact-path matching matters
// (naive substring matching on button text finds "Create new SubjectMap..."
// before "Add subject value" for a label of "subject").
//
// <shacl-form> is the only shadow boundary that matters here: it attaches an
// OPEN shadow root (src/form.ts `attachShadow({ mode: 'open' })`), and
// nested <shacl-node>/<shacl-property> elements do NOT attach their own
// shadow roots — they are plain light-DOM descendants inside it. RokitSelect
// (the add-button widget) DOES attach its own open shadow root, but the
// actual <li> reuse-menu items are light-DOM children slotted into it
// (see src/dom-form/property.ts refreshAddButtonOptions /
// refreshAlternativePathAddButtonOptions), so a single
// `form.shadowRoot.querySelector(...)` reaches everything needed below
// without piercing a second shadow boundary.
import { waitFor } from 'storybook/test'

export const RML_PREDICATE_PATHS: Record<string, string> = {
    subject: 'http://w3id.org/rml/subject',
    subjectMap: 'http://w3id.org/rml/subjectMap',
    objectMap: 'http://w3id.org/rml/objectMap',
    object: 'http://w3id.org/rml/object',
    predicate: 'http://w3id.org/rml/predicate',
    predicateMap: 'http://w3id.org/rml/predicateMap',
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/** Waits for the <shacl-form> custom element to finish its async shapes/values load. */
export async function waitForFormReady(form: HTMLElement): Promise<void> {
    await waitFor(() => {
        if (form.hasAttribute('loading')) {
            throw new Error('shacl-form still loading')
        }
    }, { timeout: 4000, interval: 25 })
}

function shadow(form: HTMLElement): ShadowRoot {
    const root = (form as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    if (!root) {
        throw new Error('shacl-form has no shadow root (expected an open shadow root from src/form.ts)')
    }
    return root
}

/** Selects a NodeShape by its rendered label in the multi-root selector, returning the resulting <shacl-node>. */
export function selectRootShape(form: HTMLElement, label: string): HTMLElement {
    const selector = shadow(form).querySelector<HTMLSelectElement>('.root-selector-container select')
    if (!selector) {
        throw new Error('no root selector found (form may not be configured as multi-root)')
    }
    const option = [...selector.options].find(o => o.textContent?.trim() === label)
    if (!option) {
        throw new Error(`no root option labelled "${label}"; available: ${[...selector.options].map(o => o.textContent?.trim()).join(', ')}`)
    }
    selector.value = option.value
    selector.dispatchEvent(new Event('change', { bubbles: true }))
    const node = shadow(form).querySelector<HTMLElement>('shacl-node')
    if (!node) {
        throw new Error(`selecting root shape "${label}" did not render a shacl-node`)
    }
    return node
}

interface ShaclPropertyTemplateLike {
    label: string
}
interface ShaclPropertyElementLike extends HTMLElement {
    template?: ShaclPropertyTemplateLike
    addPropertyInstance(): HTMLElement
}

/** Finds a direct <shacl-property> descendant by its Form Shape label (e.g. "logicalSource", "object/objectMap/quotedTriplesMap"). */
export function findProperty(root: Element, label: string): ShaclPropertyElementLike | undefined {
    return [...root.querySelectorAll<ShaclPropertyElementLike>('shacl-property')]
        .find(property => property.template?.label === label)
}

function addButtonOf(property: Element): HTMLElement {
    const addButton = property.querySelector<HTMLElement>(':scope > .add-button')
    if (!addButton) {
        throw new Error('property has no .add-button (RokitSelect) — it may not support creating/reusing values')
    }
    return addButton
}

/**
 * Picks the "Create new X..." / "Add X value" action for one branch of an
 * sh:alternativePath add-button, matched by the branch's exact predicate IRI
 * (RML_PREDICATE_PATHS), not by substring-matching the visible label — the
 * add-button lists every branch's header text together (e.g. "subjectMap"
 * and "subject" both appear), and "subject" is a substring of "subjectMap".
 */
export async function createAlternativePathBranch(property: ShaclPropertyElementLike, branchLabel: string): Promise<HTMLElement> {
    const addButton = addButtonOf(property) as HTMLElement & { value: string }
    const expectedPath = RML_PREDICATE_PATHS[branchLabel]
    if (!expectedPath) {
        throw new Error(`no known predicate IRI for branch label "${branchLabel}" — add it to RML_PREDICATE_PATHS`)
    }
    const item = [...addButton.querySelectorAll<HTMLLIElement>('li[data-value][data-path].large')]
        .find(li => li.dataset.path === expectedPath)
    if (!item) {
        throw new Error(`no "create" action found for branch "${branchLabel}" (path ${expectedPath}): ${addButton.innerHTML}`)
    }
    addButton.value = item.dataset.value!
    addButton.dispatchEvent(new Event('change', { bubbles: true }))
    await sleep(150)
    const instance = property.querySelector<HTMLElement>(`:scope > .property-instance[data-path="${CSS.escape(expectedPath)}"]`)
    if (!instance) {
        throw new Error(`creating branch "${branchLabel}" did not render a .property-instance for path ${expectedPath}`)
    }
    return instance
}

/** Fills a plain scalar editor (input/select) inside a property-instance and dispatches change. */
export function fillEditor(instance: Element, value: string): void {
    const editor = instance.querySelector<HTMLInputElement | HTMLSelectElement>('.editor')
    if (!editor) {
        throw new Error('no .editor found in property instance')
    }
    editor.value = value
    editor.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * Triggers the "reuse" (link-existing) action for an sh:alternativePath
 * branch's add-button, matched by exact predicate IRI AND the visible node
 * id text (mirrors src/dom-form/property.ts's
 * refreshAlternativePathAddButtonOptions "Or link existing:" items, which
 * carry both data-path and data-value).
 */
export async function reuseAlternativePathBranch(property: ShaclPropertyElementLike, branchLabel: string, existingNodeId: string): Promise<HTMLElement> {
    const addButton = addButtonOf(property) as HTMLElement & { value: string }
    const expectedPath = RML_PREDICATE_PATHS[branchLabel]
    if (!expectedPath) {
        throw new Error(`no known predicate IRI for branch label "${branchLabel}" — add it to RML_PREDICATE_PATHS`)
    }
    const item = [...addButton.querySelectorAll<HTMLLIElement>('li[data-value][data-path]')]
        .find(li => li.dataset.path === expectedPath && li.textContent?.includes(existingNodeId))
    if (!item) {
        throw new Error(`no reuse action found for branch "${branchLabel}" -> ${existingNodeId}: ${addButton.innerHTML}`)
    }
    addButton.value = item.dataset.value!
    addButton.dispatchEvent(new Event('change', { bubbles: true }))
    await sleep(200)
    const instance = property.querySelector<HTMLElement>(`:scope > .property-instance[data-path="${CSS.escape(expectedPath)}"]`)
    if (!instance) {
        throw new Error(`reusing branch "${branchLabel}" -> ${existingNodeId} did not render a .property-instance for path ${expectedPath}`)
    }
    return instance
}

/**
 * Triggers the plain (non-alternativePath) "Or link existing:" reuse action
 * on a property's add-button, matched by the visible node id text — mirrors
 * src/dom-form/property.ts's refreshAddButtonOptions, whose <li> items carry
 * only data-value (no data-path).
 */
export async function reuseExistingNode(property: ShaclPropertyElementLike, existingNodeId: string): Promise<HTMLElement> {
    const addButton = addButtonOf(property) as HTMLElement & { value: string }
    const item = [...addButton.querySelectorAll<HTMLLIElement>('li[data-value]')]
        .find(li => li.textContent?.trim() === existingNodeId)
    if (!item) {
        throw new Error(`no reuse action found for existing node ${existingNodeId}: ${addButton.innerHTML}`)
    }
    addButton.value = item.dataset.value!
    addButton.dispatchEvent(new Event('change', { bubbles: true }))
    await sleep(200)
    const instance = property.querySelector<HTMLElement>(':scope > .property-instance')
    if (!instance) {
        throw new Error(`reusing existing node ${existingNodeId} did not render a .property-instance`)
    }
    return instance
}
