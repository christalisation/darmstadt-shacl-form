import type { Term } from "@rdfjs/types";

import type { FormTemplateNode } from "../form-template/form-template-node";
import type { FormTemplateRegistry } from "../form-template/form-template-registry";
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
    private readonly templates: FormTemplateRegistry
  ) {}

  load(template: FormTemplateNode, subject: Term): FormInstanceGraph {
    const graph = new FormInstanceGraph();
    this.populate(graph, template, subject, true);
    return graph;
  }

  populate(
    graph: FormInstanceGraph,
    template: FormTemplateNode,
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

      if (property.template.valueType.kind === "nestedNode") {
        const nestedTemplate = this.templates.get(
          property.template.valueType.shape
        );

        for (const term of values) {
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
