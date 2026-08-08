// shacl/property-shape.ts

import type { Term } from "@rdfjs/types";
import type { ShaclConstraint } from "./constraint";
import type { ShaclPath } from "./path";

/**
 * Semantic representation of a SHACL property shape.
 */
export class ShaclPropertyShape {
  constructor(
    public readonly id: Term,
    public readonly path: ShaclPath,
    public readonly constraints: ShaclConstraint[] = []
  ) {}
}