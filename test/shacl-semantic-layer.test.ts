import { describe, expect, it } from 'vitest'
import { DataFactory, Parser, Store } from 'n3'
import { RdfReader } from '../src/rdf'
import { ShaclParser, ShaclPathParser, SH } from '../src/shacl'

const EX = 'http://example.org/'

function storeFromTurtle(turtle: string): Store {
    const parser = new Parser()
    const prelude = `
        @prefix ex: <${EX}> .
        @prefix sh: <http://www.w3.org/ns/shacl#> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
    `
    return new Store(parser.parse(`${prelude}\n${turtle}`))
}

describe('SHACL semantic layer', () => {
    it('parses node shapes, property shapes, targets, metadata and supported constraints', () => {
        const shape = DataFactory.namedNode(`${EX}BookShape`)
        const store = storeFromTurtle(`
            ex:BookShape
                a sh:NodeShape ;
                sh:targetClass ex:Book ;
                sh:name "Book" ;
                sh:property [
                    sh:path ex:title ;
                    sh:name "Title" ;
                    sh:datatype xsd:string ;
                    sh:minCount 1 ;
                    sh:maxCount 1 ;
                    sh:pattern ".+" ;
                    sh:in ( "A" "B" ) ;
                ] .
        `)

        const parsed = new ShaclParser(new RdfReader(store)).parseNodeShape(shape)

        expect(parsed.id).toEqual(shape)
        expect(parsed.targets).toEqual([{ kind: 'class', class: DataFactory.namedNode(`${EX}Book`) }])
        expect(parsed.metadata.names.map(name => name.value)).toEqual(['Book'])
        expect(parsed.propertyShapes).toHaveLength(1)
        expect(parsed.propertyShapes[0].path).toEqual({
            kind: 'predicate',
            predicate: DataFactory.namedNode(`${EX}title`),
        })
        expect(parsed.propertyShapes[0].constraints.map(constraint => constraint.kind)).toEqual([
            'datatype',
            'minCount',
            'maxCount',
            'pattern',
            'in',
        ])
    })

    it('reads RDF lists while allowing rdf:type triples on list nodes', () => {
        const store = storeFromTurtle(`
            ex:Shape sh:property [
                sh:path [
                    sh:alternativePath ( ex:title ex:name )
                ]
            ] .

            [] a ex:AnnotatedListNode ;
                sh:alternativePath ( ex:legacy ex:modern ) .
        `)

        const rdf = new RdfReader(store)
        const propertyShape = store.getObjects(DataFactory.namedNode(`${EX}Shape`), SH.property, null)[0]
        const pathNode = store.getObjects(propertyShape, SH.path, null)[0]
        const parsed = new ShaclPathParser(rdf).parse(pathNode)

        expect(parsed.kind).toBe('alternative')
        if (parsed.kind === 'alternative') {
            expect(parsed.paths.map(path => path.kind)).toEqual(['predicate', 'predicate'])
        }
    })
})
