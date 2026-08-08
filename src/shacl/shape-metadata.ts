import type { Literal, Term } from "@rdfjs/types";

/**
 * Non-validating SHACL information useful to higher layers.
 *
 * Labels are kept as RDF literals here. Language selection belongs to
 * FormTemplateCompiler, not to the SHACL semantic model.
 */
export interface ShaclShapeMetadata {
  names: Literal[];
  descriptions: Literal[];
  order?: number;
  group?: Term;
}
