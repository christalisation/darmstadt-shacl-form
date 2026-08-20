import { describe, expect, it } from 'vitest'
import { DataFactory, Parser, Store } from 'n3'
import { Validator } from 'shacl-engine'
import { RdfReader } from '../src/rdf'
import { ShaclParser, ShaclShapeRegistry, ShaclShapeResolver } from '../src/shacl'
import { FormShapeCompiler, FormShapeRegistry } from '../src/form-shape'
import { ShaclPropertyTemplate } from '../src/dom-form/property-template'
import { Config } from '../src/config'
import { ShaclNode } from '../src/dom-form/node'

const EX = 'http://example.org/'
const SH = 'http://www.w3.org/ns/shacl#'
const XSD = 'http://www.w3.org/2001/XMLSchema#'

function storeFromTurtle(turtle: string): Store {
    const parser = new Parser()
    const prelude = `
        @prefix ex: <${EX}> .
        @prefix sh: <${SH}> .
        @prefix xsd: <${XSD}> .
    `
    return new Store(parser.parse(`${prelude}\n${turtle}`))
}

function shapeLayers(turtle: string): { store: Store, shaclShapes: ShaclShapeRegistry, formShapes: FormShapeRegistry } {
    const store = storeFromTurtle(turtle)
    const shaclShapes = new ShaclShapeRegistry(store, ['en'])
    const resolver = new ShaclShapeResolver({
        resolveNodeShape: id => shaclShapes.getNodeShape(id),
        resolvePropertyShape: id => shaclShapes.getPropertyShape(id),
    })
    let formShapes!: FormShapeRegistry
    const compiler = new FormShapeCompiler({
        languages: ['en'],
        prefixes: { ex: EX },
        resolveNodeShape: id => shaclShapes.getNodeShape(id),
        findNodeShapeByTargetClass: targetClass => shaclShapes.findNodeShapeByTargetClass(targetClass),
        findNodeShapesByTargetObjectsOf: predicate => shaclShapes.findNodeShapesByTargetObjectsOf(predicate),
        findNodeShapesByLogicalBranch: branch => shaclShapes.findNodeShapesByLogicalBranch(branch),
        findCompatibleNodeShapes: baseShape => formShapes.getCompatibleNodeShapeTerms(baseShape),
        labelForTerm: term => shaclShapes.getLabel(term),
        shapeResolver: resolver,
    })
    formShapes = new FormShapeRegistry(compiler, shaclShapes)
    return { store, shaclShapes, formShapes }
}

async function validate(shapes: Store, data: Store): Promise<any> {
    return new Validator(shapes, { details: true, factory: DataFactory }).validate({ dataset: data })
}

describe('W3C-derived form fixtures', () => {
    it('projects and adapts property/maxExclusive-001 semantics', async () => {
        // Source reference: W3C SHACL Core test property/maxExclusive-001.
        //
        // VERBATIM SHACL SUBGRAPH:
        // A property shape constrains ex:age with sh:maxExclusive 10.
        const { store, shaclShapes, formShapes } = shapeLayers(`
            ex:PersonShape a sh:NodeShape ;
                sh:targetNode ex:Alice ;
                sh:property [
                    sh:path ex:age ;
                    sh:name "Age" ;
                    sh:datatype xsd:integer ;
                    sh:maxExclusive 10
                ] .
        `)

        const parser = new ShaclParser(new RdfReader(store))
        const semanticShape = parser.parseNodeShape(DataFactory.namedNode(`${EX}PersonShape`))
        const semanticProperty = semanticShape.propertyShapes[0]
        expect(semanticProperty.constraints.some(constraint => constraint.kind === 'maxExclusive')).toBe(true)

        const formProperty = formShapes.getNodeShape(DataFactory.namedNode(`${EX}PersonShape`))?.properties[0]
        expect(formProperty?.maxExclusive).toBe(10)

        const template = ShaclPropertyTemplate.fromFormPropertyShape(
            formProperty!,
            {} as ShaclNode,
            { store, shaclShapes, formShapes, languages: ['en'], prefixes: { ex: EX } } as unknown as Config
        )
        expect(template.maxExclusive).toBe(10)

        const rejected = await validate(store, storeFromTurtle('ex:Alice ex:age 10 .'))
        const accepted = await validate(store, storeFromTurtle('ex:Alice ex:age 9 .'))

        expect(rejected.conforms).toBe(false)
        expect(accepted.conforms).toBe(true)
    })

    it('preserves property/equals-001 semantics without claiming ex-ante UI enforcement', async () => {
        // Source reference: W3C SHACL Core test property/equals-001.
        //
        // VERBATIM SHACL SUBGRAPH:
        // A property shape constrains ex:firstName with sh:equals ex:givenName.
        //
        // FORM-AUTHORING ADAPTATION:
        // A second property shape for ex:givenName is added so both predicates
        // can be edited by the generic form. This does not add ex-ante equals
        // enforcement to the UI; final SHACL validation remains authoritative.
        const { store, formShapes } = shapeLayers(`
            ex:PersonShape a sh:NodeShape ;
                sh:targetNode ex:Alice ;
                sh:property [
                    sh:path ex:firstName ;
                    sh:name "First name" ;
                    sh:equals ex:givenName
                ] ;
                sh:property [
                    sh:path ex:givenName ;
                    sh:name "Given name"
                ] .
        `)

        const parser = new ShaclParser(new RdfReader(store))
        const semanticProperty = parser.parseNodeShape(DataFactory.namedNode(`${EX}PersonShape`)).propertyShapes[0]
        expect(semanticProperty.constraints).toContainEqual({
            kind: 'equals',
            property: DataFactory.namedNode(`${EX}givenName`),
        })

        const formShape = formShapes.getNodeShape(DataFactory.namedNode(`${EX}PersonShape`))
        expect(formShape?.properties.map(property => property.writablePath?.value)).toEqual([
            `${EX}firstName`,
            `${EX}givenName`,
        ])

        const rejected = await validate(store, storeFromTurtle(`
            ex:Alice ex:firstName "Alice" ;
                ex:givenName "Alicia" .
        `))
        const accepted = await validate(store, storeFromTurtle(`
            ex:Alice ex:firstName "Alice" ;
                ex:givenName "Alice" .
        `))

        expect(rejected.conforms).toBe(false)
        expect(accepted.conforms).toBe(true)
    })

    it('projects property/hasValue-001 semantics and preserves non-exclusive required value behavior', async () => {
        // Source reference: W3C SHACL Core test property/hasValue-001.
        //
        // VERBATIM SHACL SUBGRAPH:
        // A property shape requires ex:gender to include the literal "male".
        const { store, shaclShapes, formShapes } = shapeLayers(`
            ex:PersonShape a sh:NodeShape ;
                sh:targetNode ex:Bob ;
                sh:property [
                    sh:path ex:gender ;
                    sh:name "Gender" ;
                    sh:hasValue "male"
                ] .
        `)

        const parser = new ShaclParser(new RdfReader(store))
        const semanticProperty = parser.parseNodeShape(DataFactory.namedNode(`${EX}PersonShape`)).propertyShapes[0]
        expect(semanticProperty.constraints).toContainEqual({
            kind: 'hasValue',
            value: DataFactory.literal('male'),
        })

        const formProperty = formShapes.getNodeShape(DataFactory.namedNode(`${EX}PersonShape`))?.properties[0]
        expect(formProperty?.hasValue).toEqual(DataFactory.literal('male'))

        const template = ShaclPropertyTemplate.fromFormPropertyShape(
            formProperty!,
            {} as ShaclNode,
            { store, shaclShapes, formShapes, languages: ['en'], prefixes: { ex: EX } } as unknown as Config
        )
        expect(template.hasValue).toEqual(DataFactory.literal('male'))

        const rejected = await validate(store, storeFromTurtle('ex:Bob ex:gender "female" .'))
        const acceptedWithOnlyRequiredValue = await validate(store, storeFromTurtle('ex:Bob ex:gender "male" .'))
        const acceptedWithAdditionalValue = await validate(store, storeFromTurtle(`
            ex:Bob ex:gender "male", "other" .
        `))

        expect(rejected.conforms).toBe(false)
        expect(acceptedWithOnlyRequiredValue.conforms).toBe(true)
        expect(acceptedWithAdditionalValue.conforms).toBe(true)
    })
})
