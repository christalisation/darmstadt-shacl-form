import type { Term } from "@rdfjs/types";

import type { ShaclConstraint } from "./constraint";
import type { ShaclPropertyShape } from "./property-shape";
import type { ShaclShapeMetadata } from "./shape-metadata";
import type { ShaclTarget } from "./target";

/**
 * Semantic representation of a SHACL node shape.
 */
export class ShaclNodeShape {
  constructor(
    public readonly id: Term,
    public readonly targets: ShaclTarget[] = [],
    public readonly properties: ShaclPropertyShape[] = [],
    public readonly constraints: ShaclConstraint[] = [],
    public readonly metadata: ShaclShapeMetadata = {
      names: [],
      descriptions: []
    }
  ) {}
}
