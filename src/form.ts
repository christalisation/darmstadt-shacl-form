import { DataFactory, Store } from "n3";

import {
  FormConfig,
  type ClassInstanceProvider
} from "./config";

import {
  type RdfPrefixes
} from "./rdf";

import {
  FormShapeRegistry,
  type FormShapeNode,
  type FormShapeProperty
} from "./form-shape";

import { FormInstanceGraph } from "./form-instance";

import {
  FormElementGraph,
  FormValidationPresenter,
  FormWidgetRegistry,
  type FormElementContext
} from "./form-element";

import {
  FormReferenceResolver,
  FormRdfSerializer,
  RdfFormatSerializer,
  RdfPathWriter,
  ShaclDataValidator,
  type ShaclDataValidationResult
} from "./rdf-binding";

import { FormPipeline } from "./form-pipeline";

import {
  listPlugins,
  registerPlugin as registerGlobalPlugin,
  type FormPlugin
} from "./plugin";

import { SH } from "./shacl/vocabulary";

/**
 * Public <shacl-form> façade.
 *
 * Loading, parsing, validation and model construction live in FormPipeline.
 * This element owns DOM lifecycle, public events and compatibility APIs.
 */
export class ShaclForm extends HTMLElement {
  static get observedAttributes(): string[] {
    return [...FormConfig.observedAttributes];
  }

  readonly config = new FormConfig();

  private readonly formElement = document.createElement("form");
  private readonly graphElement = new FormElementGraph();

  private widgets = new FormWidgetRegistry();
  private formShapes = new FormShapeRegistry();

  private runtime?: FormInstanceGraph;
  private shapes?: Store;
  private data?: Store;
  private reference?: Store;
  private prefixes: RdfPrefixes = {};

  private readonly rdfSerializer = new FormRdfSerializer(
    new RdfPathWriter()
  );

  private readonly formatSerializer = new RdfFormatSerializer();

  private validationPresenter?: FormValidationPresenter;
  private initializationId = 0;

  constructor() {
    super();

    this.formElement.appendChild(this.graphElement);

    this.formElement.addEventListener("submit", event => {
      event.preventDefault();
      void this.submit();
    });

    this.graphElement.addEventListener("form-change", event => {
      this.dispatchEvent(
        new CustomEvent("change", {
          bubbles: true,
          composed: true,
          detail: (event as CustomEvent).detail
        })
      );
    });
  }

  connectedCallback(): void {
    if (!this.contains(this.formElement)) {
      this.appendChild(this.formElement);
    }

    void this.initialize();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) {
      void this.initialize();
    }
  }

  async initialize(): Promise<void> {
    const runId = ++this.initializationId;

    this.config.updateFromElement(this);

    this.setAttribute("loading", "");
    this.formElement.replaceChildren(
      document.createTextNode(this.config.loading)
    );

    try {
      const built = await new FormPipeline(this.config).build();

      if (runId !== this.initializationId) return;

      this.shapes = built.shapes;
      this.data = built.data;
      this.reference = built.reference;
      this.prefixes = built.prefixes;
      this.formShapes = built.formShapes;
      this.runtime = built.runtime;

      this.widgets = new FormWidgetRegistry();
      for (const plugin of listPlugins()) {
        this.widgets.register(plugin);
      }

      this.formElement.replaceChildren();

      this.graphElement.bind(
        built.runtime,
        this.createElementContext()
      );

      this.formElement.appendChild(this.graphElement);

      this.validationPresenter =
        new FormValidationPresenter(this.graphElement);

      this.adoptPluginStyles();
      this.appendSubmitButton();
    } catch (error) {
      console.error(error);

      const display = document.createElement("div");
      display.classList.add("form-error");
      display.innerText =
        error instanceof Error ? error.message : String(error);

      this.formElement.replaceChildren(display);
    } finally {
      if (runId === this.initializationId) {
        this.removeAttribute("loading");
      }
    }
  }

  /**
   * Compatibility API from the original component.
   */
  toRDF(): Store {
    const store = new Store();

    if (this.runtime) {
      store.addQuads(
        this.rdfSerializer.serialize(this.runtime) as any
      );
    }

    return store;
  }

  /**
   * Turtle by default; JSON-LD remains supported as in the original fork.
   */
  serialize(format = "text/turtle"): string {
    const quads = this.toRDF().getQuads(
      null,
      null,
      null,
      null
    );

    return this.formatSerializer.serialize(
      quads,
      format,
      this.prefixes
    );
  }

  /**
   * Authoritative SHACL validation.
   *
   * Validation uses a copy of the shapes graph with temporary sh:targetNode
   * statements for runtime roots, preserving the old behavior for shapes that
   * do not declare their own targets.
   */
  async validate(): Promise<ShaclDataValidationResult> {
    if (!this.runtime || !this.shapes) {
      return {
        conforms: true,
        violations: []
      };
    }

    const report =
      await new ShaclDataValidator(
        this.buildValidationShapes()
      ).validate(this.toRDF());

    this.validationPresenter?.present(report);

    return report;
  }

  registerPlugin(plugin: FormPlugin): void {
    registerGlobalPlugin(plugin);
    void this.initialize();
  }

  /**
   * Compatibility API preserved from the fork.
   */
  setClassInstanceProvider(
    provider: ClassInstanceProvider
  ): void {
    this.config.classInstanceProvider = provider;
    void this.initialize();
  }

  private async submit(): Promise<void> {
    if (
      this.config.editMode &&
      !this.formElement.reportValidity()
    ) {
      return;
    }

    const report = await this.validate();

    if (!report.conforms) {
      this.validationPresenter?.focusFirstInvalid();

      this.dispatchEvent(
        new CustomEvent("validation-failed", {
          bubbles: true,
          composed: true,
          detail: report
        })
      );

      return;
    }

    this.dispatchEvent(
      new CustomEvent("submit", {
        bubbles: true,
        composed: true,
        detail: {
          report,
          rdf: this.serialize()
        }
      })
    );
  }

  private createElementContext(): FormElementContext {
    const references = new FormReferenceResolver(
      this.shapes!,
      this.data!,
      this.reference!,
      this.config.languages,
      this.formShapes
    );

    return {
      graph: this.runtime!,
      widgets: this.widgets,

      editable: this.config.editMode,
      collapse: this.config.collapse,
      showNodeIds: this.config.showNodeIds,

      resolveNodeTemplate: shape =>
        this.formShapes.get(shape),

      createNodeSubject: (
        _property: FormShapeProperty,
        _formShape: FormShapeNode
      ) => {
        if (this.config.valuesNamespace) {
          return DataFactory.namedNode(
            this.config.valuesNamespace +
            this.randomId()
          );
        }

        return DataFactory.blankNode(
          this.randomId()
        );
      },

      labelForTerm: term =>
        references.label(term),

      findReferenceOptions: property =>
        references.findOptions(property),

      onChange: () => {
        this.validationPresenter?.clear();
      }
    };
  }

  private buildValidationShapes(): Store {
    const validationShapes = new Store(
      this.shapes!.getQuads(
        null,
        null,
        null,
        null
      )
    );

    if (!this.runtime) return validationShapes;

    for (const root of this.runtime.roots) {
      validationShapes.addQuad(
        root.template.sourceShape as any,
        SH.targetNode,
        root.subject as any
      );
    }

    return validationShapes;
  }

  private adoptPluginStyles(): void {
    const pluginStyles = listPlugins()
      .map(plugin => plugin.stylesheet)
      .filter(
        (stylesheet): stylesheet is CSSStyleSheet =>
          stylesheet !== undefined
      );

    if (pluginStyles.length) {
      document.adoptedStyleSheets = [
        ...document.adoptedStyleSheets,
        ...pluginStyles
      ];
    }
  }

  private appendSubmitButton(): void {
    if (!this.config.editMode || !this.config.submitButton) {
      return;
    }

    const button = document.createElement("button");
    button.type = "submit";
    button.innerText = this.config.submitButton;

    this.formElement.appendChild(button);
  }

  private randomId(suffix?: number): string {
    const id =
      typeof crypto !== "undefined" &&
      "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);

    return suffix === undefined
      ? id
      : `${id}-${suffix}`;
  }
}
