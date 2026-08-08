import type { Term } from "@rdfjs/types";
import { DataFactory, Store } from "n3";

import {
  FormConfig,
  type ClassInstanceProvider
} from "./config";
import { FormLoader } from "./loader";

import {
  RdfGraphReader,
  RdfListReader,
  type RdfPrefixes
} from "./rdf";
import {
  ShaclGraphParser,
  ShaclPathParser,
  ShaclSemanticAnalyzer
} from "./shacl";

import {
  FormTemplateCompiler,
  FormTemplateRegistry,
  type FormTemplateNode,
  type FormTemplateProperty
} from "./form-template";

import { FormInstanceGraph } from "./form-instance";

import {
  FormElementGraph,
  FormValidationPresenter,
  FormWidgetRegistry,
  type FormElementContext
} from "./form-element";

import {
  FormReferenceResolver,
  FormRdfLoader,
  FormRdfSerializer,
  RdfFormatSerializer,
  RdfPathEvaluator,
  RdfPathWriter,
  ShaclDataValidator,
  type ShaclDataValidationResult
} from "./rdf-binding";

import {
  listPlugins,
  registerPlugin as registerGlobalPlugin,
  type FormPlugin
} from "./plugin";

import { SH } from "./shacl/vocabulary";

const RDF_TYPE = DataFactory.namedNode(
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
);

/**
 * Public <shacl-form> façade.
 *
 * It coordinates the six internal layers without taking over their work:
 * load -> analyze -> parse -> compile -> instantiate/load -> render.
 */
export class ShaclForm extends HTMLElement {
  static get observedAttributes(): string[] {
    return [...FormConfig.observedAttributes];
  }

  readonly config = new FormConfig();

  private readonly formElement = document.createElement("form");
  private readonly graphElement = new FormElementGraph();

  private widgets = new FormWidgetRegistry();
  private templates = new FormTemplateRegistry();

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
      const loaded = await new FormLoader(this.config).load();

      if (runId !== this.initializationId) return;

      this.shapes = loaded.shapes;
      this.data = loaded.data;
      this.reference = loaded.reference;
      this.prefixes = loaded.prefixes;

      if (!this.config.skipShapeValidation) {
        const analysis =
          await new ShaclSemanticAnalyzer().analyze(loaded.shapes);

        if (!analysis.conforms) {
          throw new Error(
            "Invalid SHACL shapes graph:\n" +
            analysis.violations
              .map(violation => `- ${violation.message}`)
              .join("\n")
          );
        }
      }

      const rdf = new RdfGraphReader(loaded.shapes);
      const lists = new RdfListReader(loaded.shapes);
      const paths = new ShaclPathParser(rdf, lists);
      const parser = new ShaclGraphParser(rdf, lists, paths);

      const compiler = new FormTemplateCompiler({
        languages: this.config.languages
      });

      this.templates = new FormTemplateRegistry();

      const rootShapes = this.findRootShapeIds(loaded.shapes);

      if (!rootShapes.length) {
        throw new Error("No root SHACL node shape found.");
      }

      const rootTemplates = rootShapes.map(shape =>
        this.compileShapeTree(shape, parser, compiler)
      );

      const runtime = new FormInstanceGraph();

      const dataLoader = new FormRdfLoader(
        new RdfPathEvaluator(loaded.data),
        this.templates
      );

      rootTemplates.forEach((template, index) => {
        const subject = this.rootSubject(index);

        if (this.config.valuesSubject || loaded.data.size > 0) {
          dataLoader.populate(
            runtime,
            template,
            subject,
            true
          );
        } else {
          runtime.createNode(
            subject,
            template,
            true
          );
        }
      });

      this.runtime = runtime;

      this.widgets = new FormWidgetRegistry();
      for (const plugin of listPlugins()) {
        this.widgets.register(plugin);
      }

      this.formElement.replaceChildren();

      this.graphElement.bind(
        runtime,
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

  private compileShapeTree(
    shape: Term,
    parser: ShaclGraphParser,
    compiler: FormTemplateCompiler
  ): FormTemplateNode {
    const existing = this.templates.get(shape);
    if (existing) return existing;

    const semantic = parser.parseNodeShape(shape);
    const template = compiler.compileNode(semantic);

    // Register before recursion to support cyclic shape references.
    this.templates.register(template);

    for (const property of semantic.properties) {
      for (const constraint of property.constraints) {
        if (constraint.kind === "node") {
          this.compileShapeTree(
            constraint.shape,
            parser,
            compiler
          );
        }

        if (
          constraint.kind === "and" ||
          constraint.kind === "or" ||
          constraint.kind === "xone"
        ) {
          for (const branch of constraint.shapes) {
            this.compileShapeTree(
              branch,
              parser,
              compiler
            );
          }
        }

        if (constraint.kind === "not") {
          this.compileShapeTree(
            constraint.shape,
            parser,
            compiler
          );
        }
      }
    }

    return template;
  }

  private findRootShapeIds(shapes: Store): Term[] {
    if (this.config.shapeSubject) {
      return [
        DataFactory.namedNode(this.config.shapeSubject)
      ];
    }

    /*
     * SHACL shapes can be implicit. Target declarations are therefore stronger
     * root evidence than requiring rdf:type sh:NodeShape.
     */
    const targeted = new Map<string, Term>();

    for (const predicate of [
      SH.targetClass,
      SH.targetNode,
      SH.targetSubjectsOf,
      SH.targetObjectsOf
    ]) {
      for (const subject of shapes.getSubjects(
        predicate,
        null,
        null
      )) {
        targeted.set(this.termKey(subject), subject);
      }
    }

    if (targeted.size) {
      return [...targeted.values()];
    }

    return shapes.getSubjects(
      RDF_TYPE,
      SH.NodeShape,
      null
    );
  }

  private rootSubject(index: number): Term {
    if (this.config.valuesSubject) {
      return DataFactory.namedNode(
        this.config.valuesSubject
      );
    }

    if (this.config.valuesNamespace) {
      return DataFactory.namedNode(
        this.config.valuesNamespace +
        this.randomId(index)
      );
    }

    return DataFactory.blankNode(
      this.randomId(index)
    );
  }

  private createElementContext(): FormElementContext {
    const references = new FormReferenceResolver(
      this.shapes!,
      this.data!,
      this.reference!,
      this.config.languages,
      this.templates
    );

    return {
      graph: this.runtime!,
      widgets: this.widgets,

      editable: this.config.editMode,
      collapse: this.config.collapse,
      showNodeIds: this.config.showNodeIds,

      resolveNodeTemplate: shape =>
        this.templates.get(shape),

      createNodeSubject: (
        _property: FormTemplateProperty,
        _template: FormTemplateNode
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

  private termKey(term: Term): string {
    return `${term.termType}:${term.value}`;
  }
}
