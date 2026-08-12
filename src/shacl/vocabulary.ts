import { DataFactory } from 'n3'

const { namedNode } = DataFactory

export const SHACL = 'http://www.w3.org/ns/shacl#'
export const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
export const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
export const SKOS = 'http://www.w3.org/2004/02/skos/core#'
export const FOAF = 'http://xmlns.com/foaf/0.1/'

export const RDF_VOCAB = {
    type: namedNode(`${RDF}type`),
    first: namedNode(`${RDF}first`),
    rest: namedNode(`${RDF}rest`),
    nil: namedNode(`${RDF}nil`),
} as const

export const RDFS_VOCAB = {
    label: namedNode(`${RDFS}label`),
    comment: namedNode(`${RDFS}comment`),
    subClassOf: namedNode(`${RDFS}subClassOf`),
} as const

export const SH = {
    NodeShape: namedNode(`${SHACL}NodeShape`),
    PropertyShape: namedNode(`${SHACL}PropertyShape`),
    property: namedNode(`${SHACL}property`),
    path: namedNode(`${SHACL}path`),
    name: namedNode(`${SHACL}name`),
    description: namedNode(`${SHACL}description`),
    order: namedNode(`${SHACL}order`),
    group: namedNode(`${SHACL}group`),
    targetClass: namedNode(`${SHACL}targetClass`),
    targetNode: namedNode(`${SHACL}targetNode`),
    targetSubjectsOf: namedNode(`${SHACL}targetSubjectsOf`),
    targetObjectsOf: namedNode(`${SHACL}targetObjectsOf`),
    datatype: namedNode(`${SHACL}datatype`),
    nodeKind: namedNode(`${SHACL}nodeKind`),
    class: namedNode(`${SHACL}class`),
    node: namedNode(`${SHACL}node`),
    minCount: namedNode(`${SHACL}minCount`),
    maxCount: namedNode(`${SHACL}maxCount`),
    minExclusive: namedNode(`${SHACL}minExclusive`),
    minInclusive: namedNode(`${SHACL}minInclusive`),
    maxExclusive: namedNode(`${SHACL}maxExclusive`),
    maxInclusive: namedNode(`${SHACL}maxInclusive`),
    minLength: namedNode(`${SHACL}minLength`),
    maxLength: namedNode(`${SHACL}maxLength`),
    pattern: namedNode(`${SHACL}pattern`),
    flags: namedNode(`${SHACL}flags`),
    languageIn: namedNode(`${SHACL}languageIn`),
    uniqueLang: namedNode(`${SHACL}uniqueLang`),
    in: namedNode(`${SHACL}in`),
    defaultValue: namedNode(`${SHACL}defaultValue`),
    hasValue: namedNode(`${SHACL}hasValue`),
    equals: namedNode(`${SHACL}equals`),
    disjoint: namedNode(`${SHACL}disjoint`),
    lessThan: namedNode(`${SHACL}lessThan`),
    lessThanOrEquals: namedNode(`${SHACL}lessThanOrEquals`),
    not: namedNode(`${SHACL}not`),
    and: namedNode(`${SHACL}and`),
    or: namedNode(`${SHACL}or`),
    xone: namedNode(`${SHACL}xone`),
    qualifiedValueShape: namedNode(`${SHACL}qualifiedValueShape`),
    qualifiedMinCount: namedNode(`${SHACL}qualifiedMinCount`),
    qualifiedMaxCount: namedNode(`${SHACL}qualifiedMaxCount`),
    qualifiedValueShapesDisjoint: namedNode(`${SHACL}qualifiedValueShapesDisjoint`),
    closed: namedNode(`${SHACL}closed`),
    ignoredProperties: namedNode(`${SHACL}ignoredProperties`),
    alternativePath: namedNode(`${SHACL}alternativePath`),
    inversePath: namedNode(`${SHACL}inversePath`),
    zeroOrMorePath: namedNode(`${SHACL}zeroOrMorePath`),
    oneOrMorePath: namedNode(`${SHACL}oneOrMorePath`),
    zeroOrOnePath: namedNode(`${SHACL}zeroOrOnePath`),
} as const

export const SKOS_VOCAB = {
    prefLabel: namedNode(`${SKOS}prefLabel`),
    broader: namedNode(`${SKOS}broader`),
    narrower: namedNode(`${SKOS}narrower`),
} as const

export const FOAF_VOCAB = {
    name: namedNode(`${FOAF}name`),
} as const
