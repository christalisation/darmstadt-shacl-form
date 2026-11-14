// @vitest-environment happy-dom

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DataFactory } from 'n3'
import { defineShaclForm, renderForm, restoreDom, setEditorValue } from './support/dom-form'

const EX = 'http://example.org/'
const { namedNode } = DataFactory

const PREFIXES = `
    @prefix ex: <${EX}> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`

describe('properties with several value shapes', () => {
    beforeAll(defineShaclForm)
    afterAll(restoreDom)
    afterEach(() => {
        document.body.replaceChildren()
        vi.restoreAllMocks()
    })

    for (const [name, constraint] of [
        ['repeated sh:node', 'sh:node ex:NameShape, ex:CodeShape'],
        ['sh:and', 'sh:and ( ex:NameShape ex:CodeShape )'],
    ] as const) {
        it(`authors one value node for ${name}`, async () => {
            const form = await renderForm({
                'data-shapes': `${PREFIXES}
                    ex:Shape a sh:NodeShape ;
                        sh:property [ sh:path ex:value ; ${constraint} ; sh:minCount 1 ; sh:maxCount 1 ] .
                    ex:NameShape a sh:NodeShape ; sh:property [ sh:path ex:name ; sh:datatype xsd:string ; sh:minCount 1 ] .
                    ex:CodeShape a sh:NodeShape ; sh:property [ sh:path ex:code ; sh:datatype xsd:string ; sh:minCount 1 ] .
                `,
                'data-shape-subject': `${EX}Shape`,
                'data-values-namespace': EX,
            })
            const root = form.shadowRoot!
            if (!root.querySelector('.nested-property-instance')) {
                // node-valued properties start empty: create the value first
                const addButton = root.querySelector('shacl-property > .add-button') as HTMLElement & { value: string }
                addButton.value = 'new'
                addButton.dispatchEvent(new Event('change'))
            }
            expect(root.querySelectorAll('.nested-property-instance > shacl-node')).toHaveLength(2)

            await setEditorValue(root, `${EX}name`, 'n')
            await setEditorValue(root, `${EX}code`, 'c')

            const graph = form.toRDF()
            const values = graph.getObjects(null, namedNode(`${EX}value`), null)
            expect(values).toHaveLength(1)
            expect(graph.getQuads(values[0], namedNode(`${EX}name`), null, null)).toHaveLength(1)
            expect(graph.getQuads(values[0], namedNode(`${EX}code`), null, null)).toHaveLength(1)
            expect((await form.validate(false)).conforms).toBe(true)
        })
    }

    it('reports logical constraints that the value editor cannot follow', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

        await renderForm({
            'data-shapes': `${PREFIXES}
                ex:Shape a sh:NodeShape ;
                    sh:property [
                        sh:path ex:value ;
                        sh:or ( [ sh:datatype xsd:string ] [ sh:datatype xsd:integer ] ) ;
                        sh:xone ( [ sh:minLength 1 ] [ sh:maxLength 5 ] ) ;
                    ] .
            `,
            'data-shape-subject': `${EX}Shape`,
        })

        expect(warn.mock.calls.some(call => String(call[0]).includes('2 sh:or/sh:xone constraints'))).toBe(true)
    })
})
