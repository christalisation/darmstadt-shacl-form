import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 5175
const origin = `http://127.0.0.1:${port}`
const coreIoShapes = readFileSync('rml/rml-core-io.ttl', 'utf8')
const authoringOverlay = readFileSync('rml/authoring-overlay.ttl', 'utf8')
const shapesWithOntology = `${coreIoShapes}

${authoringOverlay}

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
    const notFoundUrls = []
    page.on('response', response => {
        if (response.status() === 404) {
            notFoundUrls.push(response.url())
        }
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
                subjectMap: 'http://w3id.org/rml/subjectMap',
                predicate: 'http://w3id.org/rml/predicate',
                objectMap: 'http://w3id.org/rml/objectMap',
                reference: 'http://w3id.org/rml/reference',
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

        async function selectAlternativeInProperty(property, label) {
            const select = property?.querySelector('.alternative-path-constraint select')
            const option = select ? [...select.options].find(option => option.textContent.trim() === label) : undefined
            if (!select || !option) {
                throw new Error(`Alternative not found: ${label}`)
            }
            select.value = option.value
            select.dispatchEvent(new Event('change', { bubbles: true }))
            await new Promise(resolve => setTimeout(resolve, 100))
            return property.querySelector(`.property-instance[data-path], .shacl-or-constraint[data-path]`)
        }

        async function selectFirstLogicalOption(container) {
            const select = container?.querySelector(':scope > div > select')
            if (select) {
                const firstOption = [...select.options].find(option => option.value !== '')
                select.value = firstOption?.value || ''
                select.dispatchEvent(new Event('change', { bubbles: true }))
                await new Promise(resolve => setTimeout(resolve, 100))
            }
        }

        function logicalOptionLabels(container) {
            const select = container?.querySelector(':scope > div > select')
            return select ? [...select.options].map(option => option.textContent.trim()) : []
        }

        async function selectLogicalOptionByLabel(container, label) {
            const select = container?.querySelector(':scope > div > select')
            const option = select ? [...select.options].find(option => option.textContent.trim().includes(label)) : undefined
            if (!select || !option) {
                throw new Error(`Logical option not found: ${label}`)
            }
            select.value = option.value
            select.dispatchEvent(new Event('change', { bubbles: true }))
            await new Promise(resolve => setTimeout(resolve, 100))
        }

        function visibleText(root) {
            return root?.textContent || root?.innerText || ''
        }

        function visibleLogicalConstraintCount(root) {
            return [...root?.querySelectorAll('.shacl-or-constraint') || []]
                .filter(element => {
                    const style = getComputedStyle(element)
                    return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden'
                })
                .length
        }

        function findProperty(root, label) {
            return [...root.querySelectorAll('shacl-property')]
                .find(property => property.template?.label === label)
        }

        async function addNestedValue(property) {
            property.addPropertyInstance()
            await new Promise(resolve => setTimeout(resolve, 150))
            const nodes = [...property.querySelectorAll('shacl-node')]
            return nodes[nodes.length - 1]
        }

        function editorForProperty(root, label) {
            const property = findProperty(root, label)
            const editor = property?.querySelector('.property-instance .editor')
            if (!editor) {
                throw new Error(`Editor not found: ${label}`)
            }
            return editor
        }

        async function fillAlternativeEditor(root, aggregateLabel, optionLabel, value) {
            const property = findProperty(root, aggregateLabel)
            const instance = await selectAlternativeInProperty(property, optionLabel)
            const editor = instance.querySelector('.editor')
            if (!editor) {
                throw new Error(`Editor not found for ${optionLabel}`)
            }
            editor.value = value
            editor.dispatchEvent(new Event('change', { bubbles: true }))
            return instance
        }

        async function fillPredicateObjectMap(pomNode, predicateIri, reference) {
            await fillAlternativeEditor(pomNode, 'predicate/predicateMap', 'predicate', predicateIri)
            const objectAlternative = findProperty(pomNode, 'object/objectMap/quotedTriplesMap')
            const objectMapInstance = await selectAlternativeInProperty(objectAlternative, 'objectMap')
            const objectMapOptionLabels = logicalOptionLabels(objectMapInstance)
            await selectFirstLogicalOption(objectMapInstance)
            const objectMapNode = objectMapInstance.querySelector('shacl-node') || objectAlternative.querySelector('shacl-node')
            if (!objectMapNode) {
                throw new Error(`ObjectMap node was not rendered: ${objectAlternative?.innerHTML}`)
            }
            await fillAlternativeEditor(objectMapNode, 'template/constant/reference/functionExecution', 'reference', reference)
            return {
                objectMapNode,
                objectMapOptionLabels,
                objectMapNodeId: objectMapNode.dataset.nodeId,
                objectMapText: visibleText(objectMapNode),
                objectMapVisibleLogicalConstraintCount: visibleLogicalConstraintCount(objectMapNode),
            }
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

        const acceptanceForm = await createForm('http://w3id.org/rml/shapes/RMLTriplesMapShape', {
            valuesNamespace: 'http://example.org/',
            showNodeIds: '',
        })
        const acceptanceRoot = acceptanceForm.shadowRoot.querySelector('shacl-node')
        const rootIri = acceptanceRoot.querySelector(':scope > .node-id-display .node-id-editor')
        rootIri.value = 'http://example.org/TM-images'
        rootIri.dispatchEvent(new Event('change', { bubbles: true }))

        const acceptanceLogicalSourceProperty = findProperty(acceptanceRoot, 'logicalSource')
        const acceptanceLogicalSourceNode = await addNestedValue(acceptanceLogicalSourceProperty)
        const acceptanceSourceProperty = findProperty(acceptanceLogicalSourceNode, 'rml:source')
        const acceptanceSourceNode = await addNestedValue(acceptanceSourceProperty)
        const rootEditor = editorForProperty(acceptanceSourceNode, 'rml:root')
        rootEditor.value = '<http://w3id.org/rml/MappingDirectory>'
        rootEditor.dispatchEvent(new Event('change', { bubbles: true }))
        const pathEditor = editorForProperty(acceptanceSourceNode, 'rml:path')
        pathEditor.value = 'images.json'
        pathEditor.dispatchEvent(new Event('change', { bubbles: true }))
        const referenceFormulationEditor = editorForProperty(acceptanceLogicalSourceNode, 'rml:referenceFormulation')
        referenceFormulationEditor.value = 'http://w3id.org/rml/JSONPath'
        referenceFormulationEditor.dispatchEvent(new Event('change', { bubbles: true }))
        const iteratorEditor = editorForProperty(acceptanceLogicalSourceNode, 'rml:iterator')
        iteratorEditor.value = '$.Images[*]'
        iteratorEditor.dispatchEvent(new Event('change', { bubbles: true }))

        const subjectMapProperty = findProperty(acceptanceRoot, 'subjectMap/subject/quotedTriplesMap')
        const subjectMapInstance = await selectAlternativeInProperty(subjectMapProperty, 'subjectMap')
        const subjectMapOptionLabels = logicalOptionLabels(subjectMapInstance)
        await selectFirstLogicalOption(subjectMapInstance)
        const subjectMapNode = subjectMapInstance.querySelector('shacl-node')
        if (!subjectMapNode) {
            throw new Error(`SubjectMap node was not rendered: ${findProperty(acceptanceRoot, 'subjectMap/subject/quotedTriplesMap')?.innerHTML}`)
        }
        const subjectMapNodeId = subjectMapNode.dataset.nodeId
        await fillAlternativeEditor(subjectMapNode, 'template/constant/reference/functionExecution', 'template', 'http://data.example.com/image/{$.ID}')
        const subjectMapText = visibleText(subjectMapNode)
        const subjectMapVisibleLogicalConstraintCount = visibleLogicalConstraintCount(subjectMapNode)

        const acceptancePomProperty = findProperty(acceptanceRoot, 'predicateObjectMap')
        const pomNode1 = await addNestedValue(acceptancePomProperty)
        const pom1 = await fillPredicateObjectMap(pomNode1, 'http://example.org#height', '$.Height')
        const pomNode2 = await addNestedValue(acceptancePomProperty)
        const pom2 = await fillPredicateObjectMap(pomNode2, 'http://example.org#width', '$.Width')
        const acceptanceTurtle = acceptanceForm.serialize()
        const acceptanceValidation = await acceptanceForm.validate(false, true)
        const validationSummaryText = acceptanceForm.shadowRoot.querySelector('.validation-summary')?.textContent || ''

        const genericRoots = document.createElement('shacl-form')
        genericRoots.dataset.shapes = shapes
        document.body.appendChild(genericRoots)
        await waitForLoad(genericRoots)
        const rootSelector = genericRoots.shadowRoot.querySelector('.root-selector-container select')
        const rootOptions = rootSelector ? [...rootSelector.options].map(option => option.textContent.trim()) : []

        const starMapForm = await createForm('http://w3id.org/rml/shapes/RMLTriplesMapShape', {
            valuesNamespace: 'http://example.org/',
        })
        const starMapRoot = starMapForm.shadowRoot.querySelector('shacl-node')
        const starSubjectMapProperty = findProperty(starMapRoot, 'subjectMap/subject/quotedTriplesMap')
        const starSubjectMapInstance = await selectAlternativeInProperty(starSubjectMapProperty, 'subjectMap')
        const starMapOptionLabels = logicalOptionLabels(starSubjectMapInstance)
        await selectLogicalOptionByLabel(starSubjectMapInstance, 'StarMap')
        const starMapContent = starSubjectMapInstance.querySelector('.shacl-or-content')
        const starMapText = visibleText(starSubjectMapInstance)
        const starMapEmptyStateText = starSubjectMapInstance.querySelector('.logical-empty-state')?.textContent || ''
        const starMapScalarEditorCount = starMapContent
            ? starMapContent.querySelectorAll(':scope > .property-instance > .editor, :scope > .property-instance input, :scope > .property-instance select, :scope > .property-instance textarea').length
            : 0

        const refObjectMapForm = await createForm('http://w3id.org/rml/shapes/RMLTriplesMapShape', {
            valuesNamespace: 'http://example.org/',
            showNodeIds: '',
        })
        const refObjectMapRoot = refObjectMapForm.shadowRoot.querySelector('shacl-node')
        const refPomProperty = findProperty(refObjectMapRoot, 'predicateObjectMap')
        const refPomNode = await addNestedValue(refPomProperty)
        const refObjectAlternative = findProperty(refPomNode, 'object/objectMap/quotedTriplesMap')
        const refObjectMapInstance = await selectAlternativeInProperty(refObjectAlternative, 'objectMap')
        await selectLogicalOptionByLabel(refObjectMapInstance, 'RefObjectMap')
        const refObjectMapNode = refObjectMapInstance.querySelector('shacl-node')
        const refObjectMapText = visibleText(refObjectMapNode)
        const refObjectMapNodeIds = [...refObjectMapInstance.querySelectorAll('shacl-node')]
            .map(node => node.dataset.nodeId)

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
            acceptanceTurtle,
            acceptanceConforms: acceptanceValidation.conforms,
            validationSummaryText,
            subjectMapOptionLabels,
            subjectMapNodeId,
            subjectMapText,
            subjectMapVisibleLogicalConstraintCount,
            objectMapOptionLabels: pom1.objectMapOptionLabels,
            objectMapNodeId: pom1.objectMapNodeId,
            objectMapText: pom1.objectMapText,
            objectMapVisibleLogicalConstraintCount: pom1.objectMapVisibleLogicalConstraintCount,
            secondObjectMapOptionLabels: pom2.objectMapOptionLabels,
            secondObjectMapNodeId: pom2.objectMapNodeId,
            secondObjectMapText: pom2.objectMapText,
            secondObjectMapVisibleLogicalConstraintCount: pom2.objectMapVisibleLogicalConstraintCount,
            starMapOptionLabels,
            starMapText,
            starMapEmptyStateText,
            starMapScalarEditorCount,
            refObjectMapText,
            refObjectMapNodeIds,
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
    assert(result.sourceText.includes('rml:null'), `RML Source shape did not expose rml:null: ${result.sourceText}`)
    assert(result.sourceText.includes('rml:compression'), 'RML Source shape did not expose rml:compression')
    assert(result.sourceText.includes('rml:encoding'), 'RML Source shape did not expose rml:encoding')
    assert(result.sourceText.includes('rml:root'), 'Authoring overlay did not expose RelativePathSource rml:root')
    assert(result.sourceText.includes('rml:path'), 'Authoring overlay did not expose RelativePathSource rml:path')
    assert(result.subjectMapOptionLabels.includes('SubjectMap'), `SubjectMap sh:or branch did not use referenced shape label: ${result.subjectMapOptionLabels.join(', ')}`)
    assert(!result.subjectMapOptionLabels.includes('unknown'), 'SubjectMap sh:or branch labels regressed to unknown')
    assert(!result.subjectMapText.includes('unknown'), `SubjectMap still displays an unknown logical branch:\n${result.subjectMapText}`)
    assert(result.subjectMapVisibleLogicalConstraintCount === 0, 'SubjectMap still displays node-level validation-only logical controls')
    assert(result.objectMapOptionLabels.includes('ObjectMap'), `ObjectMap sh:or branch did not use referenced shape label: ${result.objectMapOptionLabels.join(', ')}`)
    assert(!result.objectMapOptionLabels.includes('unknown') && !result.secondObjectMapOptionLabels.includes('unknown'), 'ObjectMap sh:or branch labels regressed to unknown')
    assert(!result.objectMapText.includes('unknown') && !result.secondObjectMapText.includes('unknown'), 'ObjectMap still displays an unknown logical branch')
    assert(result.objectMapVisibleLogicalConstraintCount === 0 && result.secondObjectMapVisibleLogicalConstraintCount === 0, 'ObjectMap still displays node-level validation-only logical controls')
    assert(result.starMapOptionLabels.some(label => label.includes('StarMap')), `StarMap logical branch did not get a meaningful referenced-shape label: ${result.starMapOptionLabels.join(', ')}`)
    assert(!result.starMapText.includes('unknown'), `StarMap branch still displays unknown:\n${result.starMapText}`)
    assert(result.starMapEmptyStateText.includes('No authoring fields are defined'), 'Empty StarMap branch did not render the generic empty-state message')
    assert(result.starMapScalarEditorCount === 0, 'Empty StarMap branch rendered a bogus scalar editor')
    assert(result.refObjectMapText.includes('joinCondition'), `RefObjectMap did not expose joinCondition:\n${result.refObjectMapText}`)
    assert(result.refObjectMapText.includes('parentTriplesMap'), `RefObjectMap did not expose parentTriplesMap:\n${result.refObjectMapText}`)
    assert(result.refObjectMapNodeIds.length === 1, `RefObjectMap sh:and members were materialized as extra nested nodes: ${result.refObjectMapNodeIds.join(', ')}`)
    assert(result.refObjectMapNodeIds[0] === 'http://example.org/refobjectmap-1', `First authored RefObjectMap did not use suffix -1: ${result.refObjectMapNodeIds[0]}`)
    assert(result.acceptanceTurtle.includes('<http://example.org/TM-images>'), 'Acceptance Turtle did not use explicit TriplesMap IRI')
    assert(result.acceptanceTurtle.includes('rml:logicalSource <http://example.org/rml-logical-source-1>'), 'Acceptance Turtle did not link TriplesMap to LogicalSource')
    assert(result.acceptanceTurtle.includes('rml:source <http://example.org/rml-source-1>'), 'Acceptance Turtle did not link LogicalSource to Source')
    assert(result.acceptanceTurtle.includes('rml:root rml:MappingDirectory'), 'Acceptance Turtle did not include RelativePathSource root')
    assert(result.acceptanceTurtle.includes('rml:path "images.json"'), 'Acceptance Turtle did not include RelativePathSource path')
    assert(result.acceptanceTurtle.includes('rml:referenceFormulation rml:JSONPath'), `Acceptance Turtle did not include JSONPath reference formulation:\n${result.acceptanceTurtle}`)
    assert(result.acceptanceTurtle.includes('rml:iterator "$.Images[*]"'), 'Acceptance Turtle did not include iterator')
    assert(result.subjectMapNodeId === 'http://example.org/subjectmap-1', `First authored SubjectMap did not use suffix -1: ${result.subjectMapNodeId}`)
    assert(result.acceptanceTurtle.includes('rml:subjectMap <http://example.org/subjectmap-1>'), `Acceptance Turtle did not link TriplesMap to first SubjectMap:\n${result.acceptanceTurtle}`)
    assert(result.acceptanceTurtle.includes('rml:template "http://data.example.com/image/{$.ID}"'), 'Acceptance Turtle did not include SubjectMap template literal')
    assert(result.acceptanceTurtle.includes('rml:RelativePathSource'), 'Acceptance Turtle did not type source as RelativePathSource from the authoring profile')
    assert(result.acceptanceTurtle.includes('<http://example.org/predicateobjectmap-1>'), 'Acceptance Turtle did not include first PredicateObjectMap')
    assert(result.acceptanceTurtle.includes('<http://example.org/predicateobjectmap-2>'), `Acceptance Turtle did not include second PredicateObjectMap:\n${result.acceptanceTurtle}`)
    assert(result.acceptanceTurtle.includes('rml:predicate <http://example.org#height>'), 'Acceptance Turtle did not include height predicate')
    assert(result.acceptanceTurtle.includes('rml:predicate <http://example.org#width>'), 'Acceptance Turtle did not include width predicate')
    assert(result.objectMapNodeId === 'http://example.org/objectmap-1', `First authored ObjectMap did not use suffix -1: ${result.objectMapNodeId}`)
    assert(result.secondObjectMapNodeId === 'http://example.org/objectmap-2', `Second authored ObjectMap did not use suffix -2: ${result.secondObjectMapNodeId}`)
    assert(result.acceptanceTurtle.includes('rml:objectMap <http://example.org/objectmap-1>'), 'Acceptance Turtle did not include first ObjectMap link')
    assert(result.acceptanceTurtle.includes('rml:objectMap <http://example.org/objectmap-2>'), 'Acceptance Turtle did not include second ObjectMap link')
    assert(result.acceptanceTurtle.includes('rml:reference "$.Height"'), 'Acceptance Turtle did not include height reference')
    assert(result.acceptanceTurtle.includes('rml:reference "$.Width"'), 'Acceptance Turtle did not include width reference')
    assert(result.acceptanceConforms === true, `Acceptance mapping did not pass internal SHACL validation: ${result.validationSummaryText}`)
    assert(result.rootOptions.includes('child'), 'RML value-only child shape was incorrectly hidden from broad root options')
    assert(result.rootOptions.includes('TriplesMap'), 'Explicit top-level RML TriplesMap candidate disappeared from root options')
    assert(triplesMapDemoResult.valuesNamespace === 'http://example.org/', 'RML demo does not configure a readable value namespace')
    assert(triplesMapDemoResult.showNodeIds === true, 'RML demo does not expose node IDs')
    assert(triplesMapDemoResult.generatedRootId === 'http://example.org/triplesmap-1', 'RML demo did not create a readable TriplesMap IRI')
    assert(triplesMapDemoResult.customizedRootId === 'http://example.org/TM-images', 'RML demo did not preserve explicit TriplesMap IRI edit')
    assert(joinDemoResult.generatedRootId === 'http://example.org/join-1', 'RML demo did not create a readable Join IRI')
    assert(joinDemoResult.customizedRootId === 'http://example.org/Join-images', `RML demo did not preserve explicit Join IRI edit: ${joinDemoResult.customizedRootId}`)

    const uniqueNotFoundUrls = [...new Set(notFoundUrls)]
    console.log(`rml browser smoke passed${uniqueNotFoundUrls.length ? `; 404 URLs: ${uniqueNotFoundUrls.join(', ')}` : ''}`)
} finally {
    if (browser) {
        await browser.close()
    }
    await server.close()
}
