import type { Term } from "@rdfjs/types";
import { DataFactory } from "n3";

import type { FormInstanceNode } from "../form-instance/form-instance-node";
import type { FormInstanceProperty } from "../form-instance/form-instance-property";
import { getAlternativePredicatePaths } from "../shacl/path";
import type {
  FormElementContext,
  FormReferenceOption
} from "./form-element-context";
import { FormElementValue } from "./form-element-value";

export interface FormElementPropertyBinding {
  property: FormInstanceProperty;
  owner: FormInstanceNode;
  context: FormElementContext;
  renderStack: Term[];
}

/**
 * DOM component for one runtime property.
 *
 * RDF loading, serialization and SHACL semantics stay outside this class.
 */
export class FormElementProperty extends HTMLElement {
  private binding?: FormElementPropertyBinding;

  bind(binding: FormElementPropertyBinding): void {
    this.binding = binding;
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  refreshReusableOptions(): void {
    this.render();
  }

  private render(): void {
    if (!this.binding) return;

    const { property } = this.binding;
    const template = property.template;

    this.replaceChildren();
    this.classList.toggle("may-add", property.canAdd);
    this.classList.toggle(
      "may-remove",
      property.values.length > template.cardinality.min
    );

    this.style.order =
      template.order !== undefined
        ? String(template.order)
        : "";

    const content = this.createContentContainer();

    const label = document.createElement("label");
    label.innerText = template.label;

    if (template.description) {
      label.title = template.description;
    }

    if (template.required) {
      label.classList.add("required");
    }

    const heading = document.createElement("div");
    heading.classList.add("property-heading");
    heading.appendChild(label);

    if (template.description) {
      const description = document.createElement("div");
      description.classList.add("property-description");
      description.innerText = template.description;
      heading.appendChild(description);
    }

    content.appendChild(heading);

    property.values.forEach((_, index) => {
      const valueElement = new FormElementValue();

      valueElement.bind({
        property,
        index,
        context: this.binding!.context,
        renderStack: this.binding!.renderStack
      });

      content.appendChild(valueElement);
    });

    if (
      property.values.length === 0 &&
      (
        !this.isNestedFormValue() ||
        this.shouldRenderNestedAsResource()
      ) &&
      this.binding.context.editable !== false
    ) {
      this.appendDraftEditor(content);
    }

    if (
      this.binding.context.editable !== false &&
      property.canAdd
    ) {
      content.appendChild(this.createAddControl());
    }

    if (content !== this) {
      this.appendChild(content);
    }

    this.renderPropertyValidation(content);
  }

  private createContentContainer(): HTMLElement {
    if (!this.binding) return this;

    const template = this.binding.property.template;

    if (
      template.valueType.kind === "nestedNode" &&
      this.binding.context.collapse !== false &&
      this.binding.context.collapse !== undefined &&
      template.repeatable
    ) {
      const details = document.createElement("details");
      details.classList.add(
        "collapsible",
        "mb-3",
        "card",
        "p-3"
      );

      details.open =
        this.binding.context.collapse === "open";

      return details;
    }

    return this;
  }

  private appendDraftEditor(container: HTMLElement): void {
    if (!this.binding) return;

    const { property, context } = this.binding;

    const wrapper = document.createElement("div");
    wrapper.classList.add(
      "property-instance",
      "draft"
    );

    const alternativePaths =
      getAlternativePredicatePaths(property.template.path);

    let selectedPath =
      alternativePaths?.length === 1
        ? {
            kind: "predicate" as const,
            predicate: alternativePaths[0]
          }
        : undefined;

    if (alternativePaths && alternativePaths.length > 1) {
      const select = document.createElement("select");
      select.classList.add(
        "editor",
        "alternative-path-selector"
      );

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.innerText = "Select path";
      select.appendChild(placeholder);

      alternativePaths.forEach((predicate, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.innerText =
          context.labelForTerm?.(predicate) ??
          predicate.value;
        select.appendChild(option);
      });

      select.addEventListener("change", () => {
        selectedPath = select.value
          ? {
              kind: "predicate",
              predicate: alternativePaths[Number(select.value)]
            }
          : undefined;
      });

      wrapper.appendChild(select);
    }

    const commit = (term: Term | undefined): void => {
      if (!term) return;

      property.addValue({
        kind: "term",
        term,
        path: selectedPath
      });

      context.onChange?.();
      this.render();

      this.dispatchEvent(
        new Event("change", {
          bubbles: true,
          cancelable: true
        })
      );
    };

    if (this.shouldRenderNestedAsResource()) {
      this.appendResourceReferenceEditor(wrapper, commit);
      container.appendChild(wrapper);
      return;
    }

    /*
     * Preserve the old sh:class/reference-data behavior. Known resources are
     * offered as choices, while the regular widget remains available for a
     * manually entered IRI.
     */
    if (
      property.template.valueType.kind === "resource" &&
      context.findReferenceOptions
    ) {
      const referenceSelect = document.createElement("select");
      referenceSelect.classList.add(
        "editor",
        "reference-selector"
      );

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.innerText = "Select existing resource";
      referenceSelect.appendChild(placeholder);

      Promise.resolve(
        context.findReferenceOptions(property.template)
      ).then(options => {
        this.appendReferenceOptions(referenceSelect, options);
      });

      referenceSelect.addEventListener("change", () => {
        const encoded =
          referenceSelect.selectedOptions[0]?.dataset.term;

        if (encoded) {
          commit(this.decodeTerm(encoded));
        }
      });

      wrapper.appendChild(referenceSelect);
    }

    const editor = context.widgets.createEditor(
      property.template,
      undefined,
      commit,
      {
        labelForTerm: context.labelForTerm
      }
    );

    wrapper.appendChild(editor.element);
    container.appendChild(wrapper);
  }

  private createAddControl(): HTMLElement {
    if (!this.binding) {
      return document.createElement("span");
    }

    const { property, context } = this.binding;

    if (this.isNestedFormValue()) {
      if (!this.shouldRenderNestedAsResource()) {
        return this.createNestedAddControl();
      }
    }

    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("add-button");
    button.innerText = `+ ${property.template.label}`;
    button.title = `Add ${property.template.label}`;

    button.addEventListener("click", () => {
      const container =
        this.querySelector(":scope > details.collapsible") ??
        this;

      this.appendDraftEditor(container as HTMLElement);
      context.onChange?.();
    });

    return button;
  }

  private shouldRenderNestedAsResource(): boolean {
    if (!this.binding) return false;

    const { property, context } = this.binding;
    const valueType = property.template.valueType;

    if (
      valueType.kind !== "nestedNode" &&
      valueType.kind !== "nestedNodeChoice"
    ) {
      return false;
    }

    const nestedTemplates =
      this.getNestedShapeChoices()
        .map(choice => context.resolveNodeTemplate(choice.shape))
        .filter(template => template !== undefined);

    return Boolean(
      nestedTemplates.length > 0 &&
      nestedTemplates.every(template => template.properties.length === 0)
    );
  }

  private appendResourceReferenceEditor(
    wrapper: HTMLElement,
    commit: (term: Term | undefined) => void
  ): void {
    if (!this.binding) return;

    const input = document.createElement("input");
    // input.type = "url";
    input.type = "text"; // to allow non-URL IRIs
    input.classList.add("editor");
    input.required = this.binding.property.template.required;
    input.placeholder = "https://example.org/resource";

    input.addEventListener("change", () => {
      if (!input.value) {
        commit(undefined);
        return;
      }

      if (!input.checkValidity()) {
        input.reportValidity();
        return;
      }

      commit(DataFactory.namedNode(input.value));
    });

    wrapper.appendChild(input);
  }

  private createNestedAddControl(): HTMLElement {
    if (!this.binding) {
      return document.createElement("span");
    }

    const {
      property,
      context,
      renderStack
    } = this.binding;

    const valueType = property.template.valueType;

    if (
      valueType.kind !== "nestedNode" &&
      valueType.kind !== "nestedNodeChoice"
    ) {
      return document.createElement("span");
    }

    const choices = this.getNestedShapeChoices();
    const firstChoice = choices[0];
    const nestedTemplate =
      valueType.kind === "nestedNode" && firstChoice
        ? context.resolveNodeTemplate(firstChoice.shape)
        : undefined;

    const select = document.createElement("select");
    select.classList.add("add-button");

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.innerText = `+ ${property.template.label}`;
    select.appendChild(placeholder);

    if (valueType.kind === "nestedNode") {
      const createNew = document.createElement("option");
      createNew.value = "new";
      createNew.innerText =
        `Create new ${property.template.label}`;
      select.appendChild(createNew);
    } else {
      choices.forEach((choice, index) => {
        const option = document.createElement("option");
        option.value = `new:${index}`;
        option.innerText =
          `Create ${choice.label ?? property.template.label}`;
        select.appendChild(option);
      });
    }

    if (nestedTemplate) {
      for (
        const node of
        context.graph.getReusableNodes(
          nestedTemplate,
          renderStack
        )
      ) {
        const option = document.createElement("option");
        option.value =
          `reuse:${node.subject.termType}:${node.subject.value}`;
        option.innerText =
          `Reuse: ${
            context.labelForTerm?.(node.subject) ??
            node.subject.value
          }`;
        select.appendChild(option);
      }
    }

    if (context.findReferenceOptions) {
      Promise.resolve(
        context.findReferenceOptions(property.template)
      ).then(options => {
        if (!options.length) return;

        const group = document.createElement("optgroup");
        group.label = "Link existing";
        this.appendReferenceOptions(group, options, "external:");
        select.appendChild(group);
      });
    }

    select.addEventListener("change", () => {
      if (!select.value) return;

      if (
        select.value === "new" ||
        select.value.startsWith("new:")
      ) {
        const choice =
          select.value === "new"
            ? firstChoice
            : choices[Number(select.value.slice("new:".length))];

        const selectedTemplate = choice
          ? context.resolveNodeTemplate(choice.shape)
          : nestedTemplate;

        if (!selectedTemplate) {
          console.warn(
            "Nested form shape not found for",
            choice?.shape
          );
          select.value = "";
          return;
        }

        const subject =
          context.createNodeSubject(
            property.template,
            selectedTemplate
          );

        const node =
          context.graph.createNode(
            subject,
            selectedTemplate
          );

        property.addValue({
          kind: "node",
          node
        });
      } else if (select.value.startsWith("reuse:")) {
        const serialized = select.value.slice("reuse:".length);
        const separator = serialized.indexOf(":");
        const termType = serialized.slice(0, separator);
        const value = serialized.slice(separator + 1);

        const reusable = context.graph
          .allNodes()
          .find(
            node =>
              node.subject.termType === termType &&
              node.subject.value === value
          );

        if (reusable) {
          property.addValue({
            kind: "node",
            node: reusable
          });
        }
      } else if (select.value.startsWith("external:")) {
        property.addValue({
          kind: "term",
          term: this.decodeTerm(
            select.value.slice("external:".length)
          )
        });
      }

      select.value = "";
      context.onChange?.();
      this.render();

      this.dispatchEvent(
        new Event("change", {
          bubbles: true,
          cancelable: true
        })
      );
    });

    return select;
  }

  private isNestedFormValue(): boolean {
    const valueType = this.binding?.property.template.valueType;

    return (
      valueType?.kind === "nestedNode" ||
      valueType?.kind === "nestedNodeChoice"
    );
  }

  private getNestedShapeChoices(): {
    shape: Term;
    label?: string;
  }[] {
    const valueType = this.binding?.property.template.valueType;

    if (!valueType) return [];

    if (valueType.kind === "nestedNode") {
      return [{ shape: valueType.shape }];
    }

    if (valueType.kind === "nestedNodeChoice") {
      return valueType.choices;
    }

    return [];
  }

  private appendReferenceOptions(
    parent: HTMLSelectElement | HTMLOptGroupElement,
    options: FormReferenceOption[],
    valuePrefix = "",
    depth = 0
  ): void {
    for (const option of options) {
      const element = document.createElement("option");
      const encoded = this.encodeTerm(option.value);

      element.value = `${valuePrefix}${encoded}`;
      element.dataset.term = encoded;
      element.innerText =
        `${"— ".repeat(depth)}${option.label}`;
      parent.appendChild(element);

      if (option.children?.length) {
        this.appendReferenceOptions(
          parent,
          option.children,
          valuePrefix,
          depth + 1
        );
      }
    }
  }

  private encodeTerm(term: Term): string {
    return encodeURIComponent(
      JSON.stringify({
        termType: term.termType,
        value: term.value
      })
    );
  }

  private decodeTerm(encoded: string): Term {
    const parsed = JSON.parse(decodeURIComponent(encoded));

    return parsed.termType === "BlankNode"
      ? DataFactory.blankNode(parsed.value)
      : DataFactory.namedNode(parsed.value);
  }

  private renderPropertyValidation(
    container: HTMLElement
  ): void {
    if (!this.binding) return;

    const result = this.binding.property.validate();

    this.classList.toggle(
      "invalid",
      !result.valid
    );

    for (
      const error of
      result.errors.filter(
        item => item.valueIndex === undefined
      )
    ) {
      const element = document.createElement("span");
      element.classList.add("validation-error");
      element.innerText = error.message;
      container.appendChild(element);
    }
  }
}

if (!customElements.get("shacl-property")) {
  customElements.define(
    "shacl-property",
    FormElementProperty
  );
}
