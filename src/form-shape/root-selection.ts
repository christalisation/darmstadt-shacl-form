import { DataFactory, Store } from 'n3'
import { DATA_GRAPH, DCTERMS_PREDICATE_CONFORMS_TO, RDF_PREDICATE_TYPE, SHACL_PREDICATE_TARGET_CLASS } from '../constants'
import { NodeShapeTerm, ShaclShapeRegistry } from '../shacl'

export type RootShapeOptions = {
    shapeSubject?: string | null,
    valuesSubject?: string | null,
}

/**
 * Application policy for selecting root form definitions.
 *
 * SHACL targets describe validation scope, not authoring entry points. The
 * fallback therefore stays conservative and exposes all declared NodeShapes.
 */
export class FormRootSelection {
    constructor(
        private readonly store: Store,
        private readonly shaclShapes: ShaclShapeRegistry,
    ) {}

    findRootNodeShapes(options: RootShapeOptions = {}): NodeShapeTerm[] {
        const rootShapes: NodeShapeTerm[] = []

        if (options.shapeSubject) {
            const subjects = options.shapeSubject.split(' ').map(subject => subject.trim()).filter(Boolean)
            for (const subjectIri of subjects) {
                const subject = DataFactory.namedNode(subjectIri)
                if (this.shaclShapes.isNodeShape(subject)) {
                    rootShapes.push(subject)
                } else {
                    console.warn(`shapes graph does not contain requested root shape ${subjectIri}`)
                }
            }
            return this.uniqueNodeShapes(rootShapes)
        }

        if (options.valuesSubject && this.store.countQuads(null, null, null, DATA_GRAPH) > 0) {
            const valueSubject = DataFactory.namedNode(options.valuesSubject)
            const valueSubjectTypes = [
                ...this.store.getQuads(valueSubject, RDF_PREDICATE_TYPE, null, DATA_GRAPH),
                ...this.store.getQuads(valueSubject, DCTERMS_PREDICATE_CONFORMS_TO, null, DATA_GRAPH),
            ]

            if (valueSubjectTypes.length === 0) {
                console.warn(`value subject '${options.valuesSubject}' has neither ${RDF_PREDICATE_TYPE.id} nor ${DCTERMS_PREDICATE_CONFORMS_TO.id} statement`)
            }

            for (const valueSubjectType of valueSubjectTypes) {
                if (this.shaclShapes.isNodeShape(valueSubjectType.object)) {
                    rootShapes.push(valueSubjectType.object)
                }
            }

            for (const valueSubjectType of valueSubjectTypes) {
                const shapesForType = this.store.getQuads(null, SHACL_PREDICATE_TARGET_CLASS, valueSubjectType.object, null)
                for (const shape of shapesForType) {
                    if (this.shaclShapes.isNodeShape(shape.subject)) {
                        rootShapes.push(shape.subject)
                    }
                }
            }

            if (rootShapes.length > 0) {
                return this.uniqueNodeShapes(rootShapes)
            }

            console.error(`value subject '${options.valuesSubject}' has no shacl shape definition in the shapes graph`)
            return []
        }

        return this.uniqueNodeShapes(this.shaclShapes.getNodeShapeSubjects())
    }

    private uniqueNodeShapes(nodes: NodeShapeTerm[]): NodeShapeTerm[] {
        return [...new Map(nodes.map(node => [this.shaclShapes.termKey(node), node])).values()]
    }
}
