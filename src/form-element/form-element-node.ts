import type { Term } from "@rdfjs/types";

import type { FormInstanceNode } from "../form-instance/form-instance-node";
import type { FormElementContext } from "./form-element-context";
import { createFormElementGroup } from "./form-element-group";
import { FormElementProperty } from "./form-element-property";

export interface FormElementNodeBinding {
  node: FormInstanceNode;
  context: FormElementContext;
  renderStack: Term[];
  root?: boolean;
}

/**
 * DOM representation of one runtime node.
 *
 * It no longer parses SHACL or serializes RDF. Those responsibilities lived
 * in the old ShaclNode and are now delegated to lower layers.
 */
export class FormElementNode extends HTMLElement {
  private binding?: FormElementNodeBinding;

  bind(binding: FormElementNodeBinding): void {
    this.binding = binding;
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  private render(): void {
    if (!this.binding) return;

    const {
      node,
      context,
      renderStack,
      root
    } = this.binding;

    this.replaceChildren();
    this.dataset.nodeId = node.subject.value;

    if (context.showNodeIds) {
      const id = document.createElement("div");
      id.classList.add("node-id-display");
      id.innerText = `id: ${node.subject.value}`;
      this.appendChild(id);
    }

    if (root) {
      const header = document.createElement("h1");
      header.innerText = node.template.label;
      this.appendChild(header);
    }

    const groups = new Map<string, HTMLElement>();

    for (const property of node.properties) {
      const propertyElement =
        new FormElementProperty();

      propertyElement.bind({
        property,
        owner: node,
        context,
        renderStack
      });

      const group = property.template.group;

      if (!group) {
        this.appendChild(propertyElement);
        continue;
      }

      const key =
        `${group.termType}:${group.value}`;

      let groupElement = groups.get(key);

      if (!groupElement) {
        groupElement =
          createFormElementGroup(
            group,
            context
          );

        groups.set(key, groupElement);
        this.appendChild(groupElement);
      }

      groupElement.appendChild(
        propertyElement
      );
    }
  }
}

if (!customElements.get("shacl-node")) {
  customElements.define(
    "shacl-node",
    FormElementNode
  );
}
