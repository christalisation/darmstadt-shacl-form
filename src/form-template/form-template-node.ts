import type { NamedNode, Term } from "@rdfjs/types";

import type { ShaclConstraint } from "../shacl/constraint";
import type { FormTemplateProperty } from "./form-template-property";

/**
 * Compiled description of one node-oriented form.
 */
export class FormTemplateNode {
  constructor(
    public readonly sourceShape: Term,
    public readonly properties: FormTemplateProperty[] = [],
    public readonly sourceConstraints: ShaclConstraint[] = [],
    public readonly label: string = sourceShape.value,
    public readonly description?: string,
    public readonly targetClasses: NamedNode[] = []
  ) {}
}
