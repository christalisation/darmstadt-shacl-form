import { describe, expect, it } from 'vitest'
import { DataFactory, Parser, Store } from 'n3'
import { RdfReader } from '../src/rdf'
import { ShaclNodeShape, ShaclParser } from '../src/shacl'
import { FormShapeCompiler } from '../src/form-shape'

const EX = 'http://example.org/'

function storeFromTurtle(turtle: string): Store {
    const parser = new Parser()
    const prelude = `
        @prefix ex: <${EX}> .
        @prefix sh: <http://www.w3.org/ns/shacl#> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix skos: <http://www.w3.org/2004/02/skos/core#> .
    `
    return new Store(parser.parse(`${prelude}\n${turtle}`))
}

function compilerFor(store: Store): {
    compile: (iri: string) => ReturnType<FormShapeCompiler['compileNodeShape']>,
} {
    const parser = new ShaclParser(new RdfReader(store))
    const cache = new Map<string, ShaclNodeShape>()
    const resolveNodeShape = (id: any) => {
        if (cache.has(id.value)) {
            return cache.get(id.value)
        }
        if (store.countQuads(id, DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), DataFactory.namedNode('http://www.w3.org/ns/shacl#NodeShape'), null) === 0) {
            return undefined
        }
        const parsed = parser.parseNodeShape(id)
        cache.set(id.value, parsed)
        return parsed
    }
    const compiler = new FormShapeCompiler({
        languages: ['en', ''],
        prefixes: { ex: EX },
        resolveNodeShape,
        findNodeShapeByTargetClass: targetClass => store.getSubjects(DataFactory.namedNode('http://www.w3.org/ns/shacl#targetClass'), targetClass, null)[0],
        labelForTerm: term => {
            const label = store.getObjects(term, DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#label'), null)[0]
            return label?.value
        },
    })

    return {
        compile: iri => compiler.compileNodeShape(resolveNodeShape(DataFactory.namedNode(iri))!),
    }
}

describe('FormShapeCompiler', () => {
    it('projects datatype, cardinality and value constraints into form properties', () => {
        const store = storeFromTurtle(`
            ex:BookShape a sh:NodeShape ;
                sh:property [
                    sh:path ex:title ;
                    sh:name "Title" ;
                    sh:description "Shown title" ;
                    sh:datatype xsd:string ;
                    sh:minCount 1 ;
                    sh:maxCount 2 ;
                    sh:minLength 3 ;
                    sh:pattern ".+" ;
                    sh:in ( "A" "B" )
                ] .
        `)

        const shape = compilerFor(store).compile(`${EX}BookShape`)
        const property = shape.properties[0]

        expect(property.label).toBe('Title')
        expect(property.description?.value).toBe('Shown title')
        expect(property.datatype?.value).toBe('http://www.w3.org/2001/XMLSchema#string')
        expect(property.minCount).toBe(1)
        expect(property.maxCount).toBe(2)
        expect(property.minLength).toBe(3)
        expect(property.pattern).toBe('.+')
        expect(property.shaclIn?.map(term => term.value)).toEqual(['A', 'B'])
    })

    it('resolves labels and descriptions at the form compilation boundary', () => {
        const store = storeFromTurtle(`
            ex:Shape a sh:NodeShape ;
                skos:prefLabel "Fallback label" ;
                rdfs:comment "Readable description" ;
                sh:property [
                    sh:path ex:value ;
                    rdfs:label "Value label"
                ] .
        `)

        const shape = compilerFor(store).compile(`${EX}Shape`)

        expect(shape.label).toBe('Fallback label')
        expect(shape.description).toBe('Readable description')
        expect(shape.properties[0].label).toBe('Value label')
    })

    it('keeps nested sh:node definitions as form-shape references', () => {
        const store = storeFromTurtle(`
            ex:ParentShape a sh:NodeShape ;
                sh:property [
                    sh:path ex:child ;
                    sh:name "Child" ;
                    sh:node ex:ChildShape
                ] .

            ex:ChildShape a sh:NodeShape ;
                sh:property [ sh:path ex:name ; sh:name "Name" ] .
        `)

        const shape = compilerFor(store).compile(`${EX}ParentShape`)

        expect(shape.properties[0].nodeShape?.value).toBe(`${EX}ChildShape`)
        expect(shape.properties[0].nestedNodeShapes.map(term => term.value)).toEqual([`${EX}ChildShape`])
    })

    it('retains alternative paths and suppresses duplicate branch properties', () => {
        const store = storeFromTurtle(`
            ex:Shape a sh:NodeShape ;
                sh:property [
                    sh:path [ sh:alternativePath ( ex:email ex:mbox ) ] ;
                    sh:name "Contact"
                ] ;
                sh:property [
                    sh:path ex:email ;
                    sh:name "Email"
                ] ;
                sh:property [
                    sh:path ex:mbox ;
                    sh:name "Mailbox"
                ] ;
                sh:property [
                    sh:path ex:name ;
                    sh:name "Name"
                ] .
        `)

        const shape = compilerFor(store).compile(`${EX}Shape`)

        expect(shape.properties.map(property => property.label)).toEqual(['Contact', 'Name'])
        expect(shape.properties[0].path?.kind).toBe('alternative')
        expect(shape.properties[0].pathAlternatives?.map(path => path.value)).toEqual([`${EX}email`, `${EX}mbox`])
        expect(shape.properties[0].pathAlternativeLabels).toEqual({
            [`${EX}email`]: 'Email',
            [`${EX}mbox`]: 'Mailbox',
        })
    })

    it('represents sh:and composition without flattening alternatives into direct properties', () => {
        const store = storeFromTurtle(`
            ex:Shape a sh:NodeShape ;
                sh:and ( ex:ComposedShape ) ;
                sh:property [ sh:path ex:own ; sh:name "Own" ] .

            ex:ComposedShape a sh:NodeShape ;
                sh:property [ sh:path ex:composed ; sh:name "Composed" ] .
        `)

        const shape = compilerFor(store).compile(`${EX}Shape`)

        expect(shape.properties.map(property => property.label)).toEqual(['Own'])
        expect(shape.composedNodeShapes.map(term => term.value)).toEqual([`${EX}ComposedShape`])
    })

    it('keeps logical alternatives explicit', () => {
        const store = storeFromTurtle(`
            ex:Shape a sh:NodeShape ;
                sh:or ( ex:EmailShape ex:PhoneShape ) ;
                sh:property [
                    sh:path ex:contact ;
                    sh:name "Contact" ;
                    sh:xone ( ex:EmailValueShape ex:PhoneValueShape )
                ] .

            ex:EmailShape a sh:NodeShape .
            ex:PhoneShape a sh:NodeShape .
        `)

        const shape = compilerFor(store).compile(`${EX}Shape`)

        expect(shape.logicalAlternatives).toEqual([{
            kind: 'or',
            shapes: [DataFactory.namedNode(`${EX}EmailShape`), DataFactory.namedNode(`${EX}PhoneShape`)],
        }])
        expect(shape.properties[0].logicalAlternatives).toEqual([{
            kind: 'xone',
            shapes: [DataFactory.namedNode(`${EX}EmailValueShape`), DataFactory.namedNode(`${EX}PhoneValueShape`)],
        }])
    })
})
