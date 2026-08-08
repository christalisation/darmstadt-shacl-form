import type { FormInstanceGraph } from "../form-instance/form-instance-graph";
import type { FormInstanceNode } from "../form-instance/form-instance-node";
import type { FormElementContext } from "./form-element-context";
import { FormElementNode } from "./form-element-node";

/**
 * Top-level DOM component for the runtime form graph.
 *
 * This replaces the navigation/rendering part of the old ShaclForm.
 * Graph loading, RDF serialization and final SHACL validation remain external
 * services and can be orchestrated by the host component/controller.
 */
export class FormElementGraph extends HTMLElement {
  private model?: FormInstanceGraph;
  private context?: FormElementContext;
  private activeRoot?: FormInstanceNode;

  bind(
    model: FormInstanceGraph,
    context: FormElementContext
  ): void {
    this.model = model;
    this.context = context;

    const originalChange =
      context.onChange;

    context.onChange = () => {
      originalChange?.();

      const localValidation =
        model.validate();

      this.dispatchEvent(
        new CustomEvent("form-change", {
          bubbles: true,
          composed: true,
          detail: {
            valid: localValidation.valid,
            validation: localValidation
          }
        })
      );
    };

    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  showRootSelector(): void {
    this.activeRoot = undefined;
    this.render();
  }

  setActiveRoot(
    node: FormInstanceNode
  ): void {
    this.activeRoot = node;
    this.render();
  }

  private render(): void {
    if (!this.model || !this.context) {
      return;
    }

    this.replaceChildren();

    if (!this.model.roots.length) {
      return;
    }

    if (
      this.model.roots.length > 1 &&
      !this.activeRoot
    ) {
      this.appendChild(
        this.createRootSelector()
      );
      return;
    }

    const root =
      this.activeRoot ??
      this.model.roots[0];

    if (this.model.roots.length > 1) {
      const back = document.createElement("button");
      back.type = "button";
      back.classList.add(
        "root-selector-back"
      );
      back.innerText = "Select shape";

      back.addEventListener("click", () => {
        this.showRootSelector();
      });

      this.appendChild(back);
    }

    const node = new FormElementNode();
    node.bind({
      node: root,
      context: this.context,
      renderStack: [root.subject],
      root: true
    });

    this.appendChild(node);
  }

  private createRootSelector(): HTMLElement {
    const container =
      document.createElement("div");
    container.classList.add(
      "root-selector-container"
    );

    const select =
      document.createElement("select");
    select.classList.add(
      "root-selector"
    );

    const placeholder =
      document.createElement("option");
    placeholder.value = "";
    placeholder.innerText =
      "Select shape";
    select.appendChild(placeholder);

    this.model!.roots.forEach(
      (node, index) => {
        const option =
          document.createElement("option");
        option.value = String(index);
        option.innerText =
          node.template.label;
        select.appendChild(option);
      }
    );

    select.addEventListener(
      "change",
      () => {
        const index =
          Number(select.value);

        const node =
          this.model?.roots[index];

        if (node) {
          this.setActiveRoot(node);
        }
      }
    );

    container.appendChild(select);
    return container;
  }
}

if (!customElements.get("shacl-form-graph")) {
  customElements.define(
    "shacl-form-graph",
    FormElementGraph
  );
}
