// shacl/analysis-result.ts

import type { Term } from "@rdfjs/types";

export interface ShaclAnalysisResult {
  conforms: boolean;
  violations: ShaclAnalysisViolation[];
}

export interface ShaclAnalysisViolation {
  message: string;

  focusNode?: Term;
  path?: unknown;
  constraintComponent?: Term;
  sourceShape?: Term;
  value?: Term;
}