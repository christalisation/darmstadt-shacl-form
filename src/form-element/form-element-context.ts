import type { Term } from "@rdfjs/types";

import type { FormTemplateNode } from "../form-template/form-template-node";
import type { FormTemplateProperty } from "../form-template/form-template-property";
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

  resolveNodeTemplate(shape: Term): FormTemplateNode | undefined;

  createNodeSubject(
    property: FormTemplateProperty,
    nestedTemplate: FormTemplateNode
  ): Term;

  labelForTerm?(term: Term): string | undefined;

  findReferenceOptions?(
    property: FormTemplateProperty
  ): Promise<FormReferenceOption[]> | FormReferenceOption[];

  onChange?(): void;
}
