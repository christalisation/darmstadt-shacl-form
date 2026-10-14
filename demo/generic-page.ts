type SerializableForm = HTMLElement & { serialize(): string }

function updateOutput(form: SerializableForm, output: HTMLElement, valid?: boolean): void {
    try {
        output.innerText = form.serialize()
    } catch {
        output.innerText = ''
    }
    output.classList.toggle('valid', valid !== false)
    output.classList.toggle('invalid', valid === false)
}

function clearOutput(output: HTMLElement): void {
    output.innerText = ''
    output.classList.remove('valid', 'invalid')
}

export function bindGenericDemoPage(root: ParentNode): void {
    const find = <T extends Element>(id: string): T => {
        const element = root.querySelector<T>(`#${id}`)
        if (!element) throw new Error(`Generic demo page is missing #${id}`)
        return element
    }

    const form = find<SerializableForm>('shacl-form')
    const shapesEditor = find<HTMLTextAreaElement>('shapes-editor')
    const shapesUrl = find<HTMLInputElement>('shapes-url')
    const output = find<HTMLElement>('rdf-output')
    const applyShapesButton = find<HTMLButtonElement>('apply-shapes-btn')
    const loadShapesUrlButton = find<HTMLButtonElement>('load-shapes-url-btn')
    const exportButton = find<HTMLButtonElement>('export-btn')

    // The app page and Storybook use the same listeners for output and validation feedback.
    form.addEventListener('change', event => {
        updateOutput(form, output, (event as CustomEvent<{ valid?: boolean }>).detail?.valid)
    })
    form.addEventListener('submit', event => {
        event.preventDefault()
        updateOutput(form, output, true)
    })
    applyShapesButton.addEventListener('click', () => {
        form.removeAttribute('data-shapes-url')
        const shapes = shapesEditor.value.trim()
        if (shapes) form.dataset.shapes = shapes
        else form.removeAttribute('data-shapes')
        clearOutput(output)
    })
    loadShapesUrlButton.addEventListener('click', () => {
        const url = shapesUrl.value.trim()
        form.removeAttribute('data-shapes')
        if (url) form.dataset.shapesUrl = url
        else form.removeAttribute('data-shapes-url')
        clearOutput(output)
    })
    exportButton.addEventListener('click', () => {
        const link = document.createElement('a')
        link.href = URL.createObjectURL(new Blob([form.serialize()], { type: 'text/turtle' }))
        link.download = 'shacl-form-output.ttl'
        link.click()
    })
}
