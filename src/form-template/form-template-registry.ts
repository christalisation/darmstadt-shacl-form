import type { Term } from "@rdfjs/types";

import type { FormTemplateNode } from "./form-template-node";

function termKey(term: Term): string {
  return `${term.termType}:${term.value}`;
}

/**
 * Registry of compiled node templates.
 *
 * Useful for nested shapes and repeated references to the same shape.
 */
export class FormTemplateRegistry {
  private readonly templates = new Map<string, FormTemplateNode>();

  register(template: FormTemplateNode): void {
    this.templates.set(termKey(template.sourceShape), template);
  }

  get(shape: Term): FormTemplateNode | undefined {
    return this.templates.get(termKey(shape));
  }

  has(shape: Term): boolean {
    return this.templates.has(termKey(shape));
  }

  values(): IterableIterator<FormTemplateNode> {
    return this.templates.values();
  }
}
