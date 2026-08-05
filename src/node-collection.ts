import { ShaclNode } from './node'
import { Config } from './config'
import { BlankNode, DataFactory, NamedNode, Store } from 'n3'

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
        if (!node.linked || !this.allNodesById.has(node.nodeId.id)) {
            this.allNodesById.set(node.nodeId.id, node)
        }
    }

    public findNodeById(nodeId: NamedNode | BlankNode | string): ShaclNode | undefined {
        const id = typeof nodeId === 'string' ? nodeId : nodeId.id
        return this.allNodesById.get(id)
    }

    public findNodesByClass(clazz: NamedNode): ShaclNode[] {
        return this.findReusableNodes(node => node.targetClass?.equals(clazz) || false)
    }

    public findNodesByShape(shape: NamedNode): ShaclNode[] {
        return this.findReusableNodes(node => node.shaclSubject.equals(shape))
    }

    private findReusableNodes(predicate: (node: ShaclNode) => boolean): ShaclNode[] {
        return Array.from(this.allNodesById.values()).filter(node => {
            return !node.linked && node.hasSerializableValue() && predicate(node)
        })
    }

    public toRDF(graph: Store): Store {
        for (const rootNode of this.rootNodes) {
            rootNode.toRDF(graph);
        }
        return graph;
    }

}
