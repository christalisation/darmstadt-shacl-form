import { DataFactory, Store, StreamParser } from "n3";
import { Validator } from "shacl-engine";

import shaclShacl from "../assets/shacl-shacl.ttl?raw"; // SHACL-SHACL shapes

import type { ShaclAnalysisResult, ShaclAnalysisViolation } from "./analysis-result";

/**
 * Validates an input shape graph (RDF) against SHACL-SHACL.
 * 
 * (i.e semantic validation)
 */
export class ShaclSemanticAnalyzer {
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
   * @returns results as a ShaclAnalysisResult
   */
  async analyze(shapesGraph: Store): Promise<ShaclAnalysisResult> {
    const shaclShapes = await ShaclSemanticAnalyzer.getShaclShacl();

    const validator = new Validator(shaclShapes, {
      details: true,
      factory: DataFactory
    });

    const report = await validator.validate({
      dataset: shapesGraph
    });

    return {
      conforms: Boolean(report.conforms),
      violations: (report.results ?? []).map((result: any) =>
        this.mapViolation(result)
      )
    };
  }

  /**
   * Maps a SHACL validation result to a ShaclAnalysisViolation.
   * @param result, the SHACL validation result to map.
   * @returns a ShaclAnalysisViolation object.
   */
  private mapViolation(result: any): ShaclAnalysisViolation {
    const message = result.message?.length
      ? result.message.map((item: any) => item.value).join(", ")
      : "SHACL-SHACL validation error";

    return {
      message,
      focusNode: result.focusNode?.term,
      path: result.path,
      constraintComponent: result.constraintComponent,
      sourceShape: result.shape?.ptr?.term,
      value: result.value?.term
    };
  }
}
