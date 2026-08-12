import type { Term } from "@rdfjs/types";

import type { FormShapeNode } from "../form-shape/form-shape-node";
import { FormInstanceNode } from "./form-instance-node";
import type { FormValidationResult } from "./form-validation-result";

function nodeKey(term: Term): string {
  return `${term.termType}:${term.value}`;
}

/**
 * Runtime graph of all nodes currently created or loaded in the form.
 *
 * This replaces the old DOM-based ShaclNodeCollection. The registry is now
 * independent from rendering, so several UI elements may reference the same
 * runtime node.
 */
export class FormInstanceGraph {
  private readonly nodes = new Map<string, FormInstanceNode>();
  private readonly _roots: FormInstanceNode[] = [];
  private readonly committedRoots = new Set<string>();

  get roots(): readonly FormInstanceNode[] {
    return this._roots;
  }

  addNode(node: FormInstanceNode, root = false): void {
    this.nodes.set(nodeKey(node.subject), node);

    if (root && !this._roots.includes(node)) {
      this._roots.push(node);
    }
  }

  createNode(
    subject: Term,
    template: FormShapeNode,
    root = false
  ): FormInstanceNode {
    const existing = this.getNode(subject);
    if (existing) return existing;

    const node = new FormInstanceNode(subject, template);
    this.addNode(node, root);
    return node;
  }

  getNode(subject: Term): FormInstanceNode | undefined {
    return this.nodes.get(nodeKey(subject));
  }

  commitRoot(node: FormInstanceNode): void {
    if (!this._roots.includes(node)) {
      throw new Error("Only root nodes can be committed.");
    }

    this.committedRoots.add(nodeKey(node.subject));
  }

  isRootCommitted(node: FormInstanceNode): boolean {
    return this.committedRoots.has(nodeKey(node.subject));
  }

  getCommittedRoots(): FormInstanceNode[] {
    return this._roots.filter(node => this.isRootCommitted(node));
  }

  /**
   * Returns nodes from the current form that may be reused.
   *
   * The caller may provide subjects to exclude, e.g. the current ancestry,
   * to avoid creating an accidental immediate cycle in the UI.
   */
  getReusableNodes(
    template: FormShapeNode,
    excludeSubjects: Term[] = []
  ): FormInstanceNode[] {
    const excluded = new Set(excludeSubjects.map(nodeKey));

    return [...this.nodes.values()].filter(node => {
      if (excluded.has(nodeKey(node.subject))) return false;

      return (
        node.template.sourceShape.termType === template.sourceShape.termType &&
        node.template.sourceShape.value === template.sourceShape.value
      );
    });
  }

  allNodes(): FormInstanceNode[] {
    return [...this.nodes.values()];
  }

  validate(): FormValidationResult {
    const errors = this.allNodes().flatMap(
      node => node.validate().errors
    );

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
