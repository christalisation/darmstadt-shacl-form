// Shared RML interaction helpers. Exact predicate-path matching avoids confusing labels such as 'subject' and 'subjectMap'.

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

// Wait until the form has loaded its shapes and values.
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

// Select a root by label and return its rendered node.
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

// Find a property by its Form Shape label.
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

// Match the branch by predicate IRI because labels such as "subject" and "subjectMap" overlap.
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

// Match both the branch predicate and existing node ID to select the intended reuse action.
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

// Select a plain reuse action by the existing node ID.
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
