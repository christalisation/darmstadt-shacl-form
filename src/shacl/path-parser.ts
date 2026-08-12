import { NamedNode, Term } from '@rdfjs/types'
import { RdfReader } from '../rdf'
import { ShaclPath } from './path'
import { SH, RDF_VOCAB } from './vocabulary'

export class ShaclPathParser {
    constructor(private readonly rdf: RdfReader) {}

    parse(term: Term, visited = new Set<string>()): ShaclPath {
        if (term.termType === 'NamedNode') {
            return { kind: 'predicate', predicate: term as NamedNode }
        }

        const key = `${term.termType}:${term.value}`
        if (visited.has(key)) {
            throw new Error(`Recursive SHACL property path at ${key}.`)
        }
        visited.add(key)

        const sequenceItems = this.rdf.readList(term)
        if (sequenceItems.length > 0 && this.rdf.getObjects(term, RDF_VOCAB.first).length > 0) {
            return {
                kind: 'sequence',
                paths: sequenceItems.map(item => this.parse(item, visited)),
            }
        }

        const alternativeHead = this.rdf.getSingleObject(term, SH.alternativePath)
        if (alternativeHead) {
            return {
                kind: 'alternative',
                paths: this.rdf.readList(alternativeHead).map(item => this.parse(item, visited)),
            }
        }

        const inverse = this.rdf.getSingleObject(term, SH.inversePath)
        if (inverse) {
            return { kind: 'inverse', path: this.parse(inverse, visited) }
        }

        const zeroOrMore = this.rdf.getSingleObject(term, SH.zeroOrMorePath)
        if (zeroOrMore) {
            return { kind: 'zeroOrMore', path: this.parse(zeroOrMore, visited) }
        }

        const oneOrMore = this.rdf.getSingleObject(term, SH.oneOrMorePath)
        if (oneOrMore) {
            return { kind: 'oneOrMore', path: this.parse(oneOrMore, visited) }
        }

        const zeroOrOne = this.rdf.getSingleObject(term, SH.zeroOrOnePath)
        if (zeroOrOne) {
            return { kind: 'zeroOrOne', path: this.parse(zeroOrOne, visited) }
        }

        throw new Error(`Unsupported or malformed SHACL property path at ${key}.`)
    }
}
