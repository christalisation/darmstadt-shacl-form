import { Literal, NamedNode, Term } from '@rdfjs/types'
import { ShaclPath } from '../shacl'

export type FormNodeShapeRole = 'STRUCTURAL' | 'VALUE_ONLY' | 'NON_RENDERABLE'

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
    role: FormNodeShapeRole
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
    nodeShape?: Term
    nestedNodeShapes: Term[]
    compatibleNodeShapes: Term[]
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
