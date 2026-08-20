import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataFactory, Parser, Store, Term } from 'n3'
import { DATA_GRAPH, DCTERMS_PREDICATE_CONFORMS_TO, RDF_PREDICATE_TYPE } from '../src/constants'
import { FormRootSelection, FormShapeCompiler, FormShapeRegistry } from '../src/form-shape'
import { getAlternativePredicatePaths, pathToString, ShaclPath, ShaclShapeRegistry, ShaclShapeResolver } from '../src/shacl'

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

type ShapeLayers = {
    shaclShapes: ShaclShapeRegistry
    formShapes: FormShapeRegistry
    rootSelection: FormRootSelection
}

function createShapeLayers(store: Store): ShapeLayers {
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
    return {
        shaclShapes,
        formShapes,
        rootSelection: new FormRootSelection(store, shaclShapes),
    }
}

function shapeLayers(turtle: string): ShapeLayers {
    return createShapeLayers(storeFromTurtle(turtle))
}

function propertyShapes(layers: ShapeLayers, nodeShapeIri = `${EX}Shape`): Term[] {
    return layers.shaclShapes.getPropertyShapes(DataFactory.namedNode(nodeShapeIri))
}

function propertyPath(layers: ShapeLayers, nodeShapeIri = `${EX}Shape`): ShaclPath {
    const path = layers.shaclShapes.getPath(propertyShapes(layers, nodeShapeIri)[0])
    expect(path).toBeDefined()
    return path!
}

describe('SHACL and Form Shape registries', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns explicitly requested root node shapes', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        const layers = shapeLayers(`
            ex:BookShape a sh:NodeShape .
            ex:PersonShape a sh:NodeShape .
            ex:UnusedPropertyShape a sh:PropertyShape .
        `)

        const roots = layers.rootSelection.findRootNodeShapes({
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
        const layers = createShapeLayers(store)

        const roots = layers.rootSelection.findRootNodeShapes({ valuesSubject: `${EX}Alice` })

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
        const layers = createShapeLayers(store)

        const roots = layers.rootSelection.findRootNodeShapes({ valuesSubject: `${EX}Book1` })

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
        const layers = createShapeLayers(store)
        const [propertyShape] = propertyShapes(layers)

        expect(layers.shaclShapes.getTargetClasses(DataFactory.namedNode(`${EX}Shape`)).map(term => term.value)).toEqual([`${EX}Book`])
        expect(layers.shaclShapes.getGroup(propertyShape)?.value).toBe(`${EX}MainGroup`)
        expect(layers.shaclShapes.getLabel(propertyShape)).toBe('Title')

        const listNode = store.getObjects(propertyShape, `${SH}in`, null)[0]
        expect(layers.shaclShapes.getList(listNode).map(term => term.value)).toEqual([
            `${EX}Draft`,
            `${EX}Published`,
        ])
    })

    it('parses a simple predicate path', () => {
        const layers = shapeLayers(`
            ex:Shape a sh:NodeShape ;
                sh:property [
                    sh:path ex:title ;
                ] .
        `)

        expect(propertyPath(layers)).toEqual({
            kind: 'predicate',
            predicate: DataFactory.namedNode(`${EX}title`),
        })
    })

    it('parses alternative paths', () => {
        const layers = shapeLayers(`
            ex:Shape a sh:NodeShape ;
                sh:property [
                    sh:path [
                        sh:alternativePath ( ex:email ex:mbox )
                    ] ;
                ] .
        `)

        const path = propertyPath(layers)

        expect(path.kind).toBe('alternative')
        expect(pathToString(path)).toBe(`${EX}email | ${EX}mbox`)
        expect(getAlternativePredicatePaths(path)?.map(predicate => predicate.value)).toEqual([
            `${EX}email`,
            `${EX}mbox`,
        ])
    })

    it('parses sequence, inverse and quantified paths', () => {
        const layers = shapeLayers(`
            ex:Shape a sh:NodeShape ;
                sh:property [
                    sh:path (
                        ex:author
                        [ sh:inversePath ex:createdBy ]
                        [ sh:zeroOrMorePath ex:parent ]
                    ) ;
                ] .
        `)

        const path = propertyPath(layers)

        expect(path.kind).toBe('sequence')
        expect(pathToString(path)).toBe(`${EX}author / ^${EX}createdBy / ${EX}parent*`)
    })

    it('keeps alternative path branches available as templates but not visible duplicates', () => {
        const layers = shapeLayers(`
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

        const allLabels = layers.shaclShapes.getPropertyShapes(DataFactory.namedNode(`${EX}Shape`))
            .map(shape => pathToString(layers.shaclShapes.getPath(shape)!))
        const renderedLabels = layers.formShapes.getRenderablePropertyShapeTerms(DataFactory.namedNode(`${EX}Shape`))
            .map(shape => pathToString(layers.shaclShapes.getPath(shape)!))

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
        const layers = shapeLayers(`
            ex:StructuralShape a sh:NodeShape ;
                sh:and ( ex:InheritedShape ) .

            ex:InheritedShape a sh:NodeShape ;
                sh:property [
                    sh:path ex:value ;
                ] .

            ex:ValueShape a sh:NodeShape ;
                sh:nodeKind sh:IRI .
        `)

        expect(layers.formShapes.hasRenderableNodeShapeContent(DataFactory.namedNode(`${EX}StructuralShape`))).toBe(true)
        expect(layers.formShapes.hasRenderableNodeShapeContent(DataFactory.namedNode(`${EX}ValueShape`))).toBe(false)
    })

    it('keeps all NodeShapes available as generic root choices', () => {
        const layers = shapeLayers(`
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

        expect(layers.rootSelection.findRootNodeShapes().map(root => root.value)).toEqual([
            `${EX}DirectShape`,
            `${EX}ComposedShape`,
            `${EX}BaseShape`,
            `${EX}ValueOnlyShape`,
        ])
    })

    it('keeps anonymous NodeShapes available without treating PropertyShapes as roots', () => {
        const layers = shapeLayers(`
            [
                a sh:NodeShape ;
                sh:name "Anonymous Shape" ;
                sh:property [ sh:path ex:value ]
            ] .

            ex:NamedPropertyShape a sh:PropertyShape ;
                sh:path ex:notARoot .
        `)

        const roots = layers.rootSelection.findRootNodeShapes()

        expect(roots).toHaveLength(1)
        expect(roots[0].termType).toBe('BlankNode')
        expect(layers.formShapes.getNodeShape(roots[0])?.label).toBe('Anonymous Shape')
    })

    it('keeps explicit root configuration stronger than broad root fallback', () => {
        const layers = shapeLayers(`
            ex:ValueOnlyShape a sh:NodeShape ;
                sh:datatype xsd:string ;
                sh:nodeKind sh:Literal .
        `)

        const roots = layers.rootSelection.findRootNodeShapes({ shapeSubject: `${EX}ValueOnlyShape` })

        expect(roots.map(root => root.value)).toEqual([`${EX}ValueOnlyShape`])
    })

    it('keeps targetObjectsOf value-constraint shapes in broad root fallback', () => {
        const layers = shapeLayers(`
            ex:ChildValueShape a sh:NodeShape ;
                sh:datatype xsd:string ;
                sh:nodeKind sh:Literal ;
                sh:targetObjectsOf ex:child .
        `)

        expect(layers.rootSelection.findRootNodeShapes().map(root => root.value)).toEqual([`${EX}ChildValueShape`])
    })

    it('resolves nested structural and value-only sh:node shapes independently from root choices', () => {
        const layers = shapeLayers(`
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

        const parent = layers.formShapes.getNodeShape(DataFactory.namedNode(`${EX}ParentShape`))
        const structural = parent?.properties.find(property => property.writablePath?.value === `${EX}structuralChild`)
        const valueOnly = parent?.properties.find(property => property.writablePath?.value === `${EX}valueChild`)

        expect(layers.rootSelection.findRootNodeShapes().map(root => root.value)).toContain(`${EX}ValueChildShape`)
        expect(structural?.nestedNodeShapes.map(shape => shape.value)).toEqual([`${EX}StructuralChildShape`])
        expect(valueOnly?.nestedNodeShapes).toEqual([])
        expect(valueOnly?.datatype?.value).toBe('http://www.w3.org/2001/XMLSchema#string')
        expect(valueOnly?.nodeKind?.value).toBe(`${SH}Literal`)
    })
})
