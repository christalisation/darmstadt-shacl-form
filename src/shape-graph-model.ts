import { DataFactory, NamedNode, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { DATA_GRAPH, DCTERMS_PREDICATE_CONFORMS_TO, PREFIX_SHACL, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHACL_PREDICATE_PROPERTY, SHACL_PREDICATE_TARGET_CLASS } from './constants'
import { extractLists, findLabel } from './util'

export type RootShapeOptions = {
    shapeSubject?: string | null,
    valuesSubject?: string | null,
}

/**
 * Semantic view over a SHACL shapes graph.
 *
 * This class centralizes SHACL-specific graph queries so rendering components
 * do not need to interpret raw RDF triples directly.
 */
export class ShapeGraphModel {
    private listsCache: Record<string, Term[]> | undefined
    private groupIdsCache: string[] | undefined

    constructor(
        private readonly store: Store,
        private readonly languages: string[],
    ) {}

    get lists(): Record<string, Term[]> {
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

    getPropertyShapes(nodeShape: NamedNode): Term[] {
        return this.store.getObjects(nodeShape, SHACL_PREDICATE_PROPERTY, null)
    }

    getTargetClasses(nodeShape: NamedNode): NamedNode[] {
        return this.store.getObjects(nodeShape, SHACL_PREDICATE_TARGET_CLASS, null)
            .filter((term): term is NamedNode => term.termType === 'NamedNode')
    }

    getGroup(propertyShape: Term): Term | undefined {
        return this.store.getObjects(propertyShape, `${PREFIX_SHACL}group`, null)[0]
    }

    getList(listNode: Term): Term[] {
        return this.lists[listNode.value] || []
    }

    getLabel(subject: Term): string {
        return findLabel(this.store.getQuads(subject, null, null, null), this.languages)
    }

    getPath(propertyShape: Term): Term | undefined {
        return this.store.getObjects(propertyShape, `${PREFIX_SHACL}path`, null)[0]
    }

    private isNodeShape(term: Term): term is NamedNode {
        return term.termType === 'NamedNode' &&
            this.store.countQuads(term, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null) > 0
    }

    private uniqueNamedNodes(nodes: NamedNode[]): NamedNode[] {
        return [...new Map(nodes.map(node => [node.value, node])).values()]
    }
}
