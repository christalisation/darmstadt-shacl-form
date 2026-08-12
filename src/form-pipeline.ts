import type { Term } from "@rdfjs/types";
import { DataFactory, Store } from "n3";

import type { FormConfig } from "./config";
import { FormInstanceGraph } from "./form-instance";
import {
  FormShapeCompiler,
  FormShapeRegistry,
  type FormShapeNode
} from "./form-shape";
import { FormLoader } from "./loader";
import { RdfReader, type RdfPrefixes } from "./rdf";
import {
  ShaclParser,
  ShaclPathParser,
  ShaclShapeResolver,
  ShaclShapeValidator,
  type ShaclShapeValidationViolation
} from "./shacl";
import { SH } from "./shacl/vocabulary";
import {
  FormRdfLoader,
  RdfPathEvaluator
} from "./rdf-binding";

const RDF_TYPE = DataFactory.namedNode(
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
);

export interface FormPipelineResult {
  shapes: Store;
  data: Store;
  reference: Store;
  prefixes: RdfPrefixes;
  formShapes: FormShapeRegistry;
  runtime: FormInstanceGraph;
}

/**
 * Application orchestration for building the form runtime.
 *
 * Domain algorithms remain in their own layers. This class only wires the
 * pipeline: load RDF, validate/parse/resolve SHACL, compile form shapes,
 * then create or populate the runtime data model.
 */
export class FormPipeline {
  constructor(private readonly config: FormConfig) {}

  async build(): Promise<FormPipelineResult> {
    const loaded = await new FormLoader(this.config).load();

    if (!this.config.skipShapeValidation) {
      const validation =
        await new ShaclShapeValidator().validate(loaded.shapes);

      if (!validation.conforms) {
        throw new Error(
          "Invalid SHACL shapes graph:\n" +
          validation.violations
            .map(violation =>
              `- ${this.formatShapeViolation(violation)}`
            )
            .join("\n")
        );
      }
    }

    const rdf = new RdfReader(loaded.shapes);
    const parser = new ShaclParser(
      rdf,
      new ShaclPathParser(rdf)
    );
    const resolver = new ShaclShapeResolver(parser);
    const compiler = new FormShapeCompiler({
      languages: this.config.languages
    });
    const formShapes = new FormShapeRegistry();

    const rootShapes = this.findRootShapeIds(loaded.shapes);
    if (!rootShapes.length) {
      throw new Error("No root SHACL node shape found.");
    }

    const rootFormShapes = rootShapes.map(shape =>
      this.compileShapeTree(shape, resolver, compiler, formShapes)
    );

    const runtime = this.buildRuntime(
      rootFormShapes,
      formShapes,
      loaded.data
    );

    return {
      shapes: loaded.shapes,
      data: loaded.data,
      reference: loaded.reference,
      prefixes: loaded.prefixes,
      formShapes,
      runtime
    };
  }

  private compileShapeTree(
    shape: Term,
    resolver: ShaclShapeResolver,
    compiler: FormShapeCompiler,
    formShapes: FormShapeRegistry
  ): FormShapeNode {
    const existing = formShapes.get(shape);
    if (existing) return existing;

    const semantic = resolver.resolveNodeShape(shape);
    const formShape = compiler.compileNode(semantic);

    // Register before recursion to support cyclic shape references.
    formShapes.register(formShape);

    for (const referencedShape of resolver.getReferencedShapes(semantic)) {
      this.compileShapeTree(
        referencedShape,
        resolver,
        compiler,
        formShapes
      );
    }

    return formShape;
  }

  private buildRuntime(
    rootFormShapes: FormShapeNode[],
    formShapes: FormShapeRegistry,
    data: Store
  ): FormInstanceGraph {
    const runtime = new FormInstanceGraph();
    const dataLoader = new FormRdfLoader(
      new RdfPathEvaluator(data),
      formShapes
    );

    rootFormShapes.forEach((formShape, index) => {
      const subject = this.rootSubject(index);

      if (this.config.valuesSubject || data.size > 0) {
        dataLoader.populate(
          runtime,
          formShape,
          subject,
          true
        );
      } else {
        runtime.createNode(
          subject,
          formShape,
          true
        );
      }
    });

    return runtime;
  }

  private findRootShapeIds(shapes: Store): Term[] {
    if (this.config.shapeSubject) {
      return [
        DataFactory.namedNode(this.config.shapeSubject)
      ];
    }

    const targeted = new Map<string, Term>();

    for (const predicate of [
      SH.targetClass,
      SH.targetNode
    ]) {
      for (const subject of shapes.getSubjects(
        predicate,
        null,
        null
      )) {
        if (subject.termType !== "NamedNode") {
          continue;
        }

        targeted.set(this.termKey(subject), subject);
      }
    }

    if (targeted.size) {
      return [...targeted.values()];
    }

    return shapes
      .getSubjects(
        RDF_TYPE,
        SH.NodeShape,
        null
      )
      .filter(subject =>
        subject.termType === "NamedNode" &&
        shapes.countQuads(subject, SH.property, null, null) > 0
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

  private formatShapeViolation(
    violation: ShaclShapeValidationViolation
  ): string {
    const details = [
      violation.focusNode
        ? `focusNode: ${violation.focusNode.value}`
        : undefined,
      violation.value
        ? `value: ${violation.value.value}`
        : undefined,
      violation.sourceShape
        ? `sourceShape: ${violation.sourceShape.value}`
        : undefined,
      violation.constraintComponent
        ? `constraint: ${violation.constraintComponent.value}`
        : undefined
    ].filter(Boolean);

    return details.length
      ? `${violation.message} (${details.join(", ")})`
      : violation.message;
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
