import type { Literal, NamedNode, Term } from "@rdfjs/types";

/**
 * Semantic representation of supported SHACL Core constraints.
 *
 * The model intentionally stays close to SHACL. Form-specific normalization
 * (for example minCount + maxCount -> Cardinality) belongs to FormTemplateCompiler.
 */
export type ShaclConstraint =
  | ShDatatype
  | ShNodeKind
  | ShClass
  | ShNode
  | ShMinCount
  | ShMaxCount
  | ShMinExclusive
  | ShMinInclusive
  | ShMaxExclusive
  | ShMaxInclusive
  | ShMinLength
  | ShMaxLength
  | ShPattern
  | ShLanguageIn
  | ShUniqueLang
  | ShIn
  | ShHasValue
  | ShEquals
  | ShDisjoint
  | ShLessThan
  | ShLessThanOrEquals
  | ShNot
  | ShAnd
  | ShOr
  | ShXone
  | ShQualifiedValueShape
  | ShClosed;

export interface ShDatatype {
  kind: "datatype";
  datatype: NamedNode;
}

export interface ShNodeKind {
  kind: "nodeKind";
  nodeKind: NamedNode;
}

export interface ShClass {
  kind: "class";
  class: NamedNode;
}

export interface ShNode {
  kind: "node";
  shape: Term;
}

export interface ShMinCount {
  kind: "minCount";
  value: number;
}

export interface ShMaxCount {
  kind: "maxCount";
  value: number;
}

export interface ShMinExclusive {
  kind: "minExclusive";
  value: Literal;
}

export interface ShMinInclusive {
  kind: "minInclusive";
  value: Literal;
}

export interface ShMaxExclusive {
  kind: "maxExclusive";
  value: Literal;
}

export interface ShMaxInclusive {
  kind: "maxInclusive";
  value: Literal;
}

export interface ShMinLength {
  kind: "minLength";
  value: number;
}

export interface ShMaxLength {
  kind: "maxLength";
  value: number;
}

export interface ShPattern {
  kind: "pattern";
  pattern: string;
  flags?: string;
}

export interface ShLanguageIn {
  kind: "languageIn";
  languages: string[];
}

export interface ShUniqueLang {
  kind: "uniqueLang";
  value: boolean;
}

export interface ShIn {
  kind: "in";
  values: Term[];
}

export interface ShHasValue {
  kind: "hasValue";
  value: Term;
}

export interface ShEquals {
  kind: "equals";
  property: NamedNode;
}

export interface ShDisjoint {
  kind: "disjoint";
  property: NamedNode;
}

export interface ShLessThan {
  kind: "lessThan";
  property: NamedNode;
}

export interface ShLessThanOrEquals {
  kind: "lessThanOrEquals";
  property: NamedNode;
}

export interface ShNot {
  kind: "not";
  shape: Term;
}

export interface ShAnd {
  kind: "and";
  shapes: Term[];
}

export interface ShOr {
  kind: "or";
  shapes: Term[];
}

export interface ShXone {
  kind: "xone";
  shapes: Term[];
}

export interface ShQualifiedValueShape {
  kind: "qualifiedValueShape";
  shape: Term;
  minCount?: number;
  maxCount?: number;
  disjoint?: boolean;
}

export interface ShClosed {
  kind: "closed";
  value: boolean;
  ignoredProperties: NamedNode[];
}
