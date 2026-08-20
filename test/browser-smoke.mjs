import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 5174
const origin = `http://127.0.0.1:${port}`

const shapes = `
  @prefix ex: <http://example.org/> .
  @prefix sh: <http://www.w3.org/ns/shacl#> .
  @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

    ex:SimpleShape a sh:NodeShape ;
    sh:name "Simple" ;
    sh:property [
      sh:path ex:title ;
      sh:name "Title" ;
      sh:datatype xsd:string ;
      sh:minCount 1
    ] ;
    sh:property [
	      sh:path [ sh:alternativePath ( ex:email ex:mbox ex:childChoice ex:fax ) ] ;
	      sh:name "Contact path" ;
	      sh:maxCount 1
	    ] ;
    sh:property [
      sh:path ex:email ;
      sh:name "Email"
    ] ;
	    sh:property [
	      sh:path ex:mbox ;
	      sh:name "Mailbox"
	    ] ;
	    sh:property [
	      sh:path ex:childChoice ;
	      sh:name "Child choice" ;
	      sh:or (
	        [ sh:node ex:ChildShape ]
	        [ sh:node ex:SecondShape ]
	      )
	    ] ;
    sh:property [
      sh:path ex:child ;
      sh:name "Child" ;
      sh:nodeKind sh:BlankNodeOrIRI ;
      sh:node ex:ChildShape
    ] ;
    sh:property [
      sh:path ex:choice ;
      sh:name "Choice" ;
      sh:or (
        [ sh:node ex:ChildShape ]
        [ sh:minLength 2 ]
      )
    ] .

  ex:ChildShape a sh:NodeShape ;
    sh:name "Child" ;
    sh:property [
      sh:path ex:childName ;
      sh:name "Child name" ;
      sh:datatype xsd:string
    ] .

  ex:SecondShape a sh:NodeShape ;
    sh:name "Second" ;
    sh:nodeKind sh:BlankNode ;
    sh:property [
      sh:path ex:secondValue ;
      sh:name "Second value" ;
      sh:datatype xsd:string
    ] .
`

function assert(condition, message) {
    if (!condition) {
        throw new Error(message)
    }
}

const server = await createServer({
    root: process.cwd(),
    server: { host: '127.0.0.1', port, strictPort: true },
    logLevel: 'silent',
})

let browser
try {
    await server.listen()
    browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    const page = await browser.newPage()
    const notFoundUrls = []
    page.on('response', response => {
        if (response.status() === 404) {
            notFoundUrls.push(response.url())
        }
    })
    page.on('pageerror', error => {
        throw error
    })
    page.on('console', message => {
        if (message.type() === 'error') {
            console.error(message.text())
        }
    })
    await page.goto(`${origin}/demo/index.html`)
    await page.evaluate(async (moduleUrl) => {
        await import(moduleUrl)
    }, `${origin}/src/form-default.ts`)

    const result = await page.evaluate(async (shapes) => {
        function waitForLoad(form) {
            return new Promise((resolve, reject) => {
                const started = performance.now()
                const tick = () => {
                    if (!form.hasAttribute('loading')) {
                        resolve()
                        return
                    }
                    if (performance.now() - started > 3000) {
                        reject(new Error('Timed out waiting for shacl-form initialization'))
                        return
                    }
                    setTimeout(tick, 25)
                }
                tick()
            })
        }

        async function createForm(dataset = {}) {
            const form = document.createElement('shacl-form')
            Object.assign(form.dataset, dataset)
            form.dataset.shapes = shapes
            document.body.appendChild(form)
            await waitForLoad(form)
            return form
        }

        async function addAlternativePathValue(property, path) {
            const addButton = property?.querySelector(':scope > .add-button')
            const item = addButton
                ? [...addButton.querySelectorAll('li[data-value][data-path]')]
                    .find(item => item.dataset.path === path)
                : undefined
            if (!addButton || !item) {
                throw new Error(`Alternative add action not found for ${path}`)
            }
            addButton.value = item.dataset.value
            addButton.dispatchEvent(new Event('change', { bubbles: true }))
            await new Promise(resolve => setTimeout(resolve, 100))
            return [...property.children]
                .find(child => child.classList.contains('property-instance') && child.dataset.path === path)
        }

        function addMenuActionLabels(property) {
            return [...property?.querySelectorAll(':scope > .add-button li[data-value]') || []]
                .map(item => item.textContent.trim())
        }

        function addMenuActionLabelsForPath(property, path) {
            return [...property?.querySelectorAll(':scope > .add-button li[data-value][data-path]') || []]
                .filter(item => item.dataset.path === path)
                .map(item => item.textContent.trim())
        }

        function addMenuText(property) {
            return property?.querySelector(':scope > .add-button')?.textContent || ''
        }

        const simple = await createForm({
            shapeSubject: 'http://example.org/SimpleShape',
            valuesNamespace: 'http://data.example/',
            showNodeIds: '',
        })
        const root = simple.shadowRoot.querySelector('shacl-node')
        const generatedRootId = root?.dataset.nodeId
        const rootIdInput = root?.querySelector(':scope > .node-id-display .node-id-editor')
        rootIdInput.value = 'http://data.example/custom-root'
        rootIdInput.dispatchEvent(new Event('change', { bubbles: true }))
        const customizedRootId = root?.dataset.nodeId
        const titleLabel = root?.querySelector('shacl-property label')?.textContent
        const nestedControl = [...root?.querySelectorAll('shacl-property') || []]
            .find(property => property.template?.label === 'Child')
        const logicalChoiceOptions = [...root?.querySelectorAll('shacl-property') || []]
            .find(property => property.template?.label === 'Choice')
            ?.querySelector(':scope > .shacl-or-constraint > div > select')
        const logicalChoiceLabels = logicalChoiceOptions
            ? [...logicalChoiceOptions.options].map(option => option.textContent)
            : []
        const contactProperty = [...root?.querySelectorAll('shacl-property') || []]
            .find(property => property.template?.label === 'Contact path')
        const contactAddLabels = addMenuActionLabels(contactProperty)
        const contactMenuText = addMenuText(contactProperty)
        nestedControl?.addPropertyInstance()
        await new Promise(resolve => setTimeout(resolve, 250))
        const nestedNodeAfterClick = nestedControl?.querySelector('shacl-node')
        const nestedNodeId = nestedNodeAfterClick?.dataset.nodeId
        const rootIdLabel = root?.querySelector(':scope > .node-id-display .node-id-label')?.textContent
        const nestedIdLabel = nestedNodeAfterClick?.querySelector(':scope > .node-id-display .node-id-label')?.textContent
        const childEditor = nestedNodeAfterClick?.querySelector('shacl-property .property-instance .editor')
        childEditor.value = 'Child value'
        childEditor.dispatchEvent(new Event('change', { bubbles: true }))
        root.nodeCollection.commitRootNode(root)
        contactProperty?.refreshReusableOptions()
        const emailBranchActionsAfterReuse = addMenuActionLabelsForPath(contactProperty, 'http://example.org/email')
        const childChoiceBranchActionsAfterReuse = addMenuActionLabelsForPath(contactProperty, 'http://example.org/childChoice')
        const selectedAlternativeInstance = await addAlternativePathValue(contactProperty, 'http://example.org/mbox')
        const selectedAlternativeLabel = selectedAlternativeInstance?.querySelector('label')?.textContent
        const selectedAlternativeEditor = selectedAlternativeInstance?.querySelector('.editor')
        if (!selectedAlternativeEditor) {
            throw new Error(`Selected mbox alternative did not create an editor: ${contactProperty?.innerHTML}`)
        }
        selectedAlternativeEditor.value = 'mailto:a@example.org'
        selectedAlternativeEditor.dispatchEvent(new Event('change', { bubbles: true }))

        const multi = await createForm()
        const selector = multi.shadowRoot.querySelector('.root-selector-container select')
        const rootOptions = selector ? [...selector.options].map(option => option.textContent) : []

        const blank = await createForm({
            shapeSubject: 'http://example.org/SecondShape',
            showNodeIds: '',
        })
        const blankNodeDisplay = blank.shadowRoot.querySelector('shacl-node > .node-id-display')
        const blankNodeDisplayLabel = blankNodeDisplay?.querySelector('.node-id-label')?.textContent
        const blankNodeDisplayValue = blankNodeDisplay?.querySelector('.node-id-value')?.textContent
        const blankNodeHasIriEditor = Boolean(blankNodeDisplay?.querySelector('.node-id-editor'))

        const invalidReport = await simple.validate(false, true)
        const editor = simple.shadowRoot.querySelector('.property-instance .editor')
        editor.value = 'A title'
        editor.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise(resolve => setTimeout(resolve, 0))
        const validReport = await simple.validate(false, true)
        const turtle = simple.serialize()

        return {
            hasRoot: Boolean(root),
            titleLabel,
            hasNestedControl: Boolean(nestedControl),
            logicalChoiceLabels,
            hasNestedNodeAfterClick: Boolean(nestedNodeAfterClick),
            generatedRootId,
            customizedRootId,
            nestedNodeId,
            rootIdLabel,
            nestedIdLabel,
            blankNodeDisplayLabel,
            blankNodeDisplayValue,
            blankNodeHasIriEditor,
            contactAddLabels,
            contactMenuText,
            emailBranchActionsAfterReuse,
            childChoiceBranchActionsAfterReuse,
            selectedAlternativeLabel,
            rootOptions,
            invalidConforms: invalidReport.conforms,
            validConforms: validReport.conforms,
            turtle,
        }
    }, shapes)

    assert(result.hasRoot, 'simple NodeShape did not render')
    assert(result.titleLabel === 'Title', 'simple property label did not render')
    assert(result.hasNestedControl, 'nested sh:node create/link control did not render')
    assert(result.logicalChoiceLabels.includes('Child'), 'anonymous sh:node logical branch did not use referenced node-shape label')
    assert(result.logicalChoiceLabels.includes('Alternative 2'), `anonymous logical branch without semantic label did not use deterministic fallback label: ${result.logicalChoiceLabels.join(', ')}`)
    assert(result.hasNestedNodeAfterClick, 'nested sh:node form did not render after using create control')
    assert(result.generatedRootId === 'http://data.example/simple-1', 'readable generated root IRI was not used')
    assert(result.customizedRootId === 'http://data.example/custom-root', 'custom root IRI was not preserved')
    assert(/^http:\/\/data\.example\/child-\d+$/.test(result.nestedNodeId), `nested node did not receive independent readable identity: ${result.nestedNodeId}`)
    assert(result.rootIdLabel === 'IRI:', 'editable NamedNode identifier label is not IRI')
    assert(result.nestedIdLabel === 'IRI:', 'nested BlankNodeOrIRI NamedNode identifier label is not IRI')
    assert(result.blankNodeDisplayLabel === 'Blank node:' && result.blankNodeDisplayValue.startsWith('_:'), 'generated blank node did not use non-editable Blank node label')
    assert(result.blankNodeHasIriEditor === false, 'generated blank node displayed an editable IRI editor')
    assert(result.contactAddLabels.some(label => label.includes('Add Email value')), `alternative path add menu did not expose Email action: ${result.contactAddLabels.join(', ')}`)
    assert(result.contactAddLabels.some(label => label.includes('Add Mailbox value')), `alternative path add menu did not expose Mailbox action: ${result.contactAddLabels.join(', ')}`)
    assert(result.contactAddLabels.some(label => label.includes('Create new Child choice')), `alternative path add menu did not expose anonymous sh:or node-valued branch action: ${result.contactAddLabels.join(', ')}`)
    assert(result.contactMenuText.includes('fax') && result.contactMenuText.includes('No branch-specific authoring constraints found'), `under-specified alternative path branch was not shown as unavailable: ${result.contactMenuText}`)
    assert(!result.contactAddLabels.some(label => label.includes('fax')), `under-specified alternative path branch exposed a misleading add action: ${result.contactAddLabels.join(', ')}`)
    assert(!result.emailBranchActionsAfterReuse.some(label => label.includes('http://data.example/child')), `scalar alternative branch exposed reusable node actions: ${result.emailBranchActionsAfterReuse.join(', ')}`)
    assert(result.childChoiceBranchActionsAfterReuse.some(label => label.includes('http://data.example/child')), `node-valued alternative branch did not expose compatible reusable node: ${result.childChoiceBranchActionsAfterReuse.join(', ')}`)
    assert(result.selectedAlternativeLabel === 'Mailbox', 'alternative path selection did not update the visible label')
    assert(result.rootOptions.includes('Simple') && result.rootOptions.includes('Second'), 'multiple-root selector did not render expected options')
    assert(result.invalidConforms === false, 'SHACL validation did not catch missing required value')
    assert(result.validConforms === true, 'SHACL validation did not pass after value entry')
    assert(result.turtle.includes('A title') && result.turtle.includes('ex:title'), 'serialization did not include entered RDF')
    assert(result.turtle.includes('<http://data.example/custom-root>'), 'serialization did not use custom root IRI')
    assert(result.turtle.includes(`<${result.nestedNodeId}>`), 'serialization did not preserve nested node identity')
    assert(result.turtle.includes(`ex:child <${result.nestedNodeId}>`), 'serialization did not link parent to nested node')
    assert(result.turtle.includes('ex:childName "Child value"'), 'serialization did not include nested node data')
    assert(result.turtle.includes('ex:mbox "mailto:a@example.org"'), 'serialization did not use the selected alternative path')

    const uniqueNotFoundUrls = [...new Set(notFoundUrls)]
    console.log(`browser smoke passed${uniqueNotFoundUrls.length ? `; 404 URLs: ${uniqueNotFoundUrls.join(', ')}` : ''}`)
} finally {
    if (browser) {
        await browser.close()
    }
    await server.close()
}
