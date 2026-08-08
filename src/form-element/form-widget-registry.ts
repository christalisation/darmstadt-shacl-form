import type { Term } from "@rdfjs/types";
import { DataFactory } from "n3";

import type { FormTemplateProperty } from "../form-template/form-template-property";

export interface FormWidgetBinding {
  element: HTMLElement;
  focusElement?: HTMLElement;
}

export interface FormWidgetFactory {
  supports(template: FormTemplateProperty): boolean;

  createEditor(
    template: FormTemplateProperty,
    value: Term | undefined,
    onChange: (value: Term | undefined) => void
  ): FormWidgetBinding;
}

/**
 * Registry for plugins/themes/widgets.
 *
 * Custom factories are tried first; a native HTML fallback is always
 * available so the OOP layers do not depend on the old Theme class.
 */
export class FormWidgetRegistry {
  private readonly factories: FormWidgetFactory[] = [];

  register(factory: FormWidgetFactory): void {
    this.factories.unshift(factory);
  }

  createEditor(
    template: FormTemplateProperty,
    value: Term | undefined,
    onChange: (value: Term | undefined) => void
  ): FormWidgetBinding {
    const factory =
      this.factories.find(candidate => candidate.supports(template)) ??
      nativeFactory;

    return factory.createEditor(template, value, onChange);
  }
}

const nativeFactory: FormWidgetFactory = {
  supports: () => true,

  createEditor(template, value, onChange) {
    if (template.valueType.kind === "choice") {
      const select = document.createElement("select");
      select.classList.add("editor");

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.innerText = "Select value";
      select.appendChild(placeholder);

      template.valueType.values.forEach((term, index) => {
        const option = document.createElement("option");
        option.value = index.toString();
        option.innerText = term.value;
        select.appendChild(option);

        if (value?.equals(term)) {
          select.value = index.toString();
        }
      });

      select.required = template.required;

      select.addEventListener("change", () => {
        if (!select.value) {
          onChange(undefined);
          return;
        }

        onChange(
          template.valueType.kind === "choice"
            ? template.valueType.values[Number(select.value)]
            : undefined
        );
      });

      return {
        element: select,
        focusElement: select
      };
    }

    if (template.valueType.kind === "resource") {
      const input = document.createElement("input");
      input.type = "url";
      input.classList.add("editor");
      input.required = template.required;
      input.value = value?.value ?? "";

      input.addEventListener("change", () => {
        onChange(
          input.value
            ? DataFactory.namedNode(input.value)
            : undefined
        );
      });

      return {
        element: input,
        focusElement: input
      };
    }

    const datatype =
      template.valueType.kind === "literal"
        ? template.valueType.datatype
        : undefined;

    const datatypeName =
      datatype?.value.split(/[\/#]/).pop();

    if (datatypeName === "boolean") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.classList.add("editor");
      input.checked = value?.termType === "Literal" && value.value === "true";

      input.addEventListener("change", () => {
        onChange(
          DataFactory.literal(
            input.checked ? "true" : "false",
            datatype
          )
        );
      });

      return {
        element: input,
        focusElement: input
      };
    }

    const input = document.createElement("input");
    input.classList.add("editor");
    input.required = template.required;

    if (
      ["integer", "decimal", "double", "float"].includes(
        datatypeName ?? ""
      )
    ) {
      input.type = "number";
    } else if (datatypeName === "date") {
      input.type = "date";
    } else if (datatypeName === "dateTime") {
      input.type = "datetime-local";
    } else {
      input.type = "text";
    }

    input.value = value?.value ?? "";

    input.addEventListener("change", () => {
      if (!input.value) {
        onChange(undefined);
        return;
      }

      onChange(
        datatype
          ? DataFactory.literal(input.value, datatype)
          : DataFactory.literal(input.value)
      );
    });

    return {
      element: input,
      focusElement: input
    };
  }
};
