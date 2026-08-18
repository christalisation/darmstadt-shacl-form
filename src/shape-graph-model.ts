import { DataFactory, NamedNode, Store, Term as N3Term } from 'n3'
import { NamedNode as RdfNamedNode, Term as RdfTerm } from '@rdfjs/types'
import { DATA_GRAPH, DCTERMS_PREDICATE_CONFORMS_TO, PREFIX_SHACL, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHACL_PREDICATE_NODE, SHACL_PREDICATE_PROPERTY, SHACL_PREDICATE_TARGET_CLASS } from './constants'
import { findLabel } from './util'
import { getAlternativePredicatePaths, getPredicatePath, ShaclPath } from './shacl-path'
import { RdfReader } from './rdf'
import { RDFS_VOCAB, ShaclNodeShape, ShaclParser, ShaclPathParser, ShaclPropertyShape, ShaclShapeResolver } from './shacl'
import { FormNodeShape, FormPropertyShape, FormShapeCompiler, FormShapeRegistry } from './form-shape'

export type RootShapeOptions = {
    shapeSubject?: string | null,
    valuesSubject?: string | null,
}

/**
 * Semantic view over a SHACL shapes graph.
 * 
 * This class centralises SHACL-specific graph queries
 */
export class ShapeGraphModel {
    private groupIdsCache: string[] | undefined
    private readonly rdf: RdfReader
    private readonly pathParser: ShaclPathParser
    private readonly shaclParser: ShaclParser
    private readonly semanticShapes = new Map<string, ShaclNodeShape>()
    private readonly semanticProperties = new Map<string, ShaclPropertyShape>()
    private readonly formShapeRegistry: FormShapeRegistry

    constructor(
        private readonly store: Store,
        private readonly languages: string[],
        private readonly prefixes: Record<string, unknown> = {},
    ) {
        this.rdf = new RdfReader(store)
        this.pathParser = new ShaclPathParser(this.rdf)
        this.shaclParser = new ShaclParser(this.rdf, this.pathParser)
        const resolver = new ShaclShapeResolver({
            resolveNodeShape: id => this.parseNodeShapeIfPresent(id),
            resolvePropertyShape: id => this.parsePropertyShapeIfPresent(id),
        })
        const compiler = new FormShapeCompiler({
            languages,
            prefixes: this.prefixes,
            resolveNodeShape: id => this.parseNodeShapeIfPresent(id),
            findNodeShapeByTargetClass: targetClass => this.findNodeShapeByTargetClass(targetClass),
            findCompatibleNodeShapes: baseShape => this.getCompatibleFormNodeShapeTerms(baseShape),
            labelForTerm: term => this.getLabel(term),
            shapeResolver: resolver,
        })
        this.formShapeRegistry = new FormShapeRegistry(compiler, id => this.parseNodeShapeIfPresent(id))
    }

    get lists(): Record<string, RdfTerm[]> {
        return this.rdf.lists
    }

    get groupIds(): string[] {
        if (!this.groupIdsCache) {
            this.groupIdsCache = []
            this.store.forSubjects(subject => {
                this.groupIdsCache!.push(subject.id)
            }, RDF_PREDICATE_TYPE, `${PREFIX_SHACL}PropertyGroup`, null)
        }
        return this.groupIdsCache
    }

    /**
     * Finds the node shapes that should be rendered as roots of the form.
     *
     * Selection follows application root-entry policy:
     * 1. explicit `data-shape-subject`;
     * 2. shape inferred from the bound data subject;
     * 3. broad fallback to all declared `sh:NodeShape`s.
     *
     * SHACL does not define form entry points. In the absence of explicit
     * application configuration, expose all NodeShapes as root choices while
     * keeping the full Form Shape registry available for nested and logical
     * resolution.
     */
    findRootNodeShapes(options: RootShapeOptions = {}): NamedNode[] {
        const rootShapes: NamedNode[] = []

        if (options.shapeSubject) {
            const subjects = options.shapeSubject.split(' ').map(subject => subject.trim()).filter(Boolean)
            for (const subjectIri of subjects) {
                const subject = DataFactory.namedNode(subjectIri)
                if (this.isNodeShape(subject)) {
                    rootShapes.push(subject)
                } else {
                    console.warn(`shapes graph does not contain requested root shape ${subjectIri}`)
                }
            }
            return this.uniqueNamedNodes(rootShapes)
        }

        if (options.valuesSubject && this.store.countQuads(null, null, null, DATA_GRAPH) > 0) {
            const valueSubject = DataFactory.namedNode(options.valuesSubject)
            const valueSubjectTypes = [
                ...this.store.getQuads(valueSubject, RDF_PREDICATE_TYPE, null, DATA_GRAPH),
                ...this.store.getQuads(valueSubject, DCTERMS_PREDICATE_CONFORMS_TO, null, DATA_GRAPH)
            ]

            if (valueSubjectTypes.length === 0) {
                console.warn(`value subject '${options.valuesSubject}' has neither ${RDF_PREDICATE_TYPE.id} nor ${DCTERMS_PREDICATE_CONFORMS_TO.id} statement`)
            }

            for (const valueSubjectType of valueSubjectTypes) {
                if (this.isNodeShape(valueSubjectType.object)) {
                    rootShapes.push(valueSubjectType.object)
                }
            }

            for (const valueSubjectType of valueSubjectTypes) {
                const shapesForType = this.store.getQuads(null, SHACL_PREDICATE_TARGET_CLASS, valueSubjectType.object, null)
                for (const shape of shapesForType) {
                    if (this.isNodeShape(shape.subject)) {
                        rootShapes.push(shape.subject)
                    }
                }
            }

            if (rootShapes.length > 0) {
                return this.uniqueNamedNodes(rootShapes)
            }

            console.error(`value subject '${options.valuesSubject}' has no shacl shape definition in the shapes graph`)
            return []
        }

        return this.uniqueNamedNodes(
            this.store.getQuads(null, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null)
                .map(quad => quad.subject)
                .filter((subject): subject is NamedNode => subject.termType === 'NamedNode')
        )
    }

    getPropertyShapes(nodeShape: RdfTerm): N3Term[] {
        return this.store.getObjects(nodeShape, SHACL_PREDICATE_PROPERTY, null)
    }

    /**
     * Returns the property shapes that should become visible form controls.
     *
     * Some SHACL graphs define both an `sh:alternativePath` constraint and
     * separate property shapes for each branch. The separate shapes are useful
     * as branch-specific templates, but rendering them next to the alternative
     * control would duplicate the same logical choice in the UI.
     */
    getRenderablePropertyShapes(nodeShape: RdfTerm): N3Term[] {
        const formShape = this.getFormNodeShape(nodeShape)
        if (formShape) {
            return formShape.properties.map(property => property.id as N3Term)
        }

        const propertyShapes = this.getPropertyShapes(nodeShape)
        const pathsCoveredByAlternative = new Set<string>()

        for (const propertyShape of propertyShapes) {
            const path = this.getPath(propertyShape)
            if (path) {
                const alternatives = getAlternativePredicatePaths(path)
                for (const alternative of alternatives || []) {
                    pathsCoveredByAlternative.add(alternative.value)
                }
            }
        }

        return propertyShapes.filter(propertyShape => {
            const path = this.getPath(propertyShape)
            const predicatePath = path ? getPredicatePath(path) : undefined
            return !predicatePath || !pathsCoveredByAlternative.has(predicatePath.value)
        })
    }

    /**
     * Checks whether a node shape contains form controls, directly or through
     * inherited `sh:and` / `sh:node` shapes.
     */
    hasRenderableNodeShapeContent(nodeShape: RdfTerm, visited = new Set<string>()): boolean {
        const key = this.termKey(nodeShape)
        if (visited.has(key)) {
            return false
        }
        visited.add(key)

        const formShape = this.getFormNodeShape(nodeShape)
        if (formShape) {
            return formShape.properties.length > 0
        }

        if (this.getRenderablePropertyShapes(nodeShape).length > 0) {
            return true
        }

        for (const shaclAnd of this.store.getObjects(nodeShape, `${PREFIX_SHACL}and`, null)) {
            for (const inheritedShape of this.getList(shaclAnd)) {
                if (this.hasRenderableNodeShapeContent(inheritedShape, visited)) {
                    return true
                }
            }
        }

        for (const inheritedShape of this.store.getObjects(nodeShape, SHACL_PREDICATE_NODE, null)) {
            if (this.hasRenderableNodeShapeContent(inheritedShape, visited)) {
                return true
            }
        }

        return false
    }

    getTargetClasses(nodeShape: NamedNode): NamedNode[] {
        const formShape = this.getFormNodeShape(nodeShape)
        if (formShape) {
            return formShape.targetClasses as unknown as NamedNode[]
        }

        return this.store.getObjects(nodeShape, SHACL_PREDICATE_TARGET_CLASS, null)
            .filter((term): term is NamedNode => term.termType === 'NamedNode')
    }

    getGroup(propertyShape: RdfTerm): N3Term | undefined {
        return this.store.getObjects(propertyShape, `${PREFIX_SHACL}group`, null)[0]
    }

    getList(listNode: RdfTerm): RdfTerm[] {
        return this.lists[listNode.value] || []
    }

    getLabel(subject: RdfTerm): string {
        return findLabel(this.store.getQuads(subject, null, null, null), this.languages)
    }

    getPath(propertyShape: RdfTerm): ShaclPath | undefined {
        const pathTerm = this.store.getObjects(propertyShape, `${PREFIX_SHACL}path`, null)[0]
        if (!pathTerm) {
            return undefined
        }
        try {
            return this.pathParser.parse(pathTerm)
        } catch (error) {
            console.warn(error)
            return undefined
        }
    }

    /**
     * Temporary compatibility bridge: newer code can read a semantic node
     * shape, while existing rendering continues using the facade methods above.
     */
    parseNodeShape(nodeShape: RdfTerm): ShaclNodeShape {
        return this.shaclParser.parseNodeShape(nodeShape)
    }

    getFormNodeShape(nodeShape: RdfTerm): FormNodeShape | undefined {
        return this.formShapeRegistry.getNodeShape(nodeShape)
    }

    getFormPropertyShape(propertyShape: RdfTerm): FormPropertyShape | undefined {
        const propertyKey = this.termKey(propertyShape)
        for (const nodeShape of this.getNodeShapeSubjects()) {
            const formShape = this.getFormNodeShape(nodeShape)
            const property = formShape?.properties.find(property => this.termKey(property.id) === propertyKey)
            if (property) {
                return property
            }
        }

        try {
            const semanticProperty = this.shaclParser.parsePropertyShape(propertyShape)
            return new FormShapeCompiler({
                languages: this.languages,
                prefixes: this.prefixes,
                resolveNodeShape: id => this.parseNodeShapeIfPresent(id),
                findNodeShapeByTargetClass: targetClass => this.findNodeShapeByTargetClass(targetClass),
                findCompatibleNodeShapes: baseShape => this.getCompatibleFormNodeShapeTerms(baseShape),
                labelForTerm: term => this.getLabel(term),
            }).compilePropertyShape(semanticProperty)
        } catch (error) {
            console.warn(error)
            return undefined
        }
    }

    getCompatibleFormNodeShapes(baseShape: RdfTerm): FormNodeShape[] {
        return this.getCompatibleFormNodeShapeTerms(baseShape)
            .flatMap(shape => {
                const formShape = this.getFormNodeShape(shape)
                return formShape ? [formShape] : []
            })
    }

    getCompatibleFormNodeShapeTerms(baseShape: RdfTerm): RdfTerm[] {
        const base = this.getFormNodeShape(baseShape)
        if (!base || base.targetClasses.length === 0) {
            return []
        }

        const candidates: RdfTerm[] = []
        for (const candidateSubject of this.getNodeShapeSubjects()) {
            if (this.termKey(candidateSubject) === this.termKey(baseShape)) {
                continue
            }
            const candidate = this.parseNodeShapeIfPresent(candidateSubject)
            if (!candidate) {
                continue
            }
            const candidateClasses = candidate.targets.flatMap(target => target.kind === 'class' ? [target.class] : [])
            if (candidateClasses.some(candidateClass =>
                base.targetClasses.some(baseClass => this.isSubclassOf(candidateClass, baseClass))
            )) {
                candidates.push(candidateSubject)
            }
        }
        return candidates
    }

    private isNodeShape(term: RdfTerm): term is NamedNode {
        return term.termType === 'NamedNode' &&
            this.store.countQuads(term, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null) > 0
    }

    private uniqueNamedNodes(nodes: NamedNode[]): NamedNode[] {
        return [...new Map(nodes.map(node => [node.value, node])).values()]
    }

    private parseNodeShapeIfPresent(nodeShape: RdfTerm): ShaclNodeShape | undefined {
        if (!this.isNodeShape(nodeShape)) {
            return undefined
        }

        const key = this.termKey(nodeShape)
        const cached = this.semanticShapes.get(key)
        if (cached) {
            return cached
        }

        const parsed = this.shaclParser.parseNodeShape(nodeShape)
        this.semanticShapes.set(key, parsed)
        return parsed
    }

    private findNodeShapeByTargetClass(targetClass: RdfNamedNode): RdfTerm | undefined {
        return this.store.getSubjects(SHACL_PREDICATE_TARGET_CLASS, targetClass, null)
            .find(subject => this.isNodeShape(subject))
    }

    private parsePropertyShapeIfPresent(propertyShape: RdfTerm): ShaclPropertyShape | undefined {
        const key = this.termKey(propertyShape)
        const cached = this.semanticProperties.get(key)
        if (cached) {
            return cached
        }

        try {
            const parsed = this.shaclParser.parsePropertyShapeIfPresent(propertyShape)
            if (parsed) {
                this.semanticProperties.set(key, parsed)
            }
            return parsed
        } catch (error) {
            console.warn(error)
            return undefined
        }
    }

    private getNodeShapeSubjects(): NamedNode[] {
        return this.store.getQuads(null, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null)
            .map(quad => quad.subject)
            .filter((subject): subject is NamedNode => subject.termType === 'NamedNode')
    }

    private isSubclassOf(candidateClass: RdfNamedNode, baseClass: RdfNamedNode, visited = new Set<string>()): boolean {
        if (candidateClass.equals(baseClass)) {
            return true
        }

        const key = this.termKey(candidateClass)
        if (visited.has(key)) {
            return false
        }
        visited.add(key)

        for (const parent of this.store.getObjects(candidateClass, RDFS_VOCAB.subClassOf, null)) {
            if (parent.termType === 'NamedNode' && this.isSubclassOf(parent, baseClass, visited)) {
                return true
            }
        }
        return false
    }

    private termKey(term: RdfTerm): string {
        return `${term.termType}:${term.value}`
    }
}
