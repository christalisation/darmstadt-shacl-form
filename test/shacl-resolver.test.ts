import { describe, expect, it } from 'vitest'
import { DataFactory, Parser, Store } from 'n3'
import { RdfReader } from '../src/rdf/rdf-reader'
import { ShaclParser } from '../src/shacl/parser'
import { ShaclPathParser } from '../src/shacl/path-parser'
import { ShaclShapeResolver } from '../src/shacl/resolver'

const EX = 'http://example.org/'
const SH = 'http://www.w3.org/ns/shacl#'

function storeFromTurtle(turtle: string): Store {
    const parser = new Parser()
    return new Store(parser.parse(`
        @prefix ex: <${EX}> .
        @prefix sh: <${SH}> .

        ${turtle}
    `))
}

function resolver(store: Store): ShaclShapeResolver {
    const rdf = new RdfReader(store)
    return new ShaclShapeResolver(
        new ShaclParser(
            rdf,
            new ShaclPathParser(rdf),
        ),
    )
}

function propertyIds(shape: ReturnType<ShaclShapeResolver['resolveNodeShape']>): string[] {
    return shape.properties.map(property => property.id.value)
}

describe('ShaclShapeResolver', () => {
    it('flattens sh:and properties into the effective shape', () => {
        const store = storeFromTurtle(`
            ex:PersonShape
                sh:property ex:nameProperty ;
                sh:and ( ex:AddressShape ) .

            ex:nameProperty sh:path ex:name .
            ex:AddressShape sh:property ex:streetProperty .
            ex:streetProperty sh:path ex:street .
        `)

        const shape = resolver(store).resolveNodeShape(
            DataFactory.namedNode(`${EX}PersonShape`),
        )

        expect(propertyIds(shape)).toEqual([
            `${EX}nameProperty`,
            `${EX}streetProperty`,
        ])
    })

    it('keeps sh:or and sh:xone branches as choices instead of flattening them', () => {
        const store = storeFromTurtle(`
            ex:PersonShape
                sh:property ex:nameProperty ;
                sh:or ( ex:EmailShape ) ;
                sh:xone ( ex:PhoneShape ) .

            ex:nameProperty sh:path ex:name .
            ex:EmailShape sh:property ex:emailProperty .
            ex:emailProperty sh:path ex:email .
            ex:PhoneShape sh:property ex:phoneProperty .
            ex:phoneProperty sh:path ex:phone .
        `)

        const shape = resolver(store).resolveNodeShape(
            DataFactory.namedNode(`${EX}PersonShape`),
        )

        expect(propertyIds(shape)).toEqual([
            `${EX}nameProperty`,
        ])
    })
})
