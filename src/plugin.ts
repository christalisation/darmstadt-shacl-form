import type { Term } from "@rdfjs/types";

import type { FormTemplateProperty } from "./form-template/form-template-property";
import { getPredicatePath } from "./shacl/path";
import type {
  FormWidgetBinding,
  FormWidgetFactory
} from "./form-element/form-widget-registry";

const plugins: FormPlugin[] = [];

export interface FormPluginOptions {
  predicate?: string;
  datatype?: string;
}

/**
 * Extension point corresponding to the original Plugin concept, now depending
 * on FormTemplateProperty instead of the old mixed ShaclPropertyTemplate.
 */
export abstract class FormPlugin implements FormWidgetFactory {
  readonly predicate?: string;
  readonly datatype?: string;
  readonly stylesheet?: CSSStyleSheet;

  constructor(options: FormPluginOptions, css?: string) {
    this.predicate = options.predicate;
    this.datatype = options.datatype;

    if (css) {
      const stylesheet = new CSSStyleSheet();
      stylesheet.replaceSync(css);
      this.stylesheet = stylesheet;
    }
  }

  supports(template: FormTemplateProperty): boolean {
    const predicate = getPredicatePath(template.path)?.value;

    const datatype =
      template.valueType.kind === "literal"
        ? template.valueType.datatype?.value
        : undefined;

    if (this.predicate && this.datatype) {
      return (
        predicate === this.predicate &&
        datatype === this.datatype
      );
    }

    if (this.predicate) {
      return predicate === this.predicate;
    }

    if (this.datatype) {
      return datatype === this.datatype;
    }

    return false;
  }

  abstract createEditor(
    template: FormTemplateProperty,
    value: Term | undefined,
    onChange: (value: Term | undefined) => void
  ): FormWidgetBinding;
}

export function registerPlugin(plugin: FormPlugin): void {
  if (!plugin.predicate && !plugin.datatype) {
    console.warn(
      "Plugin ignored: it defines neither predicate nor datatype.",
      plugin
    );
    return;
  }

  plugins.push(plugin);
}

export function listPlugins(): readonly FormPlugin[] {
  return plugins;
}
