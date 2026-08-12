import type { NamedNode, Term } from "@rdfjs/types";

import type { ShaclConstraint } from "../shacl/constraint";
import type { ShaclPath } from "../shacl/path";
import type { FormShapeConstraint } from "./form-shape-constraint";

export interface FormShapeCardinality {
  min: number;
  max?: number;
}

export type FormShapeValueType =
  | { kind: "literal"; datatype?: NamedNode }
  | { kind: "resource"; class?: NamedNode }
  | { kind: "nestedNode"; shape: Term }
  | {
      kind: "nestedNodeChoice";
      choices: FormShapeNodeChoice[];
      exclusive: boolean;
    }
  | { kind: "choice"; values: Term[] }
  | { kind: "unknown" };

export interface FormShapeNodeChoice {
  shape: Term;
  label?: string;
}

/**
 * Compiled description of one form property.
 *
 * The form shape is immutable. It contains presentation metadata, but no DOM
 * and no mutable values.
 */
export class FormShapeProperty {
  constructor(
    public readonly sourceShape: Term,
    public readonly path: ShaclPath,
    public readonly cardinality: FormShapeCardinality,
    public readonly valueType: FormShapeValueType,
    public readonly constraints: FormShapeConstraint[] = [],
    public readonly sourceConstraints: ShaclConstraint[] = [],
    public readonly label: string = sourceShape.value,
    public readonly description?: string,
    public readonly order?: number,
    public readonly group?: Term
  ) {}

  get required(): boolean {
    return this.cardinality.min > 0;
  }

  get repeatable(): boolean {
    return this.cardinality.max !== 1;
  }
}
