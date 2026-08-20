import { Literal, NamedNode, Term } from '@rdfjs/types'
import { ShaclConstraint } from './constraint'
import { ShaclPath } from './path'

/**
 * Immutable semantic records for the SHACL shapes graph.
 *
 * These interfaces describe what the SHACL graph says, before any
 * form-generation policy or DOM rendering choices are applied.
 */
export interface ShaclNodeShape {
    id: Term
    targets: ShaclTarget[]
    propertyShapes: ShaclPropertyShape[]
    constraints: ShaclConstraint[]
    metadata: ShaclShapeMetadata
}

export interface ShaclPropertyShape {
    id: Term
    path?: ShaclPath
    constraints: ShaclConstraint[]
    metadata: ShaclShapeMetadata
}

export interface ShaclShapeMetadata {
    names: Literal[]
    labels: Literal[]
    descriptions: Literal[]
    messages: Literal[]
    order?: number
    group?: Term
    defaultValue?: Term
}

export type ShaclTarget =
    | { kind: 'class', class: NamedNode }
    | { kind: 'node', node: Term }
    | { kind: 'subjectsOf', predicate: NamedNode }
    | { kind: 'objectsOf', predicate: NamedNode }
