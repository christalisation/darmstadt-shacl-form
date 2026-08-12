import type { Term } from "@rdfjs/types";

import type { FormShapeNode } from "../form-shape/form-shape-node";
import type { FormShapeProperty } from "../form-shape/form-shape-property";
import type { FormInstanceGraph } from "../form-instance/form-instance-graph";
import type { FormReferenceOption } from "../rdf-binding/form-reference-option";
import type { FormWidgetRegistry } from "./form-widget-registry";

export type { FormReferenceOption } from "../rdf-binding/form-reference-option";

export interface FormElementContext {
  graph: FormInstanceGraph;
  widgets: FormWidgetRegistry;

  editable?: boolean;
  collapse?: "open" | "closed" | false;
  showNodeIds?: boolean;

  resolveNodeTemplate(shape: Term): FormShapeNode | undefined;

  createNodeSubject(
    property: FormShapeProperty,
    nestedTemplate: FormShapeNode
  ): Term;

  labelForTerm?(term: Term): string | undefined;

  findReferenceOptions?(
    property: FormShapeProperty
  ): Promise<FormReferenceOption[]> | FormReferenceOption[];

  onChange?(): void;
}
