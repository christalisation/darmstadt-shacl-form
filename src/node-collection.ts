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
    public committedRootNodes: ShaclNode[] = []
    private allNodesById: Map<string, ShaclNode> = new Map() // the key string will be node.nodeId.id
    public readonly config: Config

    constructor(config: Config) {
        this.config = config
    }

    public build() {
        // remove all previously registered nodes and root nodes
        this.rootNodes = [];
        this.committedRootNodes = [];
        this.allNodesById.clear();
        const rootSubjects = this.config.shapeGraph.findRootNodeShapes({
            shapeSubject: this.config.attributes.shapeSubject,
            valuesSubject: this.config.attributes.valuesSubject,
        });
        const valueSubject = this.config.attributes.valuesSubject ? DataFactory.namedNode(this.config.attributes.valuesSubject) : undefined;

        for (const subject of rootSubjects) {
            this.rootNodes.push(this.createRootNode(subject, valueSubject));
        }
    }

    public createRootNode(subject: NamedNode, valueSubject?: NamedNode | BlankNode): ShaclNode {
        const label = this.config.shapeGraph.getLabel(subject);
        return new ShaclNode(subject, this, valueSubject, undefined, undefined, label || subject.value);
    }

    public commitRootNode(node: ShaclNode): void {
        if (!this.committedRootNodes.includes(node)) {
            this.committedRootNodes.push(node);
        }
    }

    public replaceRootNode(node: ShaclNode): ShaclNode {
        const replacement = this.createRootNode(node.shaclSubject);
        const index = this.rootNodes.indexOf(node);
        if (index >= 0) {
            this.rootNodes[index] = replacement;
        }
        return replacement;
    }

    public getSerializableRootNodes(activeRootNode?: ShaclNode, includeEmptyActiveRootNode = false): ShaclNode[] {
        const nodes = [...this.committedRootNodes];
        if (activeRootNode && (includeEmptyActiveRootNode || activeRootNode.hasSerializableValue()) && !nodes.includes(activeRootNode)) {
            nodes.push(activeRootNode);
        }
        return nodes;
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
            return !node.linked && this.belongsToCommittedRoot(node) && node.hasSerializableValue() && predicate(node)
        })
    }

    private belongsToCommittedRoot(node: ShaclNode): boolean {
        let current: ShaclNode = node
        while (current.parent) {
            current = current.parent
        }
        return this.committedRootNodes.includes(current)
    }

    public toRDF(graph: Store): Store {
        for (const rootNode of this.committedRootNodes) {
            rootNode.toRDF(graph);
        }
        return graph;
    }

}
