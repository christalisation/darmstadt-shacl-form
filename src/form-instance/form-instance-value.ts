import type { Term } from "@rdfjs/types";

import type { ShaclPath } from "../shacl/path";
import type { FormInstanceNode } from "./form-instance-node";

/**
 * One occurrence of a runtime property value.
 *
 * `path` is per occurrence because different values of the same property may
 * choose different branches of sh:alternativePath.
 */
export type FormInstanceValue =
  | {
      kind: "term";
      term: Term;
      path?: ShaclPath;
      logicalBranch?: Term;
    }
  | {
      kind: "node";
      node: FormInstanceNode;
      path?: ShaclPath;
      logicalBranch?: Term;
    };
