import type { Literal, NamedNode, Term } from "@rdfjs/types";

import type { ShaclConstraint } from "./constraint";
import type { ShaclPath } from "./path";

/**
 * Semantic representation of a SHACL node shape.
 */
export interface ShaclNodeShape {
  id: Term;
  targets: ShaclTarget[];
  properties: ShaclPropertyShape[];
  constraints: ShaclConstraint[];
  metadata: ShaclShapeMetadata;
}

/**
 * Semantic representation of a SHACL property shape.
 */
export interface ShaclPropertyShape {
  id: Term;
  path: ShaclPath;
  constraints: ShaclConstraint[];
  metadata: ShaclShapeMetadata;
}

export interface ShaclShapeMetadata {
  names: Literal[];
  descriptions: Literal[];
  order?: number;
  group?: Term;
  defaultValue?: Term;
}

export type ShaclTarget =
  | {
      kind: "class";
      class: NamedNode;
    }
  | {
      kind: "node";
      node: Term;
    }
  | {
      kind: "subjectsOf";
      predicate: NamedNode;
    }
  | {
      kind: "objectsOf";
      predicate: NamedNode;
    };
