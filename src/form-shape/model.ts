import { Literal, NamedNode, Term } from '@rdfjs/types'
import { ShaclPath } from '../shacl'

/**
 * Form-oriented projection of supported SHACL semantics.
 *
 * These records describe definitions that can guide form construction. They do
 * not store runtime RDF data and do not represent DOM state.
 */
export interface FormValueConstraints {
    datatype?: NamedNode
    nodeKind?: NamedNode
    class?: NamedNode
    minLength?: number
    maxLength?: number
    minInclusive?: number
    maxInclusive?: number
    minExclusive?: number
    maxExclusive?: number
    pattern?: string
    shaclIn?: Term[]
    languageIn?: Term[]
    hasValue?: Term
}

export interface FormNodeShape {
    id: Term
    label: string
    description?: string
    messages: Literal[]
    targetClasses: NamedNode[]
    valueConstraints: FormValueConstraints
    properties: FormPropertyShape[]
    composedNodeShapes: Term[]
    logicalAlternatives: FormLogicalAlternative[]
}

export interface FormPropertyShape {
    id: Term
    label: string
    description?: Literal
    messages: Literal[]
    path?: ShaclPath
    writablePath?: NamedNode
    pathAlternatives?: NamedNode[]
    pathAlternativeLabels: Record<string, string>
    pathAlternativeBranches: Record<string, FormPropertyShape>
    group?: Term
    order?: number
    minCount?: number
    maxCount?: number
    minLength?: number
    maxLength?: number
    minInclusive?: number
    maxInclusive?: number
    minExclusive?: number
    maxExclusive?: number
    pattern?: string
    datatype?: NamedNode
    nodeKind?: NamedNode
    class?: NamedNode
    /** Primary value shape: the first sh:node value, or the shape found for sh:class. */
    nodeShape?: Term
    /** Every value shape the value must conform to (all sh:node values, sh:class-derived shape). */
    nodeShapes: Term[]
    /** Structural value shapes that can be rendered as nested forms. */
    nestedNodeShapes: Term[]
    /** Concrete authoring choices compatible with a referenced/base shape. */
    compatibleNodeShapes: Term[]
    /** All node-shape constraints relevant to this value, including value-only shapes. */
    valueNodeShapes: Term[]
    shaclIn?: Term[]
    languageIn?: Term[]
    defaultValue?: Term
    hasValue?: Term
    qualifiedValueShape?: Term
    logicalAlternatives: FormLogicalAlternative[]
    sourceShapes: Term[]
}

export interface FormLogicalAlternative {
    kind: 'or' | 'xone'
    shapes: Term[]
}
