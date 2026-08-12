import type { Term } from "@rdfjs/types";

import type { FormShapeNode } from "./form-shape-node";

function termKey(term: Term): string {
  return `${term.termType}:${term.value}`;
}

/**
 * Registry of compiled form shapes.
 *
 * Useful for nested shapes and repeated references to the same shape.
 */
export class FormShapeRegistry {
  private readonly formShapes = new Map<string, FormShapeNode>();

  register(shape: FormShapeNode): void {
    this.formShapes.set(termKey(shape.sourceShape), shape);
  }

  get(shape: Term): FormShapeNode | undefined {
    return this.formShapes.get(termKey(shape));
  }

  has(shape: Term): boolean {
    return this.formShapes.has(termKey(shape));
  }

  values(): IterableIterator<FormShapeNode> {
    return this.formShapes.values();
  }
}
