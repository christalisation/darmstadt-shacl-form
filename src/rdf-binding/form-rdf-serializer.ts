import type { Quad, Term } from "@rdfjs/types";
import { DataFactory } from "n3";

import type { FormInstanceGraph } from "../form-instance/form-instance-graph";
import type { FormInstanceNode } from "../form-instance/form-instance-node";
import type { FormInstanceValue } from "../form-instance/form-instance-value";
import { RdfPathWriter } from "./rdf-path-writer";

const RDF_TYPE = DataFactory.namedNode(
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
);

/**
 * Serializes the runtime form graph into RDF quads.
 */
export class FormRdfSerializer {
  constructor(
    private readonly pathWriter: RdfPathWriter
  ) {}

  serialize(graph: FormInstanceGraph): Quad[] {
    const quads: Quad[] = [];
    const referencedNodes = this.referencedNodeKeys(graph);

    for (const node of graph.allNodes()) {
      if (!this.shouldSerializeNode(graph, node, referencedNodes)) {
        continue;
      }

      for (const targetClass of node.template.targetClasses) {
        quads.push(
          DataFactory.quad(
            node.subject as any,
            RDF_TYPE,
            targetClass
          ) as unknown as Quad
        );
      }

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

  private shouldSerializeNode(
    graph: FormInstanceGraph,
    node: FormInstanceNode,
    referencedNodes: Set<string>
  ): boolean {
    return (
      graph.isRootCommitted(node) ||
      referencedNodes.has(this.nodeKey(node.subject)) ||
      node.properties.some(property => property.values.length > 0)
    );
  }

  private referencedNodeKeys(graph: FormInstanceGraph): Set<string> {
    const keys = new Set<string>();

    for (const node of graph.allNodes()) {
      for (const property of node.properties) {
        for (const value of property.values) {
          if (value.kind === "node") {
            keys.add(this.nodeKey(value.node.subject));
          }
        }
      }
    }

    return keys;
  }

  private valueTerm(
    value: FormInstanceValue
  ): Term {
    return value.kind === "term"
      ? value.term
      : value.node.subject;
  }

  private nodeKey(term: Term): string {
    return `${term.termType}:${term.value}`;
  }
}
