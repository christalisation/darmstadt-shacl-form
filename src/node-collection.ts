import { ShaclNode } from './node'
import { Config } from './config'
import { Store, NamedNode, DataFactory } from 'n3';
import { findLabel } from './util';
import { DATA_GRAPH, DCTERMS_PREDICATE_CONFORMS_TO, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHACL_PREDICATE_TARGET_CLASS } from './constants'
/**
 * ADT for the internal representation of the form state.
 * Manages all ShaclNodes.
 **/
export class ShaclNodeCollection {
    public rootNodes: ShaclNode[] = []
    private allNodesById: Map<string, ShaclNode> = new Map() // the key string will be node.nodeId.id
    public readonly config: Config

    constructor(config: Config) {
        this.config = config
    }

    public build() {
        // remove all previously registered nodes and root nodes
        this.rootNodes = [];
        this.allNodesById.clear();
        const rootSubjects = this.findRootShaclShapeSubjects();
        const valueSubject = this.config.attributes.valuesSubject ? DataFactory.namedNode(this.config.attributes.valuesSubject) : undefined;

        for (const subject of rootSubjects) {
            const label = findLabel(this.config.store.getQuads(subject, null, null, null), this.config.languages);
            const rootNode = new ShaclNode(subject, this, valueSubject, undefined, undefined, label || subject.value);
            this.rootNodes.push(rootNode);
        }
    }

    /**
     * Register a new ShaclNode.
     * @param node The ShaclNode to register.
     */
    public registerNode(node: ShaclNode) {
        this.allNodesById.set(node.nodeId.id, node)
    }

    /**
     * Finds all root shape subjects based on the configuration.
     * Previously: method `findRootShaclShapeSubject()` in ShaclForm.
     * Now support multiple root shapes: returns an array of NamedNode representing root shape subjects.
     */
    private findRootShaclShapeSubjects(): NamedNode[] {
        let rootSubjects: NamedNode[] = [];

        // Case 1:
        // if data-shape-subject is set, use that
        if (this.config.attributes.shapeSubject) {
            // TODO: enable to infer a list of URIs from the data-shape-subject attribute
            const subjects = this.config.attributes.shapeSubject.split(' ').map(s => s.trim()).filter(s => s.length > 0);
            for (const subjectIri of subjects) {
                const subject = DataFactory.namedNode(subjectIri);
                if (this.config.store.getQuads(subject, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null).length > 0) {
                    rootSubjects.push(subject);
                } else {
                    console.warn(`shapes graph does not contain requested root shape ${subjectIri}`);
                }
            }
            // Deduplicate and return
            return [...new Map(rootSubjects.map(item => [item.value, item])).values()];
        }
        
        // Case 2:
        // if we have a data graph and data-values-subject is set, use shape of that
        
        if (this.config.attributes.valuesSubject && this.config.store.countQuads(null, null, null, DATA_GRAPH) > 0) {
            // TODO: enable to infer a list of URIs from the data-values-subject attribute
            const rootValueSubject = DataFactory.namedNode(this.config.attributes.valuesSubject)
            const rootValueSubjectTypes = [
                ...this.config.store.getQuads(rootValueSubject, RDF_PREDICATE_TYPE, null, DATA_GRAPH),
                ...this.config.store.getQuads(rootValueSubject, DCTERMS_PREDICATE_CONFORMS_TO, null, DATA_GRAPH)
            ]
            // if type/conformsTo refers to a node shape, prioritize that over targetClass resolution             
            if (rootValueSubjectTypes.length === 0) {
                console.warn(`value subject '${this.config.attributes.valuesSubject}' has neither ${RDF_PREDICATE_TYPE.id} nor ${DCTERMS_PREDICATE_CONFORMS_TO.id} statement`);
            }

            // Direct link via rdf:type or dcterms:conformsTo to a NodeShape
            for (const rootValueSubjectType of rootValueSubjectTypes) {
                if (this.config.store.getQuads(rootValueSubjectType.object as NamedNode, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null).length > 0) {
                    rootSubjects.push(rootValueSubjectType.object as NamedNode);
                }
            }
            // Find shapes that have sh:targetClass matching the data's types
            for (const rootValueSubjectType of rootValueSubjectTypes) {
                const shapesForType = this.config.store.getQuads(null, SHACL_PREDICATE_TARGET_CLASS, rootValueSubjectType.object, null);
                for (const shape of shapesForType) {
                    if (this.config.store.getQuads(shape.subject, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null).length > 0) {
                        rootSubjects.push(shape.subject as NamedNode);
                    }
                }
            }
            if (rootSubjects.length > 0) {
                return [...new Map(rootSubjects.map(item => [item.value, item])).values()];
            }
            console.error(`value subject '${this.config.attributes.valuesSubject}' has no shacl shape definition in the shapes graph`);
            return [];
        }

        // Case 3:
        // fallback to all NodeShapes in the graph
        const rootShapeQuads = this.config.store.getQuads(null, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null);
        const allSubjects = rootShapeQuads.map(quad => quad.subject as NamedNode);
        return [...new Map(allSubjects.map(item => [item.value, item])).values()];
    }

    public toRDF(graph: Store): Store {
        for (const rootNode of this.rootNodes) {
            rootNode.toRDF(graph);
        }
        return graph;
    }

}