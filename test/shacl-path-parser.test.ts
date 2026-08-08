import { describe, expect, it } from 'vitest'
import { DataFactory, Parser, Store } from 'n3'
import { RdfListReader } from '../src/rdf-list-reader'
import { ShaclPathParser } from '../src/shacl-path-parser'
import { pathToString } from '../src/shacl-path'

const EX = 'http://example.org/'
const SH = 'http://www.w3.org/ns/shacl#'

function storeFromTurtle(turtle: string): Store {
    const parser = new Parser()
    const prelude = `
        @prefix ex: <${EX}> .
        @prefix sh: <${SH}> .
    `
    return new Store(parser.parse(`${prelude}\n${turtle}`))
}

describe('ShaclPathParser', () => {
    it('parses predicate paths', () => {
        const store = storeFromTurtle('')
        const parser = new ShaclPathParser(store, new RdfListReader(store))

        const path = parser.parse(DataFactory.namedNode(`${EX}name`))

        expect(path).toEqual({
            kind: 'predicate',
            predicate: DataFactory.namedNode(`${EX}name`),
        })
    })

    it('parses alternative and sequence paths from RDF lists', () => {
        const store = storeFromTurtle(`
            ex:PropertyShape sh:path (
                ex:author
                [ sh:alternativePath ( ex:name ex:label ) ]
            ) .
        `)
        const parser = new ShaclPathParser(store, new RdfListReader(store))
        const pathTerm = store.getObjects(DataFactory.namedNode(`${EX}PropertyShape`), `${SH}path`, null)[0]

        const path = parser.parse(pathTerm)

        expect(path?.kind).toBe('sequence')
        expect(path ? pathToString(path) : '').toBe(`${EX}author / ${EX}name | ${EX}label`)
    })
})
