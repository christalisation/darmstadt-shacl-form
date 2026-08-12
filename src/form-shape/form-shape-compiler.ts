import type { Literal } from "@rdfjs/types";

import type { ShaclConstraint } from "../shacl/constraint";
import type {
  ShaclNodeShape,
  ShaclPropertyShape,
  ShaclShapeMetadata
} from "../shacl/model";
import { pathToString } from "../shacl/path";
import type { FormShapeConstraint } from "./form-shape-constraint";
import { FormShapeNode } from "./form-shape-node";
import {
  FormShapeProperty,
  type FormShapeCardinality,
  type FormShapeNodeChoice,
  type FormShapeValueType
} from "./form-shape-property";

export interface FormShapeCompilerOptions {
  /**
   * Preferred languages in priority order, e.g. ["fr", "en"].
   */
  languages?: string[];
}

/**
 * Projects the SHACL Shape Model into the Form Shape Model.
 */
export class FormShapeCompiler {
  constructor(
    private readonly options: FormShapeCompilerOptions = {}
  ) {}

  compileNode(shape: ShaclNodeShape): FormShapeNode {
    return this.compileNodeWithProperties(
      shape,
      shape.properties
    );
  }

  compileNodeWithProperties(
    shape: ShaclNodeShape,
    properties: ShaclPropertyShape[]
  ): FormShapeNode {
    return new FormShapeNode(
      shape.id,
      this.deduplicateProperties(properties)
        .map(property => this.compileProperty(property)),
      shape.constraints,
      this.labelFromMetadata(shape.metadata) ?? shape.id.value,
      this.descriptionFromMetadata(shape.metadata),
      shape.targets
        .filter(
          target => target.kind === "class"
        )
        .map(
          target => target.class
        )
    );
  }

  compileProperty(shape: ShaclPropertyShape): FormShapeProperty {
    return new FormShapeProperty(
      shape.id,
      shape.path,
      this.compileCardinality(shape.constraints),
      this.compileValueType(shape.constraints),
      this.compileConstraints(shape.constraints),
      shape.constraints,
      this.labelFromMetadata(shape.metadata) ?? pathToString(shape.path),
      this.descriptionFromMetadata(shape.metadata),
      shape.metadata.order,
      shape.metadata.group
    );
  }

  private compileCardinality(
    constraints: ShaclConstraint[]
  ): FormShapeCardinality {
    const min =
      constraints.find(c => c.kind === "minCount")?.value ?? 0;

    const max =
      constraints.find(c => c.kind === "maxCount")?.value;

    return { min, max };
  }

  private compileValueType(
    constraints: ShaclConstraint[]
  ): FormShapeValueType {
    const node = constraints.find(c => c.kind === "node");
    if (node?.kind === "node") {
      return { kind: "nestedNode", shape: node.shape };
    }

    const nestedChoice = this.compileNestedNodeChoice(constraints);
    if (nestedChoice) {
      return nestedChoice;
    }

    const shIn = constraints.find(c => c.kind === "in");
    if (shIn?.kind === "in") {
      return { kind: "choice", values: shIn.values };
    }

    const datatype = constraints.find(c => c.kind === "datatype");
    if (datatype?.kind === "datatype") {
      return { kind: "literal", datatype: datatype.datatype };
    }

    const shClass = constraints.find(c => c.kind === "class");
    if (shClass?.kind === "class") {
      return { kind: "resource", class: shClass.class };
    }

    const nodeKind = constraints.find(c => c.kind === "nodeKind");
    if (
      nodeKind?.kind === "nodeKind" &&
      (nodeKind.nodeKind.value.endsWith("IRI") ||
        nodeKind.nodeKind.value.endsWith("BlankNodeOrIRI") ||
        nodeKind.nodeKind.value.endsWith("IRIOrLiteral"))
    ) {
      return { kind: "resource" };
    }

    return { kind: "unknown" };
  }

  private compileNestedNodeChoice(
    constraints: ShaclConstraint[]
  ): FormShapeValueType | undefined {
    const logical = constraints.find(
      constraint =>
        constraint.kind === "or" ||
        constraint.kind === "xone"
    );

    if (
      logical?.kind !== "or" &&
      logical?.kind !== "xone"
    ) {
      return undefined;
    }

    const choices = (logical.nodeChoices ?? [])
      .map(choice => ({
        shape: choice.shape,
        label: choice.label?.value
      } satisfies FormShapeNodeChoice));

    if (!choices.length) {
      return undefined;
    }

    return {
      kind: "nestedNodeChoice",
      choices,
      exclusive: logical.kind === "xone"
    };
  }

  private compileConstraints(
    constraints: ShaclConstraint[]
  ): FormShapeConstraint[] {
    const result: FormShapeConstraint[] = [];

    for (const constraint of constraints) {
      switch (constraint.kind) {
        case "datatype":
          result.push({
            kind: "datatype",
            datatype: constraint.datatype
          });
          break;

        case "nodeKind":
          result.push({
            kind: "nodeKind",
            nodeKind: constraint.nodeKind
          });
          break;

        case "minExclusive":
        case "minInclusive":
        case "maxExclusive":
        case "maxInclusive":
          this.mergeNumericRange(result, constraint);
          break;

        case "minLength":
        case "maxLength":
          this.mergeLength(result, constraint);
          break;

        case "pattern":
          result.push({
            kind: "pattern",
            pattern: constraint.pattern,
            flags: constraint.flags
          });
          break;

        case "in":
          result.push({
            kind: "choice",
            values: constraint.values
          });
          break;

        case "hasValue":
          result.push({
            kind: "hasValue",
            value: constraint.value
          });
          break;

        case "and":
        case "or":
        case "xone":
          result.push({
            kind: constraint.kind,
            shapes: constraint.shapes
          });
          break;

        case "not":
          result.push({
            kind: "not",
            shapes: [constraint.shape]
          });
          break;

        case "equals":
        case "disjoint":
        case "lessThan":
        case "lessThanOrEquals":
          result.push({
            kind: constraint.kind,
            property: constraint.property
          });
          break;

        default:
          break;
      }
    }

    return result;
  }

  private mergeNumericRange(
    result: FormShapeConstraint[],
    constraint: Extract<
      ShaclConstraint,
      {
        kind:
          | "minExclusive"
          | "minInclusive"
          | "maxExclusive"
          | "maxInclusive";
      }
    >
  ): void {
    let range = result.find(
      c => c.kind === "numericRange"
    ) as Extract<FormShapeConstraint, { kind: "numericRange" }> | undefined;

    if (!range) {
      range = { kind: "numericRange" };
      result.push(range);
    }

    range[constraint.kind] = constraint.value;
  }

  private mergeLength(
    result: FormShapeConstraint[],
    constraint: Extract<
      ShaclConstraint,
      { kind: "minLength" | "maxLength" }
    >
  ): void {
    let length = result.find(
      c => c.kind === "length"
    ) as Extract<FormShapeConstraint, { kind: "length" }> | undefined;

    if (!length) {
      length = { kind: "length" };
      result.push(length);
    }

    if (constraint.kind === "minLength") {
      length.min = constraint.value;
    } else {
      length.max = constraint.value;
    }
  }

  private labelFromMetadata(
    metadata: ShaclShapeMetadata
  ): string | undefined {
    return this.preferredLiteral(metadata.names)?.value;
  }

  private descriptionFromMetadata(
    metadata: ShaclShapeMetadata
  ): string | undefined {
    return this.preferredLiteral(metadata.descriptions)?.value;
  }

  private preferredLiteral(
    values: Literal[]
  ): Literal | undefined {
    if (!values.length) return undefined;

    for (const language of this.options.languages ?? []) {
      const match = values.find(value => value.language === language);
      if (match) return match;
    }

    return values.find(value => !value.language) ?? values[0];
  }

  private deduplicateProperties(
    properties: ShaclPropertyShape[]
  ): ShaclPropertyShape[] {
    const seen = new Set<string>();

    return properties.filter(property => {
      const key = `${property.id.termType}:${property.id.value}`;
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  }
}
