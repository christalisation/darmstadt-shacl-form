import type { Literal, NamedNode, Term } from "@rdfjs/types";

/**
 * Form-oriented constraints used for lightweight runtime/UI validation.
 *
 * This is intentionally not a second complete SHACL implementation.
 */
export type FormShapeConstraint =
  | FormShapeDatatypeConstraint
  | FormShapeNodeKindConstraint
  | FormShapeNumericRangeConstraint
  | FormShapeLengthConstraint
  | FormShapePatternConstraint
  | FormShapeChoiceConstraint
  | FormShapeHasValueConstraint
  | FormShapeLogicalConstraint
  | FormShapePropertyPairConstraint;

export interface FormShapeDatatypeConstraint {
  kind: "datatype";
  datatype: NamedNode;
}

export interface FormShapeNodeKindConstraint {
  kind: "nodeKind";
  nodeKind: NamedNode;
}

export interface FormShapeNumericRangeConstraint {
  kind: "numericRange";
  minExclusive?: Literal;
  minInclusive?: Literal;
  maxExclusive?: Literal;
  maxInclusive?: Literal;
}

export interface FormShapeLengthConstraint {
  kind: "length";
  min?: number;
  max?: number;
}

export interface FormShapePatternConstraint {
  kind: "pattern";
  pattern: string;
  flags?: string;
}

export interface FormShapeChoiceConstraint {
  kind: "choice";
  values: Term[];
}

export interface FormShapeHasValueConstraint {
  kind: "hasValue";
  value: Term;
}

export interface FormShapeLogicalConstraint {
  kind: "and" | "or" | "xone" | "not";
  shapes: Term[];
}

export interface FormShapePropertyPairConstraint {
  kind: "equals" | "disjoint" | "lessThan" | "lessThanOrEquals";
  property: NamedNode;
}
