import { BlankNode as N3BlankNode, NamedNode as N3NamedNode, Quad, Store, Term as N3Term } from 'n3'
import { NamedNode, Term } from '@rdfjs/types'
import { PREFIX_FOAF, PREFIX_RDFS, PREFIX_SHACL, PREFIX_SKOS, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHACL_PREDICATE_NODE, SHACL_PREDICATE_PROPERTY, SHACL_PREDICATE_TARGET_CLASS } from '../constants'
import { RdfReader } from '../rdf'
import { ShaclNodeShape, ShaclPropertyShape } from './model'
import { ShaclParser } from './parser'
import { ShaclPathParser } from './path-parser'
import { ShaclPath } from './path'
import { RDFS_VOCAB } from './vocabulary'

export type NodeShapeTerm = N3NamedNode | N3BlankNode

/**
 * Lazy semantic registry for the loaded SHACL shapes graph.
 *
 * This class owns graph-wide SHACL shape discovery and parsed semantic caches.
 * It does not compile Form Shapes and has no dependency on DOM-form code.
 */
export class ShaclShapeRegistry {
    private propertyGroupIdsCache: string[] | undefined
    private readonly rdf: RdfReader
    private readonly pathParser: ShaclPathParser
    private readonly parser: ShaclParser
    private readonly nodeShapes = new Map<string, ShaclNodeShape>()
    private readonly propertyShapes = new Map<string, ShaclPropertyShape>()

    constructor(
        private readonly store: Store,
        private readonly languages: string[],
    ) {
        this.rdf = new RdfReader(store)
        this.pathParser = new ShaclPathParser(this.rdf)
        this.parser = new ShaclParser(this.rdf, this.pathParser)
    }

    get lists(): Record<string, Term[]> {
        return this.rdf.lists
    }

    get propertyGroupIds(): string[] {
        if (!this.propertyGroupIdsCache) {
            this.propertyGroupIdsCache = []
            this.store.forSubjects(subject => {
                this.propertyGroupIdsCache!.push(subject.id)
            }, RDF_PREDICATE_TYPE, `${PREFIX_SHACL}PropertyGroup`, null)
        }
        return this.propertyGroupIdsCache
    }

    getNodeShapeSubjects(): NodeShapeTerm[] {
        return this.store.getQuads(null, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null)
            .map(quad => quad.subject)
            .filter((subject): subject is NodeShapeTerm =>
                this.isNodeShapeTerm(subject) &&
                !this.isPropertyShape(subject)
            )
    }

    isNodeShape(term: Term): term is NodeShapeTerm {
        return this.isNodeShapeTerm(term) &&
            !this.isPropertyShape(term) &&
            this.store.countQuads(term, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null) > 0
    }

    getNodeShape(id: Term): ShaclNodeShape | undefined {
        if (!this.canResolveNodeShape(id)) {
            return undefined
        }

        const key = this.termKey(id)
        const cached = this.nodeShapes.get(key)
        if (cached) {
            return cached
        }

        const parsed = this.parser.parseNodeShape(id)
        this.nodeShapes.set(key, parsed)
        return parsed
    }

    parseNodeShape(id: Term): ShaclNodeShape {
        return this.parser.parseNodeShape(id)
    }

    getPropertyShape(id: Term): ShaclPropertyShape | undefined {
        const key = this.termKey(id)
        const cached = this.propertyShapes.get(key)
        if (cached) {
            return cached
        }

        try {
            const parsed = this.parser.parsePropertyShapeIfPresent(id)
            if (parsed) {
                this.propertyShapes.set(key, parsed)
            }
            return parsed
        } catch (error) {
            console.warn(error)
            return undefined
        }
    }

    parsePropertyShape(id: Term): ShaclPropertyShape {
        return this.parser.parsePropertyShape(id)
    }

    getPropertyShapes(nodeShape: Term): N3Term[] {
        return this.store.getObjects(nodeShape, SHACL_PREDICATE_PROPERTY, null)
    }

    getTargetClasses(nodeShape: Term): NamedNode[] {
        const semanticShape = this.getNodeShape(nodeShape)
        if (semanticShape) {
            return semanticShape.targets.flatMap(target => target.kind === 'class' ? [target.class as NamedNode] : [])
        }

        return this.store.getObjects(nodeShape, SHACL_PREDICATE_TARGET_CLASS, null)
            .flatMap(term => term.termType === 'NamedNode' ? [term as unknown as NamedNode] : [])
    }

    getGroup(propertyShape: Term): N3Term | undefined {
        return this.store.getObjects(propertyShape, `${PREFIX_SHACL}group`, null)[0]
    }

    getList(listNode: Term): Term[] {
        return this.lists[listNode.value] || []
    }

    getLabel(subject: Term): string {
        const quads = this.store.getQuads(subject, null, null, null)
        return this.findObjectValueByPredicate(quads, 'name', PREFIX_SHACL) ||
            this.findObjectValueByPredicate(quads, 'prefLabel', PREFIX_SKOS) ||
            this.findObjectValueByPredicate(quads, 'label', PREFIX_RDFS) ||
            this.findObjectValueByPredicate(quads, 'name', PREFIX_FOAF)
    }

    getPath(propertyShape: Term): ShaclPath | undefined {
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

    findNodeShapeByTargetClass(targetClass: NamedNode): Term | undefined {
        return this.store.getSubjects(SHACL_PREDICATE_TARGET_CLASS, targetClass, null)
            .find(subject => this.canResolveNodeShape(subject))
    }

    findNodeShapesByTargetObjectsOf(predicate: NamedNode): Term[] {
        return this.store.getSubjects(`${PREFIX_SHACL}targetObjectsOf`, predicate, null)
            .filter(subject => this.canResolveNodeShape(subject))
    }

    findNodeShapesByLogicalBranch(branch: Term): Term[] {
        const nodeShapes: Term[] = []
        if (this.canResolveNodeShape(branch)) {
            nodeShapes.push(branch)
        }
        for (const nodeTarget of this.store.getObjects(branch, SHACL_PREDICATE_NODE, null)) {
            if (this.canResolveNodeShape(nodeTarget)) {
                nodeShapes.push(nodeTarget)
            }
        }
        return this.uniqueTerms(nodeShapes)
    }

    isSubclassOf(candidateClass: NamedNode, baseClass: NamedNode, visited = new Set<string>()): boolean {
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

    private findObjectValueByPredicate(quads: Quad[], predicate: string, prefix: string): string {
        const object = this.findObjectByPredicate(quads, prefix + predicate)
        return object?.value || ''
    }

    private findObjectByPredicate(quads: Quad[], predicate: string): Term | undefined {
        let candidate: Term | undefined
        for (const language of this.languages) {
            for (const quad of quads) {
                if (quad.predicate.value === predicate) {
                    if (quad.object.termType === 'Literal' && quad.object.language === language) {
                        return quad.object
                    }
                    if (quad.object.termType === 'Literal' && !quad.object.language && !candidate) {
                        candidate = quad.object
                    } else if (!candidate) {
                        candidate = quad.object
                    }
                }
            }
        }
        return candidate
    }

    private uniqueTerms<T extends Term>(terms: T[]): T[] {
        return [...new Map(terms.map(term => [this.termKey(term), term])).values()]
    }

    private canResolveNodeShape(term: Term): term is NodeShapeTerm {
        return this.isNodeShapeTerm(term) &&
            !this.isPropertyShape(term) &&
            (
                this.store.countQuads(term, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null) > 0 ||
                this.store.countQuads(term, null, null, null) > 0
            )
    }

    private isNodeShapeTerm(term: Term): term is NodeShapeTerm {
        return term.termType === 'NamedNode' || term.termType === 'BlankNode'
    }

    private isPropertyShape(term: Term): boolean {
        return this.store.countQuads(term, `${PREFIX_SHACL}path`, null, null) > 0
    }

    termKey(term: Term): string {
        return `${term.termType}:${term.value}`
    }
}
