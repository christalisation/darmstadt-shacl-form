import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 5175
const origin = `http://127.0.0.1:${port}`
const coreIoShapes = readFileSync('rml/rml-core-io.ttl', 'utf8')
const shapesWithOntology = `${coreIoShapes}

rml:LogicalSource rdfs:subClassOf rml:AbstractLogicalSource .
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
                    if (performance.now() - started > 4000) {
                        reject(new Error('Timed out waiting for shacl-form initialization'))
                        return
                    }
                    setTimeout(tick, 25)
                }
                tick()
            })
        }

        async function createForm(shapeSubject, dataset = {}) {
            const form = document.createElement('shacl-form')
            Object.assign(form.dataset, dataset)
            form.dataset.shapes = shapes
            form.dataset.shapeSubject = shapeSubject
            document.body.appendChild(form)
            await waitForLoad(form)
            return form
        }

        function selectAlternativeByLabel(root, label) {
            const expectedPaths = {
                parent: 'http://w3id.org/rml/parent',
                subject: 'http://w3id.org/rml/subject',
                template: 'http://w3id.org/rml/template',
            }
            const alternatives = [...root.querySelectorAll('.alternative-path-constraint')]
            for (const alternative of alternatives) {
                const select = alternative.querySelector('select')
                const option = [...select.options].find(option => option.textContent.trim() === label)
                if (!option) {
                    continue
                }
                select.value = option.value
                select.dispatchEvent(new Event('change', { bubbles: true }))
                const instance = root.querySelector(`.property-instance[data-path="${CSS.escape(expectedPaths[label])}"]`)
                return {
                    label: instance?.querySelector('label')?.textContent,
                    editor: instance?.querySelector('.editor'),
                    path: instance?.dataset.path,
                }
            }
            return {}
        }

        const predicateObjectMap = await createForm('http://w3id.org/rml/shapes/RMLPredicateObjectMapShape')
        const predicateObjectMapText = predicateObjectMap.shadowRoot.textContent

        const childMap = await createForm('http://w3id.org/rml/shapes/RMLChildMapShape', {
            valuesNamespace: 'http://example.org/data/',
        })
        const childMapText = childMap.shadowRoot.textContent
        const childMapRoot = childMap.shadowRoot.querySelector('shacl-node')
        const childMapTemplate = selectAlternativeByLabel(childMapRoot, 'template')
        childMapTemplate.editor.value = '{child_id}'
        childMapTemplate.editor.dispatchEvent(new Event('change', { bubbles: true }))
        const childMapTurtle = childMap.serialize()

        const join = await createForm('http://w3id.org/rml/shapes/RMLJoinShape', {
            valuesNamespace: 'http://example.org/data/',
        })
        const joinRoot = join.shadowRoot.querySelector('shacl-node')
        const joinParent = selectAlternativeByLabel(joinRoot, 'parent')
        joinParent.editor.value = 'parent_id'
        joinParent.editor.dispatchEvent(new Event('change', { bubbles: true }))
        const joinTurtle = join.serialize()

        const triplesMap = await createForm('http://w3id.org/rml/shapes/RMLTriplesMapShape', {
            valuesNamespace: 'http://example.org/data/',
        })
        const triplesMapRoot = triplesMap.shadowRoot.querySelector('shacl-node')
        const triplesMapSubject = selectAlternativeByLabel(triplesMapRoot, 'subject')
        triplesMapSubject.editor.value = 'http://example.org/resource/{id}'
        triplesMapSubject.editor.dispatchEvent(new Event('change', { bubbles: true }))
        const logicalSourceProperty = [...triplesMap.shadowRoot.querySelectorAll('shacl-property')]
            .find(property => property.textContent.includes('logicalSource'))
        logicalSourceProperty?.addPropertyInstance()
        await new Promise(resolve => setTimeout(resolve, 250))
        const logicalSourceText = logicalSourceProperty?.textContent || ''
        const sourceProperty = [...logicalSourceProperty?.querySelectorAll('shacl-property') || []]
            .find(property => property.textContent.includes('rml:source'))
        sourceProperty?.addPropertyInstance()
        await new Promise(resolve => setTimeout(resolve, 250))
        const sourceText = sourceProperty?.textContent || ''
        const triplesMapTurtle = triplesMap.serialize()

        const genericRoots = document.createElement('shacl-form')
        genericRoots.dataset.shapes = shapes
        document.body.appendChild(genericRoots)
        await waitForLoad(genericRoots)
        const rootSelector = genericRoots.shadowRoot.querySelector('.root-selector-container select')
        const rootOptions = rootSelector ? [...rootSelector.options].map(option => option.textContent.trim()) : []

        return {
            predicateObjectMapText,
            childMapText,
            childMapTemplateLabel: childMapTemplate.label,
            childMapTemplatePath: childMapTemplate.path,
            childMapTurtle,
            joinParentLabel: joinParent.label,
            joinParentPath: joinParent.path,
            joinTurtle,
            triplesMapSubjectLabel: triplesMapSubject.label,
            triplesMapSubjectPath: triplesMapSubject.path,
            logicalSourceText,
            sourceText,
            triplesMapTurtle,
            rootOptions,
        }
    }, shapesWithOntology)

    async function checkRmlDemoRootIri(rootLabel, explicitIri) {
        await page.goto(`${origin}/rml/index.html`)
        return page.evaluate(async ({ rootLabel, explicitIri }) => {
        function waitForDemoLoad(form) {
            return new Promise((resolve, reject) => {
                const started = performance.now()
                const tick = () => {
                    if (
                        form.shadowRoot &&
                        !form.hasAttribute('loading') &&
                        form.dataset.shapes &&
                        form.shadowRoot.querySelector('.root-selector-container select')
                    ) {
                        resolve()
                        return
                    }
                    if (performance.now() - started > 5000) {
                        reject(new Error('Timed out waiting for RML demo initialization'))
                        return
                    }
                    setTimeout(tick, 25)
                }
                tick()
            })
        }

        const form = document.getElementById('shacl-form')
        await waitForDemoLoad(form)
        const selector = form.shadowRoot.querySelector('.root-selector-container select')
        const option = [...selector.options].find(option => option.textContent.trim() === rootLabel)
        if (!option) {
            throw new Error(`Root option not found: ${rootLabel}`)
        }
        selector.value = option.value
        selector.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise(resolve => setTimeout(resolve, 250))
        const root = form.shadowRoot.querySelector('shacl-node')
        const generatedRootId = root?.dataset.nodeId
        const input = root?.querySelector(':scope > .node-id-display .node-id-editor')
        input.value = explicitIri
        input.dispatchEvent(new Event('change', { bubbles: true }))

        return {
            valuesNamespace: form.dataset.valuesNamespace,
            showNodeIds: Object.prototype.hasOwnProperty.call(form.dataset, 'showNodeIds'),
            generatedRootId,
            customizedRootId: root?.dataset.nodeId,
        }
        }, { rootLabel, explicitIri })
    }

    const triplesMapDemoResult = await checkRmlDemoRootIri('TriplesMap', 'http://example.org/TM-images')
    const joinDemoResult = await checkRmlDemoRootIri('Join', 'http://example.org/Join-images')

    assert(result.predicateObjectMapText.includes('graph/graphMap'), 'PredicateObjectMap is missing graph/graphMap')
    assert(result.predicateObjectMapText.includes('predicate/predicateMap'), 'PredicateObjectMap is missing predicate/predicateMap')
    assert(result.predicateObjectMapText.includes('object/objectMap/quotedTriplesMap'), 'PredicateObjectMap is missing object/objectMap/quotedTriplesMap')
    assert(result.childMapText.includes('template/constant/reference/functionExecution'), 'ChildMap did not render inherited ExpressionMap structure')
    assert(result.childMapTemplateLabel === 'template', 'ChildMap alternative branch did not use the selected template label')
    assert(result.childMapTemplatePath === 'http://w3id.org/rml/template', 'ChildMap alternative branch did not use rml:template path')
    assert(result.childMapTurtle.includes('rml:template "{child_id}"'), 'ChildMap serialization did not use selected rml:template predicate')
    assert(result.joinParentLabel === 'parent', 'Join positive-control alternative branch did not use parent label')
    assert(result.joinParentPath === 'http://w3id.org/rml/parent', 'Join positive-control alternative branch did not use rml:parent path')
    assert(result.joinTurtle.includes('rml:parent "parent_id"'), 'Join serialization did not use selected rml:parent predicate')
    assert(result.triplesMapSubjectLabel === 'subject', 'TriplesMap alternative branch did not use the selected subject label')
    assert(result.triplesMapSubjectPath === 'http://w3id.org/rml/subject', 'TriplesMap alternative branch did not use rml:subject path')
    assert(result.triplesMapTurtle.includes('rml:subject <http://example.org/resource/{id}>'), 'TriplesMap serialization did not use selected rml:subject predicate')
    assert(result.logicalSourceText.includes('rml:source'), 'LogicalSource concrete authoring shape did not expose rml:source')
    assert(result.logicalSourceText.includes('rml:referenceFormulation'), 'LogicalSource did not expose same-focus referenceFormulation from node-level sh:node')
    assert(result.logicalSourceText.includes('rml:iterator'), 'LogicalSource did not expose same-focus iterator from node-level sh:node')
    assert(result.sourceText.includes('rml:null'), 'RML Source shape did not expose rml:null')
    assert(result.sourceText.includes('rml:compression'), 'RML Source shape did not expose rml:compression')
    assert(result.sourceText.includes('rml:encoding'), 'RML Source shape did not expose rml:encoding')
    assert(result.rootOptions.includes('child'), 'RML value-only child shape was incorrectly hidden from broad root options')
    assert(result.rootOptions.includes('TriplesMap'), 'Explicit top-level RML TriplesMap candidate disappeared from root options')
    assert(triplesMapDemoResult.valuesNamespace === 'http://example.org/', 'RML demo does not configure a readable value namespace')
    assert(triplesMapDemoResult.showNodeIds === true, 'RML demo does not expose node IDs')
    assert(triplesMapDemoResult.generatedRootId === 'http://example.org/triplesmap-1', 'RML demo did not create a readable TriplesMap IRI')
    assert(triplesMapDemoResult.customizedRootId === 'http://example.org/TM-images', 'RML demo did not preserve explicit TriplesMap IRI edit')
    assert(joinDemoResult.generatedRootId === 'http://example.org/join-1', 'RML demo did not create a readable Join IRI')
    assert(joinDemoResult.customizedRootId === 'http://example.org/Join-images', `RML demo did not preserve explicit Join IRI edit: ${joinDemoResult.customizedRootId}`)

    console.log('rml browser smoke passed')
} finally {
    if (browser) {
        await browser.close()
    }
    await server.close()
}
