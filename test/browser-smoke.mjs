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
      sh:path [ sh:alternativePath ( ex:email ex:mbox ) ] ;
      sh:name "Contact path" ;
      sh:maxCount 1
    ] ;
    sh:property [
      sh:path ex:child ;
      sh:name "Child" ;
      sh:node ex:ChildShape
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

        const simple = await createForm({ shapeSubject: 'http://example.org/SimpleShape' })
        const root = simple.shadowRoot.querySelector('shacl-node')
        const titleLabel = root?.querySelector('shacl-property label')?.textContent
        const nestedControl = [...root?.querySelectorAll('shacl-property') || []]
            .find(property => property.textContent.includes('Child') && property.querySelector('.add-button'))
        const alternative = root?.querySelector('.alternative-path-constraint select')

        const multi = await createForm()
        const selector = multi.shadowRoot.querySelector('.root-selector-container select')
        const rootOptions = selector ? [...selector.options].map(option => option.textContent) : []

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
            hasAlternative: Boolean(alternative),
            rootOptions,
            invalidConforms: invalidReport.conforms,
            validConforms: validReport.conforms,
            turtle,
        }
    }, shapes)

    assert(result.hasRoot, 'simple NodeShape did not render')
    assert(result.titleLabel === 'Title', 'simple property label did not render')
    assert(result.hasNestedControl, 'nested sh:node create/link control did not render')
    assert(result.hasAlternative, 'alternative path selector did not render')
    assert(result.rootOptions.includes('Simple') && result.rootOptions.includes('Second'), 'multiple-root selector did not render expected options')
    assert(result.invalidConforms === false, 'SHACL validation did not catch missing required value')
    assert(result.validConforms === true, 'SHACL validation did not pass after value entry')
    assert(result.turtle.includes('A title') && result.turtle.includes('ex:title'), 'serialization did not include entered RDF')

    console.log('browser smoke passed')
} finally {
    if (browser) {
        await browser.close()
    }
    await server.close()
}
