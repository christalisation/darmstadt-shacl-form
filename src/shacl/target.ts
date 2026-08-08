// shacl/target.ts

import type {
  NamedNode,
  Term
} from "@rdfjs/types";

/**
 * Semantic representation of a SHACL target declaration.
 */
export type ShaclTarget =
  | ShaclTargetClass
  | ShaclTargetNode
  | ShaclTargetSubjectsOf
  | ShaclTargetObjectsOf;

export interface ShaclTargetClass {
  kind: "class";
  class: NamedNode;
}

export interface ShaclTargetNode {
  kind: "node";
  node: Term;
}

export interface ShaclTargetSubjectsOf {
  kind: "subjectsOf";
  predicate: NamedNode;
}

export interface ShaclTargetObjectsOf {
  kind: "objectsOf";
  predicate: NamedNode;
}