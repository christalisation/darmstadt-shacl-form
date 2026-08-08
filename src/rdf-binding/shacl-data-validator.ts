import type { NamedNode, Term } from "@rdfjs/types";
import { DataFactory, Store } from "n3";
import { Validator } from "shacl-engine";

export interface ShaclDataValidationViolation {
  message: string;
  focusNode?: Term;
  value?: Term;
  sourceShape?: Term;
  constraintComponent?: Term;
  path?: unknown;
  pathPredicates: NamedNode[];
}

export interface ShaclDataValidationResult {
  conforms: boolean;
  violations: ShaclDataValidationViolation[];
}

/**
 * Authoritative validation of generated RDF against the original SHACL graph.
 */
export class ShaclDataValidator {
  constructor(private readonly shapesGraph: Store) {}

  async validate(dataGraph: Store): Promise<ShaclDataValidationResult> {
    const validator = new Validator(this.shapesGraph, {
      details: true,
      factory: DataFactory
    });

    const report = await validator.validate({
      dataset: dataGraph
    });

    const rawResults = this.flatten(report.results ?? []);

    return {
      conforms: Boolean(report.conforms),
      violations: rawResults.map(result => this.mapViolation(result))
    };
  }

  private flatten(results: any[]): any[] {
    return results.flatMap(result =>
      result.results?.length
        ? this.flatten(result.results)
        : [result]
    );
  }

  private mapViolation(result: any): ShaclDataValidationViolation {
    return {
      message:
        this.messages(result).join("\n") ||
        "SHACL validation error",

      focusNode:
        result.focusNode?.term ??
        result.focusNode?.ptrs?.[0]?._term,

      value: result.value?.term,

      sourceShape:
        result.shape?.ptr?.term ??
        result.sourceShape,

      constraintComponent:
        result.constraintComponent ??
        result.sourceConstraintComponent,

      path: result.path,
      pathPredicates: this.extractPathPredicates(result.path)
    };
  }

  private messages(result: any): string[] {
    const messages: string[] = [];

    for (const message of result.message ?? []) {
      if (message.value?.trim()) {
        messages.push(message.value.trim());
      }
    }

    for (const nested of result.results ?? []) {
      messages.push(...this.messages(nested));
    }

    return [...new Set(messages)];
  }

  private extractPathPredicates(path: any): NamedNode[] {
    const predicates = new Map<string, NamedNode>();

    const visit = (value: any): void => {
      if (!value) return;

      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }

      if (value.termType === "NamedNode") {
        predicates.set(value.value, value);
      }

      if (
        typeof value.id === "string" &&
        /^https?:/.test(value.id)
      ) {
        const node = DataFactory.namedNode(value.id);
        predicates.set(node.value, node);
      }

      if (value.predicates) visit(value.predicates);
      if (value.path) visit(value.path);
    };

    visit(path);
    return [...predicates.values()];
  }
}
