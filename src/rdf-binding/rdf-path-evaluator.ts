import type { Term } from "@rdfjs/types";
import { Store } from "n3";

import type { ShaclPath } from "../shacl/path";

/**
 * Evaluates SHACL paths against an RDF data graph.
 *
 * Predicate, inverse, alternative and sequence paths are implemented here.
 * Quantified paths use graph traversal with duplicate elimination.
 */
export class RdfPathEvaluator {
  constructor(
    private readonly store: Store
  ) {}

  evaluate(subject: Term, path: ShaclPath): Term[] {
    switch (path.kind) {
      case "predicate":
        return this.store.getObjects(subject, path.predicate, null);

      case "inverse":
        return this.evaluateInverse(subject, path.path);

      case "alternative":
        return this.unique(
          path.paths.flatMap(branch => this.evaluate(subject, branch))
        );

      case "sequence": {
        let current: Term[] = [subject];

        for (const step of path.paths) {
          current = this.unique(
            current.flatMap(node => this.evaluate(node, step))
          );
        }

        return current;
      }

      case "zeroOrOne":
        return this.unique([
          subject,
          ...this.evaluate(subject, path.path)
        ]);

      case "zeroOrMore":
        return this.transitiveClosure(subject, path.path, true);

      case "oneOrMore":
        return this.transitiveClosure(subject, path.path, false);
    }
  }

  private evaluateInverse(subject: Term, path: ShaclPath): Term[] {
    if (path.kind === "predicate") {
      return this.store.getSubjects(path.predicate, subject, null);
    }

    // General inverse paths can be implemented by recursively reversing the
    // path expression. Keep this explicit rather than silently guessing.
    throw new Error(
      "General inverse path evaluation is not implemented yet."
    );
  }

  private transitiveClosure(
    subject: Term,
    path: ShaclPath,
    includeStart: boolean
  ): Term[] {
    const visited = new Map<string, Term>();
    const queue: Term[] = [];

    if (includeStart) {
      visited.set(this.key(subject), subject);
    }

    for (const next of this.evaluate(subject, path)) {
      const key = this.key(next);
      if (!visited.has(key)) {
        visited.set(key, next);
        queue.push(next);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const next of this.evaluate(current, path)) {
        const key = this.key(next);

        if (!visited.has(key)) {
          visited.set(key, next);
          queue.push(next);
        }
      }
    }

    return [...visited.values()];
  }

  private unique(terms: Term[]): Term[] {
    const map = new Map<string, Term>();

    for (const term of terms) {
      map.set(this.key(term), term);
    }

    return [...map.values()];
  }

  private key(term: Term): string {
    if (term.termType === "Literal") {
      return [
        term.termType,
        term.value,
        term.language,
        term.datatype.value
      ].join(":");
    }

    return `${term.termType}:${term.value}`;
  }
}
