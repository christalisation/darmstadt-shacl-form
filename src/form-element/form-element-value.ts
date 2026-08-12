import type { Term } from "@rdfjs/types";

import type { FormInstanceProperty } from "../form-instance/form-instance-property";
import type { FormInstanceValue } from "../form-instance/form-instance-value";
import {
  getAlternativePredicatePaths,
  type ShaclPath
} from "../shacl/path";
import type { FormElementContext } from "./form-element-context";
import { FormElementNode } from "./form-element-node";

export interface FormElementValueBinding {
  property: FormInstanceProperty;
  index: number;
  context: FormElementContext;
  renderStack: Term[];
}

/**
 * DOM representation of one runtime value occurrence.
 */
export class FormElementValue extends HTMLElement {
  private binding?: FormElementValueBinding;

  bind(binding: FormElementValueBinding): void {
    this.binding = binding;
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  private render(): void {
    if (!this.binding) return;

    const {
      property,
      index,
      context,
      renderStack
    } = this.binding;

    const value = property.values[index];
    if (!value) return;

    this.replaceChildren();
    this.classList.add("property-instance");

    const selectedPath =
      value.path ??
      this.renderPathChoice(property.template.path, value);

    if (selectedPath) {
      this.dataset.path =
        selectedPath.kind === "predicate"
          ? selectedPath.predicate.value
          : "";
    }

    if (value.kind === "node") {
      this.renderNodeValue(value, context, renderStack);
    } else if (
      (
        property.template.valueType.kind === "nestedNode" ||
        property.template.valueType.kind === "nestedNodeChoice"
      ) &&
      (value.term.termType === "NamedNode" ||
        value.term.termType === "BlankNode")
    ) {
      this.renderExternalReference(value.term, context);
    } else {
      const editor = context.widgets.createEditor(
        property.template,
        value.term,
        updated => {
          if (!updated) {
            property.removeValue(index);
          } else {
            property.setValue(index, {
              ...value,
              kind: "term",
              term: updated
            });
          }

          context.onChange?.();
          this.dispatchEvent(
            new Event("change", {
              bubbles: true,
              cancelable: true
            })
          );
        },
        {
          labelForTerm: context.labelForTerm
        }
      );

      this.appendChild(editor.element);
    }

    if (context.editable !== false) {
      this.appendRemoveButton();
    }

    this.renderValidationErrors();
  }

  private renderPathChoice(
    templatePath: ShaclPath,
    value: FormInstanceValue
  ): ShaclPath | undefined {
    if (!this.binding) return value.path;

    const alternatives =
      getAlternativePredicatePaths(templatePath);

    if (!alternatives?.length) {
      return value.path ?? templatePath;
    }

    const select = document.createElement("select");
    select.classList.add(
      "editor",
      "alternative-path-selector"
    );

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.innerText = "Select path";
    select.appendChild(placeholder);

    alternatives.forEach((predicate, index) => {
      const option = document.createElement("option");
      option.value = index.toString();
      option.innerText =
        this.binding?.context.labelForTerm?.(predicate) ??
        predicate.value;
      select.appendChild(option);

      if (
        value.path?.kind === "predicate" &&
        value.path.predicate.equals(predicate)
      ) {
        select.value = index.toString();
      }
    });

    select.addEventListener("change", () => {
      if (!this.binding || !select.value) return;

      const predicate =
        alternatives[Number(select.value)];

      const selected: ShaclPath = {
        kind: "predicate",
        predicate
      };

      const current =
        this.binding.property.values[this.binding.index];

      if (current) {
        this.binding.property.setValue(
          this.binding.index,
          {
            ...current,
            path: selected
          }
        );
      }

      this.binding.context.onChange?.();
    });

    this.appendChild(select);

    return value.path;
  }

  private renderExternalReference(
    term: Term,
    context: FormElementContext
  ): void {
    const link = document.createElement("a");
    link.classList.add("ref-link", "linked");
    link.innerText =
      context.labelForTerm?.(term) ??
      term.value;

    if (term.termType === "NamedNode") {
      link.href = term.value;
    }

    this.appendChild(link);
    this.classList.add("linked");
  }

  private renderNodeValue(
    value: Extract<FormInstanceValue, { kind: "node" }>,
    context: FormElementContext,
    renderStack: Term[]
  ): void {
    const alreadyRendered = renderStack.some(
      term => term.equals(value.node.subject)
    );

    if (alreadyRendered) {
      const link = document.createElement("a");
      link.classList.add("ref-link");
      link.innerText =
        context.labelForTerm?.(value.node.subject) ??
        value.node.subject.value;
      link.href = `#${encodeURIComponent(value.node.subject.value)}`;

      link.addEventListener("click", event => {
        event.preventDefault();

        const root =
          this.getRootNode() as Document | ShadowRoot;

        root
          .querySelector(
            `[data-node-id="${CSS.escape(value.node.subject.value)}"]`
          )
          ?.scrollIntoView();
      });

      this.appendChild(link);
      this.classList.add("linked");
      return;
    }

    const nodeElement = new FormElementNode();
    nodeElement.classList.add("editor");
    nodeElement.bind({
      node: value.node,
      context,
      renderStack: [...renderStack, value.node.subject],
      root: false
    });

    this.appendChild(nodeElement);
  }

  private appendRemoveButton(): void {
    if (!this.binding) return;

    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("remove-button", "clear");
    button.title = "Remove value";
    button.innerText = "×";

    button.addEventListener("click", () => {
      if (!this.binding) return;

      this.binding.property.removeValue(
        this.binding.index
      );

      this.binding.context.onChange?.();

      this.dispatchEvent(
        new Event("change", {
          bubbles: true,
          cancelable: true
        })
      );
    });

    this.appendChild(button);
  }

  private renderValidationErrors(): void {
    if (!this.binding) return;

    const errors =
      this.binding.property
        .validate()
        .errors
        .filter(
          error =>
            error.valueIndex === undefined ||
            error.valueIndex === this.binding?.index
        );

    this.classList.toggle(
      "invalid",
      errors.length > 0
    );

    for (const error of errors) {
      const element = document.createElement("span");
      element.classList.add("validation-error");
      element.innerText = error.message;
      this.appendChild(element);
    }
  }
}

if (!customElements.get("shacl-value")) {
  customElements.define("shacl-value", FormElementValue);
}
