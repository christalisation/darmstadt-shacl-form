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

interface ShaclEngineTermPointer {
  term?: Term;
  ptrs?: Array<{
    _term?: Term;
  }>;
}

interface ShaclEngineShapePointer {
  ptr?: ShaclEngineTermPointer;
}

interface ShaclEngineMessage {
  value?: string;
}

interface ShaclEngineResultLike {
  message?: ShaclEngineMessage[];
  results?: ShaclEngineResultLike[];
  focusNode?: ShaclEngineTermPointer;
  value?: ShaclEngineTermPointer;
  shape?: ShaclEngineShapePointer;
  sourceShape?: Term;
  constraintComponent?: Term;
  sourceConstraintComponent?: Term;
  path?: unknown;
}

interface ShaclEngineReportLike {
  conforms?: boolean;
  results?: ShaclEngineResultLike[];
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
    }) as ShaclEngineReportLike;

    const rawResults = this.flatten(report.results ?? []);

    return {
      conforms: Boolean(report.conforms),
      violations: rawResults.map(result => this.mapViolation(result))
    };
  }

  private flatten(
    results: ShaclEngineResultLike[]
  ): ShaclEngineResultLike[] {
    return results.flatMap(result =>
      result.results?.length
        ? this.flatten(result.results)
        : [result]
    );
  }

  private mapViolation(
    result: ShaclEngineResultLike
  ): ShaclDataValidationViolation {
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

  private messages(result: ShaclEngineResultLike): string[] {
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

  private extractPathPredicates(path: unknown): NamedNode[] {
    const predicates = new Map<string, NamedNode>();

    const visit = (value: unknown): void => {
      if (!value) return;

      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }

      const record =
        typeof value === "object" && value !== null
          ? value as Record<string, unknown>
          : undefined;

      if (!record) return;

      if (
        record.termType === "NamedNode" &&
        typeof record.value === "string"
      ) {
        predicates.set(
          record.value,
          record as unknown as NamedNode
        );
      }

      if (
        typeof record.id === "string" &&
        /^https?:/.test(record.id)
      ) {
        const node = DataFactory.namedNode(record.id);
        predicates.set(node.value, node);
      }

      visit(record.predicates);
      visit(record.path);
    };

    visit(path);
    return [...predicates.values()];
  }
}
