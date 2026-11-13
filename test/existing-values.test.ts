// @vitest-environment happy-dom

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DataFactory, Parser, Store } from 'n3'
import { isomorphic } from 'rdf-isomorphic'

const EX = 'http://example.org/'
const { namedNode } = DataFactory

type TestForm = HTMLElement & { toRDF: () => Store }

const PREFIXES = `
    @prefix ex: <${EX}> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`

async function renderForm(shapes: string, values: string, valuesSubject: string): Promise<TestForm> {
    const form = document.createElement('shacl-form') as TestForm
    form.setAttribute('data-shapes', shapes)
    form.setAttribute('data-values', values)
    form.setAttribute('data-values-subject', valuesSubject)
    document.body.appendChild(form)
    await waitUntilLoaded(form)
    return form
}

function waitUntilLoaded(form: HTMLElement): Promise<void> {
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
        // Initialisation is debounced, so the loading attribute is not set synchronously.
        setTimeout(poll, 250)
    })
}

function expectSameGraph(form: TestForm, expectedTurtle: string) {
    const actual = form.toRDF().getQuads(null, null, null, null)
    const expected = new Parser().parse(expectedTurtle)
    expect(isomorphic(actual, expected), `actual triples: ${actual.map(q => `${q.subject.value} ${q.predicate.value} ${q.object.value}`).join(' | ')}`).toBe(true)
}

describe('binding an existing data graph', () => {
    let originalAttachInternals: typeof HTMLElement.prototype.attachInternals | undefined

    beforeAll(async () => {
        originalAttachInternals = HTMLElement.prototype.attachInternals
        if (!originalAttachInternals) {
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
        await import('../src/form-default.ts')
    })

    afterAll(() => {
        if (originalAttachInternals) {
            HTMLElement.prototype.attachInternals = originalAttachInternals
        } else {
            delete (HTMLElement.prototype as Partial<typeof HTMLElement.prototype>).attachInternals
        }
    })

    afterEach(() => {
        document.body.replaceChildren()
    })

    // Regression: a loaded value on a plain predicate path used to be rendered
    // as an unavailable sh:alternativePath branch and was lost on serialisation.
    it('keeps a value loaded on a plain predicate path', async () => {
        const shapes = `${PREFIXES}
            ex:PersonShape a sh:NodeShape ;
                sh:targetClass ex:Person ;
                sh:property [ sh:path ex:firstName ; sh:datatype xsd:string ; sh:minCount 1 ] .
        `
        const values = `${PREFIXES} ex:Alice a ex:Person ; ex:firstName "Alice" .`

        const form = await renderForm(shapes, values, `${EX}Alice`)

        expect(form.shadowRoot!.querySelector('.unavailable-alternative-path')).toBeNull()
        expectSameGraph(form, values)
    })

    it('keeps the predicate of a value loaded on an sh:alternativePath branch', async () => {
        const shapes = `${PREFIXES}
            ex:PersonShape a sh:NodeShape ;
                sh:targetClass ex:Person ;
                sh:property [ sh:path [ sh:alternativePath ( ex:email ex:mbox ) ] ; sh:name "Contact" ] ;
                sh:property [ sh:path ex:email ; sh:datatype xsd:string ] ;
                sh:property [ sh:path ex:mbox ; sh:datatype xsd:string ] .
        `
        const values = `${PREFIXES} ex:Alice a ex:Person ; ex:mbox "alice@example.org" .`

        const form = await renderForm(shapes, values, `${EX}Alice`)

        expect(form.toRDF().getQuads(namedNode(`${EX}Alice`), namedNode(`${EX}mbox`), null, null)).toHaveLength(1)
        expectSameGraph(form, values)
    })
})
