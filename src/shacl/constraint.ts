// shacl/constraint.ts

import type {
  Literal,
  NamedNode,
  Term
} from "@rdfjs/types";

/**
 * Semantic representation of a supported SHACL constraint.
 *
 * Constraints are represented as a discriminated union.
 * Can be handled through their `kind` property.
 */
export type ShaclConstraint =
  // Value type
  |  ShDatatype 
  |  ShNodeKind 
  |  ShClass 
  |  ShNode 

  // Cardinality
  |  ShMinCount 
  |  ShMaxCount 

  // Value Range ranges
  |  ShMinExclusive 
  |  ShMinInclusive 
  |  ShMaxExclusive 
  |  ShMaxInclusive 

  // Strings-based constraints
  |  ShMinLength 
  |  ShMaxLength 
  |  ShPattern 

  // Choices / values
  |  ShIn 
  |  ShHasValue 

  // Logical constraints
  |  ShAnd 
  |  ShOr 
  |  ShXone 

  // Property pair constraints
  |  ShEquals 
  |  ShDisjoint 
  |  ShLessThan 
  |  ShLessThanOrEquals 

  | ShLanguageIn
  | ShNot 

  | ShFlags;


// Values Type Contraints 
export interface  ShClass  {
  kind: "class";
  class: NamedNode;
}

export interface  ShDatatype  {
  kind: "datatype";
  datatype: NamedNode;
}

export interface  ShNodeKind  {
  kind: "nodeKind";
  nodeKind: NamedNode;
}

// Cardinality Constraints
export interface  ShMinCount  {
  kind: "minCount";
  value: number;
}

export interface  ShMaxCount  {
  kind: "maxCount";
  value: number;
}

// Value Range Constraints. 
// Their values are literals.
export interface  ShMinExclusive  {
  kind: "minExclusive";
  value: Literal;
}

export interface  ShMinInclusive  {
  kind: "minInclusive";
  value: Literal;
}

export interface  ShMaxExclusive  {
  kind: "maxExclusive";
  value: Literal;
}

export interface  ShMaxInclusive  {
  kind: "maxInclusive";
  value: Literal;
}

// Collections
export interface  ShIn  {
  kind: "in";
  values: Term[];
}

export interface  ShLanguageIn  {
  kind: "languageIn";
  languages: string[];
}

// Property Pair  s
export interface  ShEquals  {
  kind: "equals";
  property: NamedNode;
}

export interface  ShDisjoint  {
  kind: "disjoint";
  property: NamedNode;
}

export interface  ShLessThan  {
  kind: "lessThan";
  property: NamedNode;
}

export interface  ShLessThanOrEquals  {
  kind: "lessThanOrEquals";
  property: NamedNode;
}

export interface  ShNode  {
  kind: "node";

  /**
   * Node shape that each value node must conform to.
   */
  shape: Term;
}

export interface  ShAnd  {
  kind: "and";
  shapes: Term[];
}

export interface  ShOr  {
  kind: "or";
  shapes: Term[];
}

export interface  ShXone  {
  kind: "xone";
  shapes: Term[];
}

export interface  ShNot  {
  kind: "not";
  shape: Term;
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

export interface ShHasValue {
  kind: "hasValue";
  value: Term;
}

export interface ShFlags {
  kind: "flags";
  flags: string;
}