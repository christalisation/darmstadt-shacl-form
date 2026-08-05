import { DataFactory, NamedNode, Store, Term as N3Term } from 'n3'
import { Term as RdfTerm } from '@rdfjs/types'
import { DATA_GRAPH, DCTERMS_PREDICATE_CONFORMS_TO, PREFIX_SHACL, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHACL_PREDICATE_NODE, SHACL_PREDICATE_PROPERTY, SHACL_PREDICATE_TARGET_CLASS } from './constants'
import { extractLists, findLabel } from './util'
import { getAlternativePredicatePaths, getPredicatePath, ShaclPath } from './shacl-path'

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
    private listsCache: Record<string, RdfTerm[]> | undefined
    private groupIdsCache: string[] | undefined

    constructor(
        private readonly store: Store,
        private readonly languages: string[],
    ) {}

    get lists(): Record<string, RdfTerm[]> {
        if (!this.listsCache) {
            this.listsCache = extractLists(this.store, { ignoreErrors: true })
        }
        return this.listsCache
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
     * Selection follows the existing form behavior:
     * 1. explicit `data-shape-subject`;
     * 2. shape inferred from the bound data subject;
     * 3. fallback to all declared `sh:NodeShape`s.
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
        return pathTerm ? this.parsePath(pathTerm) : undefined
    }

    private isNodeShape(term: RdfTerm): term is NamedNode {
        return term.termType === 'NamedNode' &&
            this.store.countQuads(term, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null) > 0
    }

    private uniqueNamedNodes(nodes: NamedNode[]): NamedNode[] {
        return [...new Map(nodes.map(node => [node.value, node])).values()]
    }

    private parsePath(term: RdfTerm, visited = new Set<string>()): ShaclPath | undefined {
        if (term.termType === 'NamedNode') {
            return { kind: 'predicate', predicate: term }
        }

        const key = this.termKey(term)
        if (visited.has(key)) {
            console.warn(`recursive SHACL path ignored: ${key}`)
            return undefined
        }
        visited.add(key)

        const sequenceItems = this.getList(term)
        if (sequenceItems.length > 0) {
            const paths = sequenceItems.flatMap(item => {
                const path = this.parsePath(item, visited)
                return path ? [path] : []
            })
            return paths.length > 0 ? { kind: 'sequence', paths } : undefined
        }

        const alternativePath = this.parsePathListObject(term, 'alternativePath', visited)
        if (alternativePath.length > 0) {
            return { kind: 'alternative', paths: alternativePath }
        }

        const inversePath = this.parsePathObject(term, 'inversePath', visited)
        if (inversePath) {
            return { kind: 'inverse', path: inversePath }
        }

        const zeroOrMorePath = this.parsePathObject(term, 'zeroOrMorePath', visited)
        if (zeroOrMorePath) {
            return { kind: 'zeroOrMore', path: zeroOrMorePath }
        }

        const oneOrMorePath = this.parsePathObject(term, 'oneOrMorePath', visited)
        if (oneOrMorePath) {
            return { kind: 'oneOrMore', path: oneOrMorePath }
        }

        const zeroOrOnePath = this.parsePathObject(term, 'zeroOrOnePath', visited)
        if (zeroOrOnePath) {
            return { kind: 'zeroOrOne', path: zeroOrOnePath }
        }

        console.warn(`unsupported SHACL path expression ignored: ${key}`)
        return undefined
    }

    private parsePathObject(subject: RdfTerm, predicate: string, visited: Set<string>): ShaclPath | undefined {
        const object = this.store.getObjects(subject, `${PREFIX_SHACL}${predicate}`, null)[0]
        return object ? this.parsePath(object, visited) : undefined
    }

    private parsePathListObject(subject: RdfTerm, predicate: string, visited: Set<string>): ShaclPath[] {
        const listNode = this.store.getObjects(subject, `${PREFIX_SHACL}${predicate}`, null)[0]
        if (!listNode) {
            return []
        }

        return this.getList(listNode).flatMap(item => {
            const path = this.parsePath(item, visited)
            return path ? [path] : []
        })
    }

    private termKey(term: RdfTerm): string {
        return `${term.termType}:${term.value}`
    }
}
