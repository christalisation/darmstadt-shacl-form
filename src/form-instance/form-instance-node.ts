import type { Term } from "@rdfjs/types";

import type { FormShapeNode } from "../form-shape/form-shape-node";
import { FormInstanceProperty } from "./form-instance-property";
import type { FormValidationResult } from "./form-validation-result";

/**
 * Mutable runtime representation of one RDF node being edited.
 */
export class FormInstanceNode {
  public readonly properties: FormInstanceProperty[];

  constructor(
    public readonly subject: Term,
    public readonly template: FormShapeNode
  ) {
    this.properties = template.properties.map(
      property => new FormInstanceProperty(property)
    );
  }

  validate(): FormValidationResult {
    const errors = this.properties.flatMap(
      property => property.validate().errors
    );

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
