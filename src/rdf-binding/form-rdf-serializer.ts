import type { Quad, Term } from "@rdfjs/types";

import type { FormInstanceGraph } from "../form-instance/form-instance-graph";
import type { FormInstanceValue } from "../form-instance/form-instance-value";
import { RdfPathWriter } from "./rdf-path-writer";

/**
 * Serializes the runtime form graph into RDF quads.
 */
export class FormRdfSerializer {
  constructor(
    private readonly pathWriter: RdfPathWriter
  ) {}

  serialize(graph: FormInstanceGraph): Quad[] {
    const quads: Quad[] = [];

    for (const node of graph.allNodes()) {
      for (const property of node.properties) {
        for (const value of property.values) {
          const path =
            value.path ??
            property.template.path;

          quads.push(
            ...this.pathWriter.write(
              node.subject,
              path,
              this.valueTerm(value)
            )
          );
        }
      }
    }

    return quads;
  }

  private valueTerm(
    value: FormInstanceValue
  ): Term {
    return value.kind === "term"
      ? value.term
      : value.node.subject;
  }
}
