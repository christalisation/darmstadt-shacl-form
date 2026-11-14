import type { Store } from 'n3'

/** Shared helpers for unit tests that render <shacl-form> in happy-dom. */

export type TestForm = HTMLElement & {
    toRDF: () => Store,
    serialize: (format?: string) => string,
    validate: (ignoreEmptyValues?: boolean) => Promise<{ conforms: boolean }>,
    nodeRegistry: { committedRootNodes: unknown[] },
}

let originalAttachInternals: typeof HTMLElement.prototype.attachInternals | undefined
let polyfilled = false

/** Registers the custom elements. happy-dom lacks ElementInternals, which the widgets require. */
export async function defineShaclForm(): Promise<void> {
    originalAttachInternals = HTMLElement.prototype.attachInternals
    if (!originalAttachInternals) {
        polyfilled = true
        Object.defineProperty(HTMLElement.prototype, 'attachInternals', {
            configurable: true,
            value: () => ({
                checkValidity: () => true,
                reportValidity: () => true,
                setFormValue: () => undefined,
                setValidity: () => undefined,
                validationMessage: '',
                validity: {},
                willValidate: true,
            }),
        })
    }
    await import('../../src/form-default.ts')
}

export function restoreDom(): void {
    if (polyfilled) {
        delete (HTMLElement.prototype as Partial<typeof HTMLElement.prototype>).attachInternals
        polyfilled = false
    }
}

export async function renderForm(attributes: Record<string, string>): Promise<TestForm> {
    const form = document.createElement('shacl-form') as TestForm
    for (const [name, value] of Object.entries(attributes)) {
        form.setAttribute(name, value)
    }
    document.body.appendChild(form)
    await waitUntilLoaded(form)
    return form
}

export function waitUntilLoaded(form: HTMLElement): Promise<void> {
    return new Promise((resolve, reject) => {
        const started = Date.now()
        const poll = () => {
            if (!form.hasAttribute('loading')) {
                resolve()
            } else if (Date.now() - started > 3000) {
                reject(new Error('Timed out waiting for shacl-form to load'))
            } else {
                setTimeout(poll, 20)
            }
        }
        // Initialisation is debounced, so the loading attribute is not removed synchronously.
        setTimeout(poll, 250)
    })
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/** Selects a root shape by its label in the multi-root selector and returns the displayed root node element. */
export async function selectRootShape(form: TestForm, label: string): Promise<HTMLElement & { nodeId: { termType: string, value: string } }> {
    const root = form.shadowRoot!
    const backLink = root.querySelector<HTMLElement>('.breadcrumb-container a')
    backLink?.click()
    const selector = root.querySelector('.root-selector-container select') as HTMLSelectElement
    const option = [...selector.options].find(candidate => candidate.textContent?.trim() === label)
    if (!option) {
        throw new Error(`Root shape "${label}" not found; available: ${[...selector.options].map(o => o.textContent?.trim()).join(', ')}`)
    }
    selector.value = option.value
    selector.dispatchEvent(new Event('change'))
    await sleep(50)
    return root.querySelector('shacl-node') as HTMLElement & { nodeId: { termType: string, value: string } }
}

export async function setEditorValue(scope: ParentNode, path: string, value: string): Promise<void> {
    const instance = [...scope.querySelectorAll<HTMLElement>('.property-instance')].find(elem => elem.dataset.path === path)
    const editor = instance?.querySelector('.editor') as (HTMLElement & { value: string }) | null
    if (!editor) {
        throw new Error(`No editor found for path ${path}`)
    }
    editor.value = value
    editor.dispatchEvent(new Event('change', { bubbles: true }))
    await sleep(100)
}

/** Clicks "Add <root>" so the active root becomes a committed, reusable resource. */
export async function commitActiveRoot(form: TestForm): Promise<void> {
    const before = form.nodeRegistry.committedRootNodes.length
    form.shadowRoot!.querySelector<HTMLElement>('.commit-root-button')!.click()
    await sleep(400)
    if (form.nodeRegistry.committedRootNodes.length !== before + 1) {
        throw new Error('Root node was not committed')
    }
}

/** Chooses the "reuse from this form" entry of a property's add menu for the given node. */
export async function reuseNode(property: Element, node: { termType: string, value: string }): Promise<void> {
    const addButton = property.querySelector(':scope > .add-button') as HTMLElement & { value: string }
    const entry = [...addButton.querySelectorAll<HTMLElement>('li[data-value]')].find(item => {
        try {
            const term = JSON.parse(item.dataset.value!)
            return term.termType === node.termType && term.value === node.value
        } catch {
            return false
        }
    })
    if (!entry) {
        throw new Error(`Add menu offers no entry for ${node.termType} ${node.value}: ${addButton.textContent}`)
    }
    addButton.value = entry.dataset.value!
    addButton.dispatchEvent(new Event('change'))
    await sleep(100)
}
