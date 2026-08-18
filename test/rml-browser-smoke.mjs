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

        async function createForm(shapeSubject) {
            const form = document.createElement('shacl-form')
            form.dataset.shapes = shapes
            form.dataset.shapeSubject = shapeSubject
            document.body.appendChild(form)
            await waitForLoad(form)
            return form
        }

        const predicateObjectMap = await createForm('http://w3id.org/rml/shapes/RMLPredicateObjectMapShape')
        const predicateObjectMapText = predicateObjectMap.shadowRoot.textContent

        const childMap = await createForm('http://w3id.org/rml/shapes/RMLChildMapShape')
        const childMapText = childMap.shadowRoot.textContent

        const triplesMap = await createForm('http://w3id.org/rml/shapes/RMLTriplesMapShape')
        const logicalSourceProperty = [...triplesMap.shadowRoot.querySelectorAll('shacl-property')]
            .find(property => property.textContent.includes('logicalSource'))
        logicalSourceProperty?.addPropertyInstance()
        await new Promise(resolve => setTimeout(resolve, 250))
        const logicalSourceText = logicalSourceProperty?.textContent || ''

        const genericRoots = document.createElement('shacl-form')
        genericRoots.dataset.shapes = shapes
        document.body.appendChild(genericRoots)
        await waitForLoad(genericRoots)
        const rootSelector = genericRoots.shadowRoot.querySelector('.root-selector-container select')
        const rootOptions = rootSelector ? [...rootSelector.options].map(option => option.textContent.trim()) : []

        return {
            predicateObjectMapText,
            childMapText,
            logicalSourceText,
            rootOptions,
        }
    }, shapesWithOntology)

    assert(result.predicateObjectMapText.includes('graph/graphMap'), 'PredicateObjectMap is missing graph/graphMap')
    assert(result.predicateObjectMapText.includes('predicate/predicateMap'), 'PredicateObjectMap is missing predicate/predicateMap')
    assert(result.predicateObjectMapText.includes('object/objectMap/quotedTriplesMap'), 'PredicateObjectMap is missing object/objectMap/quotedTriplesMap')
    assert(result.childMapText.includes('template/constant/reference/functionExecution'), 'ChildMap did not render inherited ExpressionMap structure')
    assert(result.logicalSourceText.includes('rml:source'), 'LogicalSource concrete authoring shape did not expose rml:source')
    assert(result.rootOptions.includes('child'), 'RML value-only child shape was incorrectly hidden from broad root options')
    assert(result.rootOptions.includes('TriplesMap'), 'Explicit top-level RML TriplesMap candidate disappeared from root options')

    console.log('rml browser smoke passed')
} finally {
    if (browser) {
        await browser.close()
    }
    await server.close()
}
