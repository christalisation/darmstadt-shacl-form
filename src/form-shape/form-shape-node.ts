import type { NamedNode, Term } from "@rdfjs/types";

import type { ShaclConstraint } from "../shacl/constraint";
import type { FormShapeProperty } from "./form-shape-property";

/**
 * Compiled description of one node-oriented form.
 */
export class FormShapeNode {
  constructor(
    public readonly sourceShape: Term,
    public readonly properties: FormShapeProperty[] = [],
    public readonly sourceConstraints: ShaclConstraint[] = [],
    public readonly label: string = sourceShape.value,
    public readonly description?: string,
    public readonly targetClasses: NamedNode[] = []
  ) {}
}
