import type { Term } from "@rdfjs/types";
import { DataFactory, Store, StreamParser } from "n3";
import { Validator } from "shacl-engine";

import shaclShacl from "../assets/shacl-shacl.ttl?raw"; // SHACL-SHACL shapes

export interface ShaclShapeValidationResult {
  conforms: boolean;
  violations: ShaclShapeValidationViolation[];
}

export interface ShaclShapeValidationViolation {
  message: string;
  focusNode?: Term;
  path?: unknown;
  constraintComponent?: Term;
  sourceShape?: Term;
  value?: Term;
}

interface ShaclEngineResultLike {
  message?: Array<{
    value?: string;
  }>;
  focusNode?: {
    term?: Term;
  };
  path?: unknown;
  constraintComponent?: Term;
  sourceConstraintComponent?: Term;
  shape?: {
    ptr?: {
      term?: Term;
    };
  };
  sourceShape?: Term;
  value?: {
    term?: Term;
  };
}

interface ShaclEngineReportLike {
  conforms?: boolean;
  results?: ShaclEngineResultLike[];
}

/**
 * Validates an input shape graph (RDF) against SHACL-SHACL.
 * 
 * (i.e semantic validation)
 */
export class ShaclShapeValidator {
  private static shapes: Store | null = null;
  private static loading: Promise<Store> | null = null;

  private static async getShaclShacl(): Promise<Store> {
    // caches
    if (this.shapes) return this.shapes;
    if (this.loading) return this.loading;

    this.loading = new Promise((resolve, reject) => {
      const store = new Store();
      const parser = new StreamParser();

      parser.on("data", quad => store.addQuad(quad));
      parser.on("end", () => {
        this.shapes = store;
        resolve(store);
      });
      parser.on("error", reject);

      parser.write(shaclShacl);
      parser.end();
    });

    return this.loading;
  }

  /**
   * Analyzes the input shape graph against SHACL-SHACL.
   * @param shapesGraph, the input shape graph (Store object) to analyze.
   * @returns results as a ShaclShapeValidationResult
   */
  async validate(shapesGraph: Store): Promise<ShaclShapeValidationResult> {
    const shaclShapes = await ShaclShapeValidator.getShaclShacl();

    const validator = new Validator(shaclShapes, {
      details: true,
      factory: DataFactory
    });

    const report = await validator.validate({
      dataset: shapesGraph
    }) as ShaclEngineReportLike;

    return {
      conforms: Boolean(report.conforms),
      violations: (report.results ?? []).map(result =>
        this.mapViolation(result)
      )
    };
  }

  /**
   * Maps a SHACL validation result to a ShaclShapeValidationViolation.
   */
  private mapViolation(
    result: ShaclEngineResultLike
  ): ShaclShapeValidationViolation {
    const message = result.message?.length
      ? result.message
          .map(item => item.value)
          .filter((value): value is string => Boolean(value?.trim()))
          .join(", ")
      : "SHACL-SHACL validation error";

    return {
      message,
      focusNode: result.focusNode?.term,
      path: result.path,
      constraintComponent:
        result.constraintComponent ??
        result.sourceConstraintComponent,
      sourceShape:
        result.shape?.ptr?.term ??
        result.sourceShape,
      value: result.value?.term
    };
  }
}
