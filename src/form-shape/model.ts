import { Literal, NamedNode, Term } from '@rdfjs/types'
import { ShaclPath } from '../shacl'

export interface FormNodeShape {
    id: Term
    label: string
    description?: string
    targetClasses: NamedNode[]
    properties: FormPropertyShape[]
    composedNodeShapes: Term[]
    logicalAlternatives: FormLogicalAlternative[]
}

export interface FormPropertyShape {
    id: Term
    label: string
    description?: Literal
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
