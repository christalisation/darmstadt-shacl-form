import type { Term } from "@rdfjs/types";

import type { FormShapeNode } from "../form-shape/form-shape-node";
import type { FormShapeRegistry } from "../form-shape/form-shape-registry";
import { FormInstanceGraph } from "../form-instance/form-instance-graph";
import type { FormInstanceNode } from "../form-instance/form-instance-node";
import { RdfPathEvaluator } from "./rdf-path-evaluator";

function termKey(term: Term): string {
  return `${term.termType}:${term.value}`;
}

/**
 * Loads existing RDF into an existing runtime graph.
 * Nested sh:node values reuse FormInstanceNode objects when needed.
 */
export class FormRdfLoader {
  constructor(
    private readonly paths: RdfPathEvaluator,
    private readonly formShapes: FormShapeRegistry
  ) {}

  load(template: FormShapeNode, subject: Term): FormInstanceGraph {
    const graph = new FormInstanceGraph();
    this.populate(graph, template, subject, true);
    return graph;
  }

  populate(
    graph: FormInstanceGraph,
    template: FormShapeNode,
    subject: Term,
    root = false,
    populated = new Set<string>()
  ): FormInstanceNode {
    const node = graph.createNode(subject, template, root);

    const key = `${termKey(template.sourceShape)}@${termKey(subject)}`;
    if (populated.has(key)) return node;
    populated.add(key);

    for (const property of node.properties) {
      if (property.values.length) continue;

      const values = this.paths.evaluate(subject, property.template.path);

      if (
        property.template.valueType.kind === "nestedNode" ||
        property.template.valueType.kind === "nestedNodeChoice"
      ) {
        const nestedTemplates =
          property.template.valueType.kind === "nestedNode"
            ? [
                this.formShapes.get(
                  property.template.valueType.shape
                )
              ].filter(template => template !== undefined)
            : property.template.valueType.choices
                .map(choice => this.formShapes.get(choice.shape))
                .filter(template => template !== undefined);

        for (const term of values) {
          const nestedTemplate = nestedTemplates[0];

          if (
            nestedTemplate &&
            (term.termType === "NamedNode" || term.termType === "BlankNode")
          ) {
            const nestedNode = this.populate(
              graph,
              nestedTemplate,
              term,
              false,
              populated
            );

            property.addValue({
              kind: "node",
              node: nestedNode
            });
          } else {
            property.addValue({
              kind: "term",
              term
            });
          }
        }

        continue;
      }

      for (const term of values) {
        property.addValue({
          kind: "term",
          term
        });
      }
    }

    return node;
  }
}
