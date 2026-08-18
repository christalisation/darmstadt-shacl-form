import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataFactory, Parser, Store, Term } from 'n3'
import { DATA_GRAPH, DCTERMS_PREDICATE_CONFORMS_TO, RDF_PREDICATE_TYPE } from '../src/constants'
import { ShapeGraphModel } from '../src/shape-graph-model'
import { getAlternativePredicatePaths, pathToString, ShaclPath } from '../src/shacl-path'

const EX = 'http://example.org/'
const SH = 'http://www.w3.org/ns/shacl#'

function storeFromTurtle(turtle: string): Store {
    const parser = new Parser()
    const prelude = `
        @prefix ex: <${EX}> .
        @prefix sh: <${SH}> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
    `
    return new Store(parser.parse(`${prelude}\n${turtle}`))
}

function shapeGraph(turtle: string): ShapeGraphModel {
    return new ShapeGraphModel(storeFromTurtle(turtle), ['en'])
}

function propertyShapes(model: ShapeGraphModel, nodeShapeIri = `${EX}Shape`): Term[] {
    return model.getPropertyShapes(DataFactory.namedNode(nodeShapeIri))
}

function propertyPath(model: ShapeGraphModel, nodeShapeIri = `${EX}Shape`): ShaclPath {
    const path = model.getPath(propertyShapes(model, nodeShapeIri)[0])
    expect(path).toBeDefined()
    return path!
}

describe('ShapeGraphModel', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns explicitly requested root node shapes', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        const model = shapeGraph(`
            ex:BookShape a sh:NodeShape .
            ex:PersonShape a sh:NodeShape .
            ex:UnusedPropertyShape a sh:PropertyShape .
        `)

        const roots = model.findRootNodeShapes({
            shapeSubject: `${EX}BookShape ${EX}PersonShape ${EX}UnknownShape`,
        })

        expect(roots.map(root => root.value)).toEqual([
            `${EX}BookShape`,
            `${EX}PersonShape`,
        ])
        expect(console.warn).toHaveBeenCalledWith(`shapes graph does not contain requested root shape ${EX}UnknownShape`)
    })

    it('infers root node shapes from data graph rdf:type targets', () => {
        const store = new Store([
            DataFactory.quad(
                DataFactory.namedNode(`${EX}PersonShape`),
                RDF_PREDICATE_TYPE,
                DataFactory.namedNode(`${SH}NodeShape`),
            ),
            DataFactory.quad(
                DataFactory.namedNode(`${EX}PersonShape`),
                DataFactory.namedNode(`${SH}targetClass`),
                DataFactory.namedNode(`${EX}Person`),
            ),
            DataFactory.quad(
                DataFactory.namedNode(`${EX}Alice`),
                RDF_PREDICATE_TYPE,
                DataFactory.namedNode(`${EX}Person`),
                DATA_GRAPH,
            ),
        ])
        const model = new ShapeGraphModel(store, ['en'])

        const roots = model.findRootNodeShapes({ valuesSubject: `${EX}Alice` })

        expect(roots.map(root => root.value)).toEqual([`${EX}PersonShape`])
    })

    it('infers root node shapes from data graph dcterms:conformsTo', () => {
        const store = new Store([
            DataFactory.quad(
                DataFactory.namedNode(`${EX}BookShape`),
                RDF_PREDICATE_TYPE,
                DataFactory.namedNode(`${SH}NodeShape`),
            ),
            DataFactory.quad(
                DataFactory.namedNode(`${EX}Book1`),
                DCTERMS_PREDICATE_CONFORMS_TO,
                DataFactory.namedNode(`${EX}BookShape`),
                DATA_GRAPH,
            ),
        ])
        const model = new ShapeGraphModel(store, ['en'])

        const roots = model.findRootNodeShapes({ valuesSubject: `${EX}Book1` })

        expect(roots.map(root => root.value)).toEqual([`${EX}BookShape`])
    })

    it('extracts property shapes, target classes, groups, lists and labels', () => {
        const store = storeFromTurtle(`
            ex:Shape
                a sh:NodeShape ;
                sh:targetClass ex:Book ;
                sh:property ex:TitleProperty .

            ex:TitleProperty
                sh:name "Titre"@fr ;
                sh:name "Title"@en ;
                sh:group ex:MainGroup ;
                sh:in ( ex:Draft ex:Published ) .
        `)
        const model = new ShapeGraphModel(store, ['en'])
        const [propertyShape] = propertyShapes(model)

        expect(model.getTargetClasses(DataFactory.namedNode(`${EX}Shape`)).map(term => term.value)).toEqual([`${EX}Book`])
        expect(model.getGroup(propertyShape)?.value).toBe(`${EX}MainGroup`)
        expect(model.getLabel(propertyShape)).toBe('Title')

        const listNode = store.getObjects(propertyShape, `${SH}in`, null)[0]
        expect(model.getList(listNode).map(term => term.value)).toEqual([
            `${EX}Draft`,
            `${EX}Published`,
        ])
    })

    it('parses a simple predicate path', () => {
        const model = shapeGraph(`
            ex:Shape a sh:NodeShape ;
                sh:property [
                    sh:path ex:title ;
                ] .
        `)

        expect(propertyPath(model)).toEqual({
            kind: 'predicate',
            predicate: DataFactory.namedNode(`${EX}title`),
        })
    })

    it('parses alternative paths', () => {
        const model = shapeGraph(`
            ex:Shape a sh:NodeShape ;
                sh:property [
                    sh:path [
                        sh:alternativePath ( ex:email ex:mbox )
                    ] ;
                ] .
        `)

        const path = propertyPath(model)

        expect(path.kind).toBe('alternative')
        expect(pathToString(path)).toBe(`${EX}email | ${EX}mbox`)
        expect(getAlternativePredicatePaths(path)?.map(predicate => predicate.value)).toEqual([
            `${EX}email`,
            `${EX}mbox`,
        ])
    })

    it('parses sequence, inverse and quantified paths', () => {
        const model = shapeGraph(`
            ex:Shape a sh:NodeShape ;
                sh:property [
                    sh:path (
                        ex:author
                        [ sh:inversePath ex:createdBy ]
                        [ sh:zeroOrMorePath ex:parent ]
                    ) ;
                ] .
        `)

        const path = propertyPath(model)

        expect(path.kind).toBe('sequence')
        expect(pathToString(path)).toBe(`${EX}author / ^${EX}createdBy / ${EX}parent*`)
    })

    it('keeps alternative path branches available as templates but not visible duplicates', () => {
        const model = shapeGraph(`
            ex:Shape a sh:NodeShape ;
                sh:property [
                    sh:path [ sh:alternativePath ( ex:subjectMap ex:subject ) ] ;
                    sh:maxCount 1 ;
                ] ;
                sh:property [
                    sh:path ex:subject ;
                    sh:nodeKind sh:IRI ;
                ] ;
                sh:property [
                    sh:path ex:subjectMap ;
                    sh:node ex:SubjectMapShape ;
                ] ;
                sh:property [
                    sh:path ex:baseIRI ;
                    sh:nodeKind sh:IRI ;
                ] .

            ex:SubjectMapShape a sh:NodeShape .
        `)

        const allLabels = model.getPropertyShapes(DataFactory.namedNode(`${EX}Shape`))
            .map(shape => pathToString(model.getPath(shape)!))
        const renderedLabels = model.getRenderablePropertyShapes(DataFactory.namedNode(`${EX}Shape`))
            .map(shape => pathToString(model.getPath(shape)!))

        expect(allLabels).toEqual([
            `${EX}subjectMap | ${EX}subject`,
            `${EX}subject`,
            `${EX}subjectMap`,
            `${EX}baseIRI`,
        ])
        expect(renderedLabels).toEqual([
            `${EX}subjectMap | ${EX}subject`,
            `${EX}baseIRI`,
        ])
    })

    it('detects renderable node-shape content through sh:and inheritance', () => {
        const model = shapeGraph(`
            ex:StructuralShape a sh:NodeShape ;
                sh:and ( ex:InheritedShape ) .

            ex:InheritedShape a sh:NodeShape ;
                sh:property [
                    sh:path ex:value ;
                ] .

            ex:ValueShape a sh:NodeShape ;
                sh:nodeKind sh:IRI .
        `)

        expect(model.hasRenderableNodeShapeContent(DataFactory.namedNode(`${EX}StructuralShape`))).toBe(true)
        expect(model.hasRenderableNodeShapeContent(DataFactory.namedNode(`${EX}ValueShape`))).toBe(false)
    })

    it('keeps all NodeShapes available as generic root choices', () => {
        const model = shapeGraph(`
            ex:DirectShape a sh:NodeShape ;
                sh:property [ sh:path ex:direct ] .

            ex:ComposedShape a sh:NodeShape ;
                sh:and ( ex:BaseShape ) .

            ex:BaseShape a sh:NodeShape ;
                sh:property [ sh:path ex:base ] .

            ex:ValueOnlyShape a sh:NodeShape ;
                sh:datatype xsd:string ;
                sh:nodeKind sh:Literal ;
                sh:targetObjectsOf ex:value .

            ex:PlainPropertyShape a sh:PropertyShape ;
                sh:path ex:value .
        `)

        expect(model.findRootNodeShapes().map(root => root.value)).toEqual([
            `${EX}DirectShape`,
            `${EX}ComposedShape`,
            `${EX}BaseShape`,
            `${EX}ValueOnlyShape`,
        ])
    })

    it('keeps explicit root configuration stronger than generic classification', () => {
        const model = shapeGraph(`
            ex:ValueOnlyShape a sh:NodeShape ;
                sh:datatype xsd:string ;
                sh:nodeKind sh:Literal .
        `)

        const roots = model.findRootNodeShapes({ shapeSubject: `${EX}ValueOnlyShape` })

        expect(roots.map(root => root.value)).toEqual([`${EX}ValueOnlyShape`])
    })

    it('keeps targetObjectsOf value-constraint shapes in broad root fallback', () => {
        const model = shapeGraph(`
            ex:ChildValueShape a sh:NodeShape ;
                sh:datatype xsd:string ;
                sh:nodeKind sh:Literal ;
                sh:targetObjectsOf ex:child .
        `)

        expect(model.findRootNodeShapes().map(root => root.value)).toEqual([`${EX}ChildValueShape`])
    })

    it('resolves nested structural and value-only sh:node shapes independently from root choices', () => {
        const model = shapeGraph(`
            ex:ParentShape a sh:NodeShape ;
                sh:property [
                    sh:path ex:structuralChild ;
                    sh:node ex:StructuralChildShape
                ] ;
                sh:property [
                    sh:path ex:valueChild ;
                    sh:node ex:ValueChildShape
                ] .

            ex:StructuralChildShape a sh:NodeShape ;
                sh:property [ sh:path ex:name ] .

            ex:ValueChildShape a sh:NodeShape ;
                sh:datatype xsd:string ;
                sh:nodeKind sh:Literal .
        `)

        const parent = model.getFormNodeShape(DataFactory.namedNode(`${EX}ParentShape`))
        const structural = parent?.properties.find(property => property.writablePath?.value === `${EX}structuralChild`)
        const valueOnly = parent?.properties.find(property => property.writablePath?.value === `${EX}valueChild`)

        expect(model.findRootNodeShapes().map(root => root.value)).toContain(`${EX}ValueChildShape`)
        expect(structural?.nestedNodeShapes.map(shape => shape.value)).toEqual([`${EX}StructuralChildShape`])
        expect(valueOnly?.nestedNodeShapes).toEqual([])
        expect(valueOnly?.datatype?.value).toBe('http://www.w3.org/2001/XMLSchema#string')
        expect(valueOnly?.nodeKind?.value).toBe(`${SH}Literal`)
    })
})
