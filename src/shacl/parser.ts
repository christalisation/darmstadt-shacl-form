import { Literal, NamedNode, Term } from '@rdfjs/types'
import { RdfReader } from '../rdf'
import { ShaclConstraint } from './constraint'
import { ShaclNodeShape, ShaclPropertyShape, ShaclShapeMetadata, ShaclTarget } from './model'
import { ShaclPathParser } from './path-parser'
import { FOAF_VOCAB, RDFS_VOCAB, SH, SKOS_VOCAB } from './vocabulary'

export class ShaclParser {
    constructor(
        private readonly rdf: RdfReader,
        private readonly pathParser = new ShaclPathParser(rdf),
    ) {}

    parseNodeShape(id: Term): ShaclNodeShape {
        return {
            id,
            targets: this.parseTargets(id),
            propertyShapes: this.rdf.getObjects(id, SH.property).map(property => this.parsePropertyShape(property)),
            constraints: this.parseConstraints(id),
            metadata: this.parseMetadata(id),
        }
    }

    parsePropertyShape(id: Term): ShaclPropertyShape {
        const pathTerm = this.rdf.getSingleObject(id, SH.path)
        return {
            id,
            path: pathTerm ? this.pathParser.parse(pathTerm) : undefined,
            constraints: this.parseConstraints(id),
            metadata: this.parseMetadata(id),
        }
    }

    parsePropertyShapeIfPresent(id: Term): ShaclPropertyShape | undefined {
        return this.rdf.getSingleObject(id, SH.path)
            ? this.parsePropertyShape(id)
            : undefined
    }

    private parseMetadata(id: Term): ShaclShapeMetadata {
        const names = [
            ...this.rdf.getObjects(id, SH.name).map(term => this.requireLiteral(term, 'sh:name')),
        ]
        const labels = [
            ...this.rdf.getObjects(id, SKOS_VOCAB.prefLabel).map(term => this.requireLiteral(term, 'skos:prefLabel')),
            ...this.rdf.getObjects(id, RDFS_VOCAB.label).map(term => this.requireLiteral(term, 'rdfs:label')),
            ...this.rdf.getObjects(id, FOAF_VOCAB.name).map(term => this.requireLiteral(term, 'foaf:name')),
        ]
        const descriptions = [
            ...this.rdf.getObjects(id, SH.description).map(term => this.requireLiteral(term, 'sh:description')),
            ...this.rdf.getObjects(id, RDFS_VOCAB.comment).map(term => this.requireLiteral(term, 'rdfs:comment')),
        ]
        const messages = [
            ...this.rdf.getObjects(id, SH.message).map(term => this.requireLiteral(term, 'sh:message')),
        ]
        const order = this.readOptionalInteger(id, SH.order)

        return {
            names,
            labels,
            descriptions,
            messages,
            order,
            group: this.rdf.getSingleObject(id, SH.group),
            defaultValue: this.rdf.getSingleObject(id, SH.defaultValue),
        }
    }

    private parseTargets(id: Term): ShaclTarget[] {
        const targets: ShaclTarget[] = []
        for (const value of this.rdf.getObjects(id, SH.targetClass)) {
            targets.push({ kind: 'class', class: this.requireNamedNode(value, 'sh:targetClass') })
        }
        for (const value of this.rdf.getObjects(id, SH.targetNode)) {
            targets.push({ kind: 'node', node: value })
        }
        for (const value of this.rdf.getObjects(id, SH.targetSubjectsOf)) {
            targets.push({ kind: 'subjectsOf', predicate: this.requireNamedNode(value, 'sh:targetSubjectsOf') })
        }
        for (const value of this.rdf.getObjects(id, SH.targetObjectsOf)) {
            targets.push({ kind: 'objectsOf', predicate: this.requireNamedNode(value, 'sh:targetObjectsOf') })
        }
        return targets
    }

    private parseConstraints(id: Term): ShaclConstraint[] {
        const constraints: ShaclConstraint[] = []
        const datatype = this.rdf.getSingleObject(id, SH.datatype)
        if (datatype) constraints.push({ kind: 'datatype', datatype: this.requireNamedNode(datatype, 'sh:datatype') })

        const nodeKind = this.rdf.getSingleObject(id, SH.nodeKind)
        if (nodeKind) constraints.push({ kind: 'nodeKind', nodeKind: this.requireNamedNode(nodeKind, 'sh:nodeKind') })

        const classConstraint = this.rdf.getSingleObject(id, SH.class)
        if (classConstraint) constraints.push({ kind: 'class', class: this.requireNamedNode(classConstraint, 'sh:class') })

        const node = this.rdf.getSingleObject(id, SH.node)
        if (node) constraints.push({ kind: 'node', shape: node })

        this.pushIntegerConstraint(constraints, id, SH.minCount, 'minCount')
        this.pushIntegerConstraint(constraints, id, SH.maxCount, 'maxCount')
        this.pushLiteralConstraint(constraints, id, SH.minExclusive, 'minExclusive')
        this.pushLiteralConstraint(constraints, id, SH.minInclusive, 'minInclusive')
        this.pushLiteralConstraint(constraints, id, SH.maxExclusive, 'maxExclusive')
        this.pushLiteralConstraint(constraints, id, SH.maxInclusive, 'maxInclusive')
        this.pushIntegerConstraint(constraints, id, SH.minLength, 'minLength')
        this.pushIntegerConstraint(constraints, id, SH.maxLength, 'maxLength')

        const pattern = this.rdf.getSingleObject(id, SH.pattern)
        if (pattern) {
            const flags = this.rdf.getSingleLiteral(id, SH.flags)?.value
            constraints.push({ kind: 'pattern', pattern: this.requireLiteral(pattern, 'sh:pattern').value, flags })
        }

        const languageIn = this.rdf.getSingleObject(id, SH.languageIn)
        if (languageIn) {
            constraints.push({
                kind: 'languageIn',
                languages: this.rdf.readList(languageIn).map(term => this.requireLiteral(term, 'sh:languageIn member').value),
            })
        }

        const uniqueLang = this.rdf.getSingleObject(id, SH.uniqueLang)
        if (uniqueLang) constraints.push({ kind: 'uniqueLang', value: this.parseBoolean(uniqueLang, 'sh:uniqueLang') })

        const shIn = this.rdf.getSingleObject(id, SH.in)
        if (shIn) constraints.push({ kind: 'in', values: this.rdf.readList(shIn) })

        for (const value of this.rdf.getObjects(id, SH.hasValue)) {
            constraints.push({ kind: 'hasValue', value })
        }

        this.pushPropertyPairConstraint(constraints, id, SH.equals, 'equals')
        this.pushPropertyPairConstraint(constraints, id, SH.disjoint, 'disjoint')
        this.pushPropertyPairConstraint(constraints, id, SH.lessThan, 'lessThan')
        this.pushPropertyPairConstraint(constraints, id, SH.lessThanOrEquals, 'lessThanOrEquals')

        const not = this.rdf.getSingleObject(id, SH.not)
        if (not) constraints.push({ kind: 'not', shape: not })

        this.pushShapeListConstraint(constraints, id, SH.and, 'and')
        this.pushShapeListConstraint(constraints, id, SH.or, 'or')
        this.pushShapeListConstraint(constraints, id, SH.xone, 'xone')

        const qualifiedShape = this.rdf.getSingleObject(id, SH.qualifiedValueShape)
        if (qualifiedShape) {
            constraints.push({
                kind: 'qualifiedValueShape',
                shape: qualifiedShape,
                minCount: this.readOptionalInteger(id, SH.qualifiedMinCount),
                maxCount: this.readOptionalInteger(id, SH.qualifiedMaxCount),
                disjoint: this.readOptionalBoolean(id, SH.qualifiedValueShapesDisjoint),
            })
        }

        const closed = this.rdf.getSingleObject(id, SH.closed)
        if (closed) {
            const ignoredHead = this.rdf.getSingleObject(id, SH.ignoredProperties)
            const ignoredProperties = ignoredHead
                ? this.rdf.readList(ignoredHead).map(term => this.requireNamedNode(term, 'sh:ignoredProperties member'))
                : []
            constraints.push({ kind: 'closed', value: this.parseBoolean(closed, 'sh:closed'), ignoredProperties })
        }

        return constraints
    }

    private pushIntegerConstraint(constraints: ShaclConstraint[], id: Term, predicate: NamedNode, kind: 'minCount' | 'maxCount' | 'minLength' | 'maxLength'): void {
        const value = this.readOptionalInteger(id, predicate)
        if (value !== undefined) {
            constraints.push({ kind, value } as ShaclConstraint)
        }
    }

    private pushLiteralConstraint(constraints: ShaclConstraint[], id: Term, predicate: NamedNode, kind: 'minExclusive' | 'minInclusive' | 'maxExclusive' | 'maxInclusive'): void {
        const term = this.rdf.getSingleObject(id, predicate)
        if (term) {
            constraints.push({ kind, value: this.requireLiteral(term, `sh:${kind}`) } as ShaclConstraint)
        }
    }

    private pushPropertyPairConstraint(constraints: ShaclConstraint[], id: Term, predicate: NamedNode, kind: 'equals' | 'disjoint' | 'lessThan' | 'lessThanOrEquals'): void {
        for (const term of this.rdf.getObjects(id, predicate)) {
            constraints.push({ kind, property: this.requireNamedNode(term, `sh:${kind}`) } as ShaclConstraint)
        }
    }

    private pushShapeListConstraint(constraints: ShaclConstraint[], id: Term, predicate: NamedNode, kind: 'and' | 'or' | 'xone'): void {
        const head = this.rdf.getSingleObject(id, predicate)
        if (head) {
            constraints.push({ kind, shapes: this.rdf.readList(head) } as ShaclConstraint)
        }
    }

    private readOptionalInteger(id: Term, predicate: NamedNode): number | undefined {
        const term = this.rdf.getSingleObject(id, predicate)
        if (!term) return undefined

        const value = Number.parseInt(this.requireLiteral(term, predicate.value).value, 10)
        if (!Number.isInteger(value)) {
            throw new Error(`${predicate.value} must be an integer literal.`)
        }
        return value
    }

    private readOptionalBoolean(id: Term, predicate: NamedNode): boolean | undefined {
        const term = this.rdf.getSingleObject(id, predicate)
        return term ? this.parseBoolean(term, predicate.value) : undefined
    }

    private parseBoolean(term: Term, label: string): boolean {
        const literal = this.requireLiteral(term, label)
        if (literal.value === 'true' || literal.value === '1') return true
        if (literal.value === 'false' || literal.value === '0') return false
        throw new Error(`${label} must be a boolean literal.`)
    }

    private requireNamedNode(term: Term, label: string): NamedNode {
        if (term.termType !== 'NamedNode') {
            throw new Error(`${label} must be an IRI.`)
        }
        return term
    }

    private requireLiteral(term: Term, label: string): Literal {
        if (term.termType !== 'Literal') {
            throw new Error(`${label} must be a literal.`)
        }
        return term
    }
}
