import { Literal, NamedNode, Term } from '@rdfjs/types'
import { ShaclConstraint } from './constraint'
import { ShaclPath } from './path'

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
    order?: number
    group?: Term
    defaultValue?: Term
}

export type ShaclTarget =
    | { kind: 'class', class: NamedNode }
    | { kind: 'node', node: Term }
    | { kind: 'subjectsOf', predicate: NamedNode }
    | { kind: 'objectsOf', predicate: NamedNode }
