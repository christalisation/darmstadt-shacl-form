import type { Term } from "@rdfjs/types";

import type { ShaclConstraint } from "./constraint";
import type { ShaclPath } from "./path";
import type { ShaclShapeMetadata } from "./shape-metadata";

/**
 * Semantic representation of a SHACL property shape.
 */
export class ShaclPropertyShape {
  constructor(
    public readonly id: Term,
    public readonly path: ShaclPath,
    public readonly constraints: ShaclConstraint[] = [],
    public readonly metadata: ShaclShapeMetadata = {
      names: [],
      descriptions: []
    }
  ) {}
}
