import { ShaclNode } from './node'
import { Config } from '../config'
import { BlankNode, DataFactory, NamedNode, Store } from 'n3'
import { PREFIX_SHACL } from '../constants'
import type { NodeShapeTerm } from '../shape-graph-model'

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

    public createRootNode(subject: NodeShapeTerm, valueSubject?: NamedNode | BlankNode): ShaclNode {
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

    public createNodeId(shapeSubject: NodeShapeTerm, nodeKind?: NamedNode): NamedNode | BlankNode {
        if (
            nodeKind?.value === `${PREFIX_SHACL}IRI` ||
            (nodeKind?.value === `${PREFIX_SHACL}BlankNodeOrIRI` && this.config.attributes.valuesNamespace) ||
            (nodeKind === undefined && this.config.attributes.valuesNamespace)
        ) {
            return DataFactory.namedNode(this.uniqueResourceIri(shapeSubject))
        }

        return DataFactory.blankNode(this.uniqueBlankNodeId(shapeSubject))
    }

    public canUseNodeId(node: ShaclNode, nodeId: NamedNode | BlankNode): boolean {
        if (node.nodeId.equals(nodeId)) {
            return true
        }
        const existingNode = this.allNodesById.get(nodeId.id)
        return (!existingNode || existingNode === node) && !this.config.store.countQuads(nodeId, null, null, null)
    }

    public updateNodeId(node: ShaclNode, nodeId: NamedNode | BlankNode): boolean {
        if (!this.canUseNodeId(node, nodeId)) {
            return false
        }

        this.allNodesById.delete(node.nodeId.id)
        this.config.renderedNodes.delete(this.renderedNodeKey(node.shaclSubject, node.nodeId))
        node.nodeId = nodeId
        node.dataset.nodeId = nodeId.id
        this.allNodesById.set(nodeId.id, node)
        this.config.renderedNodes.add(this.renderedNodeKey(node.shaclSubject, nodeId))
        return true
    }

    public findNodeById(nodeId: NamedNode | BlankNode | string): ShaclNode | undefined {
        const id = typeof nodeId === 'string' ? nodeId : nodeId.id
        return this.allNodesById.get(id)
    }

    public findNodesByClass(clazz: NamedNode): ShaclNode[] {
        return this.findReusableNodes(node => node.targetClass?.equals(clazz) || false)
    }

    public findNodesByShape(shape: NodeShapeTerm): ShaclNode[] {
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

    private uniqueResourceIri(shapeSubject: NodeShapeTerm): string {
        const namespace = this.config.attributes.valuesNamespace || 'urn:shacl-form:'
        return this.uniqueIdentifier(shapeSubject, candidate => {
            const iri = namespace + candidate
            const node = DataFactory.namedNode(iri)
            return !this.allNodesById.has(node.id) && !this.config.store.countQuads(node, null, null, null)
        }, namespace)
    }

    private uniqueBlankNodeId(shapeSubject: NodeShapeTerm): string {
        return this.uniqueIdentifier(shapeSubject, candidate => {
            const blankNode = DataFactory.blankNode(candidate)
            return !this.allNodesById.has(blankNode.id) && !this.config.store.countQuads(blankNode, null, null, null)
        })
    }

    private uniqueIdentifier(shapeSubject: NodeShapeTerm, available: (candidate: string) => boolean, namespace = ''): string {
        const base = this.identifierBase(shapeSubject)
        let index = 1
        while (true) {
            const candidate = `${base}-${index}`
            if (available(candidate)) {
                return namespace + candidate
            }
            index++
        }
    }

    private identifierBase(shapeSubject: NodeShapeTerm): string {
        const label = this.config.shapeGraph.getFormNodeShape(shapeSubject)?.label || shapeSubject.value
        const local = label.split(/[\/#]/).filter(Boolean).pop() || label
        return local
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'node'
    }

    private renderedNodeKey(shapeSubject: NodeShapeTerm, nodeId: NamedNode | BlankNode): string {
        return JSON.stringify([shapeSubject.id, nodeId.id])
    }

    public toRDF(graph: Store): Store {
        for (const rootNode of this.committedRootNodes) {
            rootNode.toRDF(graph);
        }
        return graph;
    }

}
