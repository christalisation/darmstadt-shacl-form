import { describe, expect, it } from 'vitest'
import { DataFactory, Parser, Store } from 'n3'
import { RdfReader } from '../src/rdf/rdf-reader'
import { ShaclParser } from '../src/shacl/parser'
import { ShaclPathParser } from '../src/shacl/path-parser'
import { ShaclShapeResolver } from '../src/shacl/resolver'
import { FormShapeCompiler } from '../src/form-shape/form-shape-compiler'

const EX = 'http://example.org/'
const SH = 'http://www.w3.org/ns/shacl#'

function storeFromTurtle(turtle: string): Store {
    const parser = new Parser()
    return new Store(parser.parse(`
        @prefix ex: <${EX}> .
        @prefix sh: <${SH}> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

        ${turtle}
    `))
}

function compile(shapeIri: string, store: Store) {
    const rdf = new RdfReader(store)
    const parser = new ShaclParser(rdf, new ShaclPathParser(rdf))
    const resolver = new ShaclShapeResolver(parser)

    return new FormShapeCompiler().compileNode(
        resolver.resolveNodeShape(DataFactory.namedNode(shapeIri)),
    )
}

describe('FormShapeCompiler', () => {
    it('projects sh:or node branches to a nested node choice', () => {
        const store = storeFromTurtle(`
            ex:AttributionShape
                sh:property [
                    sh:path ex:agent ;
                    sh:or (
                        [ sh:node ex:PersonShape ; rdfs:label "Person" ]
                        [ sh:node ex:OrganisationShape ; rdfs:label "Organisation" ]
                    )
                ] .

            ex:PersonShape sh:property [ sh:path ex:name ] .
            ex:OrganisationShape sh:property [ sh:path ex:name ] .
        `)

        const shape = compile(`${EX}AttributionShape`, store)
        const property = shape.properties[0]

        expect(property.valueType).toEqual({
            kind: 'nestedNodeChoice',
            exclusive: false,
            choices: [
                {
                    shape: DataFactory.namedNode(`${EX}PersonShape`),
                    label: 'Person',
                },
                {
                    shape: DataFactory.namedNode(`${EX}OrganisationShape`),
                    label: 'Organisation',
                },
            ],
        })
    })
})
