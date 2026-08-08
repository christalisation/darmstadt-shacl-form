import type { Quad, Term } from "@rdfjs/types";
import { DataFactory } from "n3";

import type { ShaclPath } from "../shacl/path";
import { pathToString } from "../shacl/path";

/**
 * Writes RDF values through a selected SHACL path.
 *
 * Only direct predicate paths are unambiguous by default. Complex path
 * writing must be driven by explicit form/runtime policy rather than guessed.
 */
export class RdfPathWriter {
  write(
    subject: Term,
    path: ShaclPath,
    value: Term
  ): Quad[] {
    if (path.kind === "predicate") {
      return [
        DataFactory.quad(
          subject as any,
          path.predicate,
          value as any
        ) as unknown as Quad
      ];
    }

    throw new Error(
      `Writing through SHACL path "${pathToString(path)}" requires an explicit write policy.`
    );
  }
}
