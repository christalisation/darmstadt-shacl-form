import { describe, expect, it } from 'vitest'
import { DataFactory, Parser, Store } from 'n3'
import { readFileSync } from 'node:fs'
import { Validator } from 'shacl-engine'
import { RdfReader } from '../src/rdf'
import { ShaclNodeShape, ShaclParser, ShaclShapeResolver } from '../src/shacl'
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
        shapeResolver: new ShaclShapeResolver({
            resolveNodeShape,
            resolvePropertyShape: id => parser.parsePropertyShapeIfPresent(id),
        }),
        findNodeShapeByTargetClass: targetClass => store.getSubjects(DataFactory.namedNode('http://www.w3.org/ns/shacl#targetClass'), targetClass, null)[0],
        findCompatibleNodeShapes: baseShape => {
            const base = resolveNodeShape(baseShape)
            if (!base) return []
            const baseClasses = base.targets.flatMap(target => target.kind === 'class' ? [target.class] : [])
            return store.getSubjects(DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), DataFactory.namedNode('http://www.w3.org/ns/shacl#NodeShape'), null)
                .filter(candidate => candidate.value !== baseShape.value)
                .filter(candidate => {
                    const candidateShape = resolveNodeShape(candidate)
                    const candidateClasses = candidateShape?.targets.flatMap(target => target.kind === 'class' ? [target.class] : []) || []
                    return candidateClasses.some(candidateClass =>
                        baseClasses.some(baseClass => isSubclassOf(store, candidateClass, baseClass))
                    )
                })
        },
        labelForTerm: term => {
            const label = store.getObjects(term, DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#label'), null)[0]
            return label?.value
        },
    })

    return {
        compile: iri => compiler.compileNodeShape(resolveNodeShape(DataFactory.namedNode(iri))!),
    }
}

function isSubclassOf(store: Store, candidateClass: any, baseClass: any, visited = new Set<string>()): boolean {
    if (candidateClass.equals(baseClass)) {
        return true
    }
    if (visited.has(candidateClass.value)) {
        return false
    }
    visited.add(candidateClass.value)

    return store.getObjects(candidateClass, DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'), null)
        .some(parent => parent.termType === 'NamedNode' && isSubclassOf(store, parent, baseClass, visited))
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
        expect(shape.role).toBe('STRUCTURAL')
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

    it('preserves sh:message as validation-message metadata, not description text', () => {
        const store = storeFromTurtle(`
            ex:Shape a sh:NodeShape ;
                sh:name "Shape label" ;
                sh:description "Shape help" ;
                sh:message "Shape validation message" ;
                sh:property [
                    sh:path ex:value ;
                    rdfs:comment "Property help" ;
                    sh:message "Property validation message"
                ] .
        `)

        const shape = compilerFor(store).compile(`${EX}Shape`)

        expect(shape.description).toBe('Shape help')
        expect(shape.messages.map(message => message.value)).toEqual(['Shape validation message'])
        expect(shape.properties[0].description?.value).toBe('Property help')
        expect(shape.properties[0].messages.map(message => message.value)).toEqual(['Property validation message'])
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

    it('includes effective properties from sh:and composition', () => {
        const store = storeFromTurtle(`
            ex:Shape a sh:NodeShape ;
                sh:and ( ex:ComposedShape ) ;
                sh:property [ sh:path ex:own ; sh:name "Own" ] .

            ex:ComposedShape a sh:NodeShape ;
                sh:property [ sh:path ex:composed ; sh:name "Composed" ] .
        `)

        const shape = compilerFor(store).compile(`${EX}Shape`)

        expect(shape.properties.map(property => property.label)).toEqual(['Own', 'Composed'])
        expect(shape.composedNodeShapes.map(term => term.value)).toEqual([`${EX}ComposedShape`])
        expect(shape.role).toBe('STRUCTURAL')
    })

    it('includes anonymous sh:and property-shape members', () => {
        const store = storeFromTurtle(`
            ex:Shape a sh:NodeShape ;
                sh:and (
                    ex:BaseShape
                    [
                        sh:path ex:extra ;
                        sh:name "Extra"
                    ]
                ) .

            ex:BaseShape a sh:NodeShape ;
                sh:property [
                    sh:path ex:base ;
                    sh:name "Base"
                ] .
        `)

        const shape = compilerFor(store).compile(`${EX}Shape`)

        expect(shape.properties.map(property => property.label)).toEqual(['Base', 'Extra'])
        const extraSources = shape.properties.find(property => property.label === 'Extra')?.sourceShapes || []
        expect(extraSources).toHaveLength(2)
        expect(extraSources[1].termType).toBe('BlankNode')
        expect(shape.role).toBe('STRUCTURAL')
    })

    it('classifies value-only node shapes and projects their focus-node constraints', () => {
        const store = storeFromTurtle(`
            ex:ValueShape a sh:NodeShape ;
                sh:datatype xsd:string ;
                sh:nodeKind sh:Literal ;
                sh:pattern "^[a-z]+$" ;
                sh:targetObjectsOf ex:value .
        `)

        const shape = compilerFor(store).compile(`${EX}ValueShape`)

        expect(shape.role).toBe('VALUE_ONLY')
        expect(shape.properties).toEqual([])
        expect(shape.valueConstraints.datatype?.value).toBe('http://www.w3.org/2001/XMLSchema#string')
        expect(shape.valueConstraints.nodeKind?.value).toBe('http://www.w3.org/ns/shacl#Literal')
        expect(shape.valueConstraints.pattern).toBe('^[a-z]+$')
    })

    it('uses value-only sh:node shapes as property value constraints, not nested empty forms', () => {
        const store = storeFromTurtle(`
            ex:ParentShape a sh:NodeShape ;
                sh:property [
                    sh:path ex:child ;
                    sh:name "Child" ;
                    sh:node ex:ChildValueShape
                ] .

            ex:ChildValueShape a sh:NodeShape ;
                sh:datatype xsd:string ;
                sh:nodeKind sh:Literal .
        `)

        const shape = compilerFor(store).compile(`${EX}ParentShape`)
        const property = shape.properties[0]

        expect(property.nodeShape?.value).toBe(`${EX}ChildValueShape`)
        expect(property.nestedNodeShapes).toEqual([])
        expect(property.datatype?.value).toBe('http://www.w3.org/2001/XMLSchema#string')
        expect(property.nodeKind?.value).toBe('http://www.w3.org/ns/shacl#Literal')
    })

    it('does not treat logical alternatives as unconditional effective properties', () => {
        const store = storeFromTurtle(`
            ex:Shape a sh:NodeShape ;
                sh:or (
                    [
                        sh:property [
                            sh:path ex:email ;
                            sh:name "Email"
                        ]
                    ]
                    [
                        sh:property [
                            sh:path ex:phone ;
                            sh:name "Phone"
                        ]
                    ]
                ) ;
                sh:xone ( ex:A ex:B ) .
        `)

        const shape = compilerFor(store).compile(`${EX}Shape`)

        expect(shape.properties).toEqual([])
        expect(shape.logicalAlternatives.map(alternative => alternative.kind)).toEqual(['or', 'xone'])
        expect(shape.role).toBe('NON_RENDERABLE')
    })

    it('handles cyclic sh:and composition without recursing indefinitely', () => {
        const store = storeFromTurtle(`
            ex:A a sh:NodeShape ;
                sh:property [ sh:path ex:a ; sh:name "A property" ] ;
                sh:and ( ex:B ) .

            ex:B a sh:NodeShape ;
                sh:property [ sh:path ex:b ; sh:name "B property" ] ;
                sh:and ( ex:A ) .
        `)

        const shape = compilerFor(store).compile(`${EX}A`)

        expect(shape.properties.map(property => property.label)).toEqual(['A property', 'B property'])
    })

    it('finds compatible concrete node-shape choices through rdfs:subClassOf', () => {
        const store = storeFromTurtle(`
            ex:ConcreteClass rdfs:subClassOf ex:BaseClass .

            ex:ContainerShape a sh:NodeShape ;
                sh:property [
                    sh:path ex:value ;
                    sh:name "Value" ;
                    sh:node ex:BaseShape
                ] .

            ex:BaseShape a sh:NodeShape ;
                sh:targetClass ex:BaseClass ;
                sh:property [ sh:path ex:base ; sh:name "Base" ] .

            ex:ConcreteShape a sh:NodeShape ;
                sh:targetClass ex:ConcreteClass ;
                sh:property [ sh:path ex:source ; sh:name "Source" ] .
        `)

        const shape = compilerFor(store).compile(`${EX}ContainerShape`)

        expect(shape.properties[0].compatibleNodeShapes.map(term => term.value)).toEqual([`${EX}ConcreteShape`])
    })

    it('compiles RML PredicateObjectMap effective properties from all sh:and branches', () => {
        const store = new Store(new Parser().parse(readFileSync('rml/rml-core-io.ttl', 'utf8')))

        const shape = compilerFor(store).compile('http://w3id.org/rml/shapes/RMLPredicateObjectMapShape')
        const labels = shape.properties.map(property => property.label)

        expect(labels).toContain('graph/graphMap')
        expect(labels).toContain('logicalTarget')
        expect(labels).toContain('predicate/predicateMap')
        expect(labels).toContain('object/objectMap/quotedTriplesMap')
    })

    it('compiles RML ChildMap effective properties even without direct sh:property', () => {
        const store = new Store(new Parser().parse(readFileSync('rml/rml-core-io.ttl', 'utf8')))

        const shape = compilerFor(store).compile('http://w3id.org/rml/shapes/RMLChildMapShape')
        const labels = shape.properties.map(property => property.label)

        expect(labels).toContain('template/constant/reference/functionExecution')
        expect(shape.properties.length).toBeGreaterThan(0)
    })

    it('does not invent RML logical-source compatibility without class hierarchy data', () => {
        const store = new Store(new Parser().parse(readFileSync('rml/rml-core-io.ttl', 'utf8')))

        const shape = compilerFor(store).compile('http://w3id.org/rml/shapes/RMLTriplesMapPropertiesShape')
        const logicalSource = shape.properties.find(property => property.label === 'logicalSource')

        expect(logicalSource?.nodeShape?.value).toBe('http://w3id.org/rml/shapes/RMLAbstractLogicalSourceShape')
        expect(logicalSource?.compatibleNodeShapes).toEqual([])
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

    it('preserves sh:message in the final SHACL validation report', async () => {
        const store = storeFromTurtle(`
            ex:Shape a sh:NodeShape ;
                sh:targetNode ex:Focus ;
                sh:property [
                    sh:path ex:required ;
                    sh:minCount 1 ;
                    sh:message "Required value is missing"
                ] .
        `)

        const report = await new Validator(store, { details: true, factory: DataFactory }).validate({ dataset: store })
        const messages = JSON.stringify(report)

        expect(report.conforms).toBe(false)
        expect(messages).toContain('Required value is missing')
    })
})
