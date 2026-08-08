import type { Literal, NamedNode, Term } from "@rdfjs/types";

/**
 * Form-oriented constraints used for lightweight runtime/UI validation.
 *
 * This is intentionally not a second complete SHACL implementation.
 */
export type FormTemplateConstraint =
  | FormTemplateDatatypeConstraint
  | FormTemplateNodeKindConstraint
  | FormTemplateNumericRangeConstraint
  | FormTemplateLengthConstraint
  | FormTemplatePatternConstraint
  | FormTemplateChoiceConstraint
  | FormTemplateHasValueConstraint
  | FormTemplateLogicalConstraint
  | FormTemplatePropertyPairConstraint;

export interface FormTemplateDatatypeConstraint {
  kind: "datatype";
  datatype: NamedNode;
}

export interface FormTemplateNodeKindConstraint {
  kind: "nodeKind";
  nodeKind: NamedNode;
}

export interface FormTemplateNumericRangeConstraint {
  kind: "numericRange";
  minExclusive?: Literal;
  minInclusive?: Literal;
  maxExclusive?: Literal;
  maxInclusive?: Literal;
}

export interface FormTemplateLengthConstraint {
  kind: "length";
  min?: number;
  max?: number;
}

export interface FormTemplatePatternConstraint {
  kind: "pattern";
  pattern: string;
  flags?: string;
}

export interface FormTemplateChoiceConstraint {
  kind: "choice";
  values: Term[];
}

export interface FormTemplateHasValueConstraint {
  kind: "hasValue";
  value: Term;
}

export interface FormTemplateLogicalConstraint {
  kind: "and" | "or" | "xone" | "not";
  shapes: Term[];
}

export interface FormTemplatePropertyPairConstraint {
  kind: "equals" | "disjoint" | "lessThan" | "lessThanOrEquals";
  property: NamedNode;
}
