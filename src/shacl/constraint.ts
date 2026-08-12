import { Literal, NamedNode, Term } from '@rdfjs/types'

export type ShaclConstraint =
    | { kind: 'datatype', datatype: NamedNode }
    | { kind: 'nodeKind', nodeKind: NamedNode }
    | { kind: 'class', class: NamedNode }
    | { kind: 'node', shape: Term }
    | { kind: 'minCount', value: number }
    | { kind: 'maxCount', value: number }
    | { kind: 'minExclusive', value: Literal }
    | { kind: 'minInclusive', value: Literal }
    | { kind: 'maxExclusive', value: Literal }
    | { kind: 'maxInclusive', value: Literal }
    | { kind: 'minLength', value: number }
    | { kind: 'maxLength', value: number }
    | { kind: 'pattern', pattern: string, flags?: string }
    | { kind: 'languageIn', languages: string[] }
    | { kind: 'uniqueLang', value: boolean }
    | { kind: 'in', values: Term[] }
    | { kind: 'hasValue', value: Term }
    | { kind: 'equals', property: NamedNode }
    | { kind: 'disjoint', property: NamedNode }
    | { kind: 'lessThan', property: NamedNode }
    | { kind: 'lessThanOrEquals', property: NamedNode }
    | { kind: 'not', shape: Term }
    | { kind: 'and', shapes: Term[] }
    | { kind: 'or', shapes: Term[] }
    | { kind: 'xone', shapes: Term[] }
    | { kind: 'qualifiedValueShape', shape: Term, minCount?: number, maxCount?: number, disjoint?: boolean }
    | { kind: 'closed', value: boolean, ignoredProperties: NamedNode[] }
