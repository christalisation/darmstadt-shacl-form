// @vitest-environment happy-dom

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DataFactory, Parser } from 'n3'
import { isomorphic } from 'rdf-isomorphic'
import { commitActiveRoot, defineShaclForm, renderForm, restoreDom, reuseNode, selectRootShape, setEditorValue, TestForm } from './support/dom-form'

const EX = 'http://example.org/'
const { namedNode } = DataFactory

const PREFIXES = `
    @prefix ex: <${EX}> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`

function shapes(targetClass: boolean, logical = false): string {
    const valueConstraint = logical ? 'sh:or ( [ sh:node ex:AShape ] [ sh:node ex:CShape ] )' : 'sh:node ex:AShape'
    return `${PREFIXES}
        ex:AShape a sh:NodeShape ; sh:name "A" ; ${targetClass ? 'sh:targetClass ex:A ;' : ''}
            sh:property [ sh:path ex:name ; sh:datatype xsd:string ] .
        ex:CShape a sh:NodeShape ; sh:name "C" ;
            sh:property [ sh:path ex:code ; sh:datatype xsd:string ] .
        ex:BShape a sh:NodeShape ; sh:name "B" ;
            sh:property [ sh:path ex:ref ; ${valueConstraint} ] .
    `
}

/** Authors an A resource, commits it, then reuses it as the ex:ref value of a B resource. */
async function authorAThenReuseItFromB(form: TestForm) {
    const a = await selectRootShape(form, 'A')
    await setEditorValue(a, `${EX}name`, 'shared')
    const aId = a.nodeId
    await commitActiveRoot(form)

    const b = await selectRootShape(form, 'B')
    await reuseNode(b.querySelector('shacl-property')!, aId)
    return { aId, bId: b.nodeId }
}

describe('reusing RDF nodes', () => {
    beforeAll(defineShaclForm)
    afterAll(restoreDom)
    afterEach(() => document.body.replaceChildren())

    for (const targetClass of [false, true]) {
        for (const namespace of [EX, '']) {
            const identity = namespace ? 'IRI' : 'blank node'
            it(`links a reused ${identity} whose shape has ${targetClass ? 'a' : 'no'} sh:targetClass`, async () => {
                const attributes: Record<string, string> = { 'data-shapes': shapes(targetClass) }
                if (namespace) attributes['data-values-namespace'] = namespace
                const form = await renderForm(attributes)

                const { aId, bId } = await authorAThenReuseItFromB(form)

                const graph = form.toRDF()
                const links = graph.getQuads(null, namedNode(`${EX}ref`), null, null)
                expect(links).toHaveLength(1)
                expect(links[0].subject.value).toBe(bId.value)
                // Node identity is preserved: same term type and same identifier, never a literal.
                expect(links[0].object.termType).toBe(namespace ? 'NamedNode' : 'BlankNode')
                expect(links[0].object.value).toBe(aId.value)
                // The reused resource is described exactly once.
                expect(graph.getQuads(null, namedNode(`${EX}name`), null, null)).toHaveLength(1)
                expect(graph.getQuads(links[0].object, namedNode(`${EX}name`), null, null)).toHaveLength(1)
            })
        }
    }

    it('links a reused node through a property constrained by sh:or', async () => {
        const form = await renderForm({ 'data-shapes': shapes(false, true), 'data-values-namespace': EX })

        const { aId } = await authorAThenReuseItFromB(form)

        const links = form.toRDF().getQuads(null, namedNode(`${EX}ref`), null, null)
        expect(links).toHaveLength(1)
        expect(links[0].object.equals(namedNode(aId.value))).toBe(true)
    })

    for (const targetClass of [false, true]) {
        it(`preserves a loaded blank node referenced twice (shape with ${targetClass ? 'a' : 'no'} sh:targetClass)`, async () => {
            const shapesGraph = `${PREFIXES}
                ex:AShape a sh:NodeShape ; ${targetClass ? 'sh:targetClass ex:A ;' : ''}
                    sh:property [ sh:path ex:name ; sh:datatype xsd:string ] .
                ex:BShape a sh:NodeShape ; sh:targetClass ex:B ;
                    sh:property [ sh:path ex:first ; sh:node ex:AShape ] ;
                    sh:property [ sh:path ex:second ; sh:node ex:AShape ] .
            `
            const values = `${PREFIXES}
                ex:b a ex:B ; ex:first _:shared ; ex:second _:shared .
                _:shared ${targetClass ? 'a ex:A ;' : ''} ex:name "shared" .
            `
            const form = await renderForm({ 'data-shapes': shapesGraph, 'data-values': values, 'data-values-subject': `${EX}b` })

            const actual = form.toRDF().getQuads(null, null, null, null)
            expect(isomorphic(actual, new Parser().parse(values)), form.serialize()).toBe(true)
        })
    }
})
