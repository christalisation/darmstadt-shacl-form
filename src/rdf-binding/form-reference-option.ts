import type { Term } from "@rdfjs/types";

/**
 * One selectable RDF resource, optionally arranged in a hierarchy.
 */
export interface FormReferenceOption {
  value: Term;
  label: string;
  children?: FormReferenceOption[];
}
