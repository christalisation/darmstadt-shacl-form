import { describe, expect, it } from 'vitest'
import { DataFactory, Parser, Store } from 'n3'
import { RdfGraphReader } from '../src/rdf/graph-reader'
import { RdfListReader } from '../src/rdf/list-reader'
import { ShaclPathParser } from '../src/shacl/path-parser'
import { pathToString } from '../src/shacl/path'

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

function pathParser(store: Store): ShaclPathParser {
    return new ShaclPathParser(
        new RdfGraphReader(store),
        new RdfListReader(store),
    )
}

describe('ShaclPathParser', () => {
    it('parses predicate paths', () => {
        const parser = pathParser(new Store())

        expect(parser.parse(DataFactory.namedNode(`${EX}title`))).toEqual({
            kind: 'predicate',
            predicate: DataFactory.namedNode(`${EX}title`),
        })
    })

    it('parses alternative paths from RDF lists', () => {
        const store = storeFromTurtle(`
            ex:Shape sh:path [
                sh:alternativePath ( ex:email ex:mbox )
            ] .
        `)
        const parser = pathParser(store)
        const pathNode = store.getObjects(DataFactory.namedNode(`${EX}Shape`), DataFactory.namedNode(`${SH}path`), null)[0]

        expect(pathToString(parser.parse(pathNode))).toBe(`${EX}email | ${EX}mbox`)
    })
})
