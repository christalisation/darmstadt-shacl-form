export type { ShaclConstraint } from "./constraint";
export type { ShaclTarget } from "./target";
export type { ShaclShapeMetadata } from "./shape-metadata";

export type {
  ShaclPath,
  ShaclPathPredicate,
  ShaclPathSequence,
  ShaclPathAlternative,
  ShaclPathInverse,
  ShaclPathZeroOrMore,
  ShaclPathOneOrMore,
  ShaclPathZeroOrOne
} from "./path";

export {
  isPredicatePath,
  getPredicatePath,
  getAlternativePredicatePaths,
  pathToString
} from "./path";

export { ShaclNodeShape } from "./node-shape";
export { ShaclPropertyShape } from "./property-shape";
export { ShaclPathParser } from "./path-parser";
export { ShaclGraphParser } from "./graph-parser";
export { ShaclSemanticAnalyzer } from "./semantic-analyser";
export type { ShaclAnalysisResult, ShaclAnalysisViolation } from "./analysis-result";
