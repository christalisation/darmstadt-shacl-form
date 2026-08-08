import { describe, expect, it } from 'vitest'
import { DataFactory, Parser, Store } from 'n3'
import { ShapeGraphParser } from '../src/shape-graph-parser'
import { ShapeGraphRepository } from '../src/shape-graph-repository'

const EX = 'http://example.org/'
const SH = 'http://www.w3.org/ns/shacl#'
const XSD = 'http://www.w3.org/2001/XMLSchema#'

function semanticModel(turtle: string) {
    const parser = new Parser()
    const store = new Store(parser.parse(`
        @prefix ex: <${EX}> .
        @prefix sh: <${SH}> .
        @prefix xsd: <${XSD}> .

        ${turtle}
    `))
    return new ShapeGraphParser(new ShapeGraphRepository(store, ['en']))
}

describe('ShapeGraphParser', () => {
    it('builds semantic node and property definitions from a shapes graph', () => {
        const parser = semanticModel(`
            ex:BookShape
                a sh:NodeShape ;
                sh:name "Book"@en ;
                sh:targetClass ex:Book ;
                sh:property ex:TitleProperty ;
                sh:property ex:AuthorPathProperty .

            ex:TitleProperty
                sh:name "Title"@en ;
                sh:path ex:title ;
                sh:datatype xsd:string ;
                sh:minCount 1 ;
                sh:maxCount 1 ;
                sh:order 2 .

            ex:AuthorPathProperty
                sh:path [
                    sh:alternativePath ( ex:author ex:creator )
                ] ;
                sh:class ex:Person .
        `)

        const nodeShape = parser.parseNodeShape(DataFactory.namedNode(`${EX}BookShape`))
        const title = nodeShape.propertyById(`${EX}TitleProperty`)
        const author = nodeShape.propertyById(`${EX}AuthorPathProperty`)

        expect(nodeShape.label).toBe('Book')
        expect(nodeShape.targetClasses.map(term => term.value)).toEqual([`${EX}Book`])
        expect(nodeShape.properties).toHaveLength(2)

        expect(title?.label).toBe('Title')
        expect(title?.predicatePath?.value).toBe(`${EX}title`)
        expect(title?.constraints.datatype?.value).toBe(`${XSD}string`)
        expect(title?.isRequired()).toBe(true)
        expect(title?.isRepeatable()).toBe(false)
        expect(title?.order).toBe(2)

        expect(author?.alternativePredicatePaths.map(term => term.value)).toEqual([
            `${EX}author`,
            `${EX}creator`,
        ])
        expect(author?.constraints.class?.value).toBe(`${EX}Person`)
    })
})
