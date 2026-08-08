import type { NamedNode, Term } from "@rdfjs/types";

import type { ShaclConstraint } from "../shacl/constraint";
import type { ShaclPath } from "../shacl/path";
import type { FormTemplateConstraint } from "./form-template-constraint";

export interface FormTemplateCardinality {
  min: number;
  max?: number;
}

export type FormTemplateValueType =
  | { kind: "literal"; datatype?: NamedNode }
  | { kind: "resource"; class?: NamedNode }
  | { kind: "nestedNode"; shape: Term }
  | { kind: "choice"; values: Term[] }
  | { kind: "unknown" };

/**
 * Compiled description of one form property.
 *
 * The template is immutable. It contains presentation metadata, but no DOM
 * and no mutable values.
 */
export class FormTemplateProperty {
  constructor(
    public readonly sourceShape: Term,
    public readonly path: ShaclPath,
    public readonly cardinality: FormTemplateCardinality,
    public readonly valueType: FormTemplateValueType,
    public readonly constraints: FormTemplateConstraint[] = [],
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
