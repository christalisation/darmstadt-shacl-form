import { ShaclNode } from './node'
import { Config } from './config'
import { Store, DataFactory } from 'n3'

/**
 * Runtime collection of rendered SHACL nodes.
 *
 * This class tracks the DOM nodes
 * that represent the current form state.
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
        const rootSubjects = this.config.shapeGraph.findRootNodeShapes({
            shapeSubject: this.config.attributes.shapeSubject,
            valuesSubject: this.config.attributes.valuesSubject,
        });
        const valueSubject = this.config.attributes.valuesSubject ? DataFactory.namedNode(this.config.attributes.valuesSubject) : undefined;

        for (const subject of rootSubjects) {
            const label = this.config.shapeGraph.getLabel(subject);
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

    public toRDF(graph: Store): Store {
        for (const rootNode of this.rootNodes) {
            rootNode.toRDF(graph);
        }
        return graph;
    }

}
