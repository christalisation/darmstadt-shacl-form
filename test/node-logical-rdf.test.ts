// @vitest-environment happy-dom

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DataFactory } from 'n3'

const EX = 'http://example.org/'

function rectangleShape(logicalPredicate: 'or' | 'xone'): string {
    return `
        @prefix ex: <${EX}> .
        @prefix sh: <http://www.w3.org/ns/shacl#> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

        # Based on W3C SHACL Core node/or-001. The xone variant exercises the
        # same node-level logical rendering path with exactly-one semantics.
        ex:Rectangle
            a sh:NodeShape ;
            sh:targetClass ex:Rectangle ;
            sh:${logicalPredicate} (
                [
                    sh:property [
                        sh:path ex:area ;
                        sh:datatype xsd:integer ;
                        sh:minCount 1 ;
                    ] ;
                ]
                [
                    sh:property [
                        sh:path ex:height ;
                        sh:datatype xsd:integer ;
                        sh:minCount 1 ;
                    ] ;
                    sh:property [
                        sh:path ex:width ;
                        sh:datatype xsd:integer ;
                        sh:minCount 1 ;
                    ] ;
                ]
            ) .
    `
}

async function renderRectangle(logicalPredicate: 'or' | 'xone') {
    const form = document.createElement('shacl-form') as HTMLElement & {
        toRDF: () => import('n3').Store,
        validate: (ignoreEmptyValues?: boolean) => Promise<{ conforms: boolean }>,
    }
    form.setAttribute('data-shapes', rectangleShape(logicalPredicate))
    form.setAttribute('data-shape-subject', `${EX}Rectangle`)
    form.setAttribute('data-values-namespace', `${EX}data/`)
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
        poll()
    })
}

function selectLogicalBranch(form: HTMLElement, branchIndex: number) {
    const select = form.shadowRoot!.querySelector('.shacl-or-constraint .editor') as HTMLElement & { value: string }
    expect(select).toBeTruthy()
    select.value = String(branchIndex)
    select.dispatchEvent(new Event('change', { bubbles: true }))
}

function setPropertyValue(form: HTMLElement, path: string, value: string) {
    const instance = [...form.shadowRoot!.querySelectorAll<HTMLElement>('.property-instance')]
        .find(elem => elem.dataset.path === path)
    expect(instance).toBeTruthy()

    const editor = instance!.querySelector('.editor') as HTMLElement & { value: string }
    expect(editor).toBeTruthy()
    editor.value = value
    editor.dispatchEvent(new Event('change', { bubbles: true }))
}

async function expectConformingTriple(form: Awaited<ReturnType<typeof renderRectangle>>, path: string) {
    const graph = form.toRDF()
    expect(graph.getQuads(null, DataFactory.namedNode(path), null, null)).toHaveLength(1)

    const report = await form.validate(false)
    expect(report.conforms).toBe(true)
}

describe('node-level logical alternatives RDF output', () => {
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

    for (const logicalPredicate of ['or', 'xone'] as const) {
        it(`serializes and validates the selected area branch for sh:${logicalPredicate}`, async () => {
            const form = await renderRectangle(logicalPredicate)

            selectLogicalBranch(form, 0)
            setPropertyValue(form, `${EX}area`, '6')

            await expectConformingTriple(form, `${EX}area`)
            expect(form.toRDF().getQuads(null, DataFactory.namedNode(`${EX}height`), null, null)).toHaveLength(0)
            expect(form.toRDF().getQuads(null, DataFactory.namedNode(`${EX}width`), null, null)).toHaveLength(0)
        })

        it(`serializes and validates the selected height and width branch for sh:${logicalPredicate}`, async () => {
            const form = await renderRectangle(logicalPredicate)

            selectLogicalBranch(form, 1)
            setPropertyValue(form, `${EX}height`, '2')
            setPropertyValue(form, `${EX}width`, '3')

            await expectConformingTriple(form, `${EX}height`)
            expect(form.toRDF().getQuads(null, DataFactory.namedNode(`${EX}width`), null, null)).toHaveLength(1)
            expect(form.toRDF().getQuads(null, DataFactory.namedNode(`${EX}area`), null, null)).toHaveLength(0)
        })
    }
})
