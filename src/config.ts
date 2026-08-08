export type FormCollapseMode = "open" | "closed" | false;

export type ClassInstanceProvider = (
  classIri: string
) => string | Promise<string>;

/**
 * User-facing configuration for <shacl-form>.
 *
 * RDF stores, parsers, runtime nodes and DOM state deliberately do not live
 * here. This class only represents configuration supplied by the host page.
 */
export class FormConfig {
  static readonly observedAttributes = [
    "data-shapes",
    "data-shapes-url",
    "data-values",
    "data-values-url",
    "data-shape-subject",
    "data-values-subject",
    "data-values-namespace",
    "data-submit-button",
    "data-collapse",
    "data-view",
    "data-languages",
    "data-loading",
    "data-skip-shape-validation",
    "data-ignore-owl-imports",
    "data-proxy",
    "data-show-node-ids"
  ];

  shapes?: string;
  shapesUrl?: string;
  values?: string;
  valuesUrl?: string;

  shapeSubject?: string;
  valuesSubject?: string;
  valuesNamespace?: string;

  submitButton?: string;
  collapse: FormCollapseMode = false;
  viewMode = false;

  languages: string[] = [];
  loading = "Loading...";

  skipShapeValidation = false;
  ignoreOwlImports = false;
  proxy?: string;
  showNodeIds = false;

  classInstanceProvider?: ClassInstanceProvider;

  get editMode(): boolean {
    return !this.viewMode;
  }

  updateFromElement(element: HTMLElement): void {
    this.shapes = this.value(element, "data-shapes");
    this.shapesUrl = this.value(element, "data-shapes-url");
    this.values = this.value(element, "data-values");
    this.valuesUrl = this.value(element, "data-values-url");
    this.shapeSubject = this.value(element, "data-shape-subject");
    this.valuesSubject = this.value(element, "data-values-subject");
    this.valuesNamespace = this.value(element, "data-values-namespace");
    this.proxy = this.value(element, "data-proxy");

    const submit = element.getAttribute("data-submit-button");
    this.submitButton =
      submit === null ? undefined : (submit || "Submit");

    const collapse = element.getAttribute("data-collapse");
    this.collapse =
      collapse === null
        ? false
        : collapse === "open"
          ? "open"
          : "closed";

    this.viewMode = element.hasAttribute("data-view");
    this.skipShapeValidation =
      element.hasAttribute("data-skip-shape-validation");
    this.ignoreOwlImports =
      element.hasAttribute("data-ignore-owl-imports");
    this.showNodeIds =
      element.hasAttribute("data-show-node-ids");
    this.loading =
      this.value(element, "data-loading") ?? "Loading...";

    const languages = this.value(element, "data-languages");
    this.languages = languages
      ? languages.split(",").map(x => x.trim()).filter(Boolean)
      : (typeof navigator !== "undefined" ? [...navigator.languages] : []);
  }

  private value(element: HTMLElement, name: string): string | undefined {
    const value = element.getAttribute(name);
    return value === null || value === "" ? undefined : value;
  }
}
