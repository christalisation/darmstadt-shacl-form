import type { Term } from "@rdfjs/types";

import type { ShaclConstraint } from "./constraint";
import type { ShaclNodeShape, ShaclPropertyShape } from "./model";
import type { ShaclParser } from "./parser";

function termKey(term: Term): string {
  return `${term.termType}:${term.value}`;
}

/**
 * Resolves form-relevant SHACL shape relationships before form compilation.
 *
 * The parser keeps the RDF-authored structure. This resolver derives the
 * effective shape used by the form layer. Only sh:and contributes properties
 * directly; sh:or and sh:xone remain logical choices.
 */
export class ShaclShapeResolver {
  constructor(private readonly parser: ShaclParser) {}

  resolveNodeShape(shape: Term): ShaclNodeShape {
    const parsed = this.parser.parseNodeShape(shape);

    return {
      ...parsed,
      properties: [
        ...parsed.properties,
        ...this.collectConjunctiveProperties(parsed.constraints)
      ]
    };
  }

  getReferencedShapes(shape: ShaclNodeShape): Term[] {
    const references: Term[] = [];

    references.push(...this.getConstraintReferences(shape.constraints));

    for (const property of shape.properties) {
      references.push(
        ...this.getConstraintReferences(property.constraints)
      );
    }

    return references;
  }

  private collectConjunctiveProperties(
    constraints: ShaclConstraint[],
    visitedShapes = new Set<string>()
  ): ShaclPropertyShape[] {
    const properties: ShaclPropertyShape[] = [];

    for (const constraint of constraints) {
      if (constraint.kind !== "and") {
        continue;
      }

      for (const branch of constraint.shapes) {
        const key = termKey(branch);
        if (visitedShapes.has(key)) continue;
        visitedShapes.add(key);

        const branchShape = this.parser.parseNodeShape(branch);
        properties.push(...branchShape.properties);
        properties.push(
          ...this.collectConjunctiveProperties(
            branchShape.constraints,
            visitedShapes
          )
        );
      }
    }

    return properties;
  }

  private getConstraintReferences(
    constraints: ShaclConstraint[]
  ): Term[] {
    const references: Term[] = [];

    for (const constraint of constraints) {
      if (constraint.kind === "node" || constraint.kind === "not") {
        references.push(constraint.shape);
      }

      if (constraint.kind === "and") {
        references.push(...constraint.shapes);
      }

      if (
        constraint.kind === "or" ||
        constraint.kind === "xone"
      ) {
        const nodeChoices =
          (constraint.nodeChoices ?? []).map(choice => choice.shape);

        references.push(
          ...(nodeChoices.length ? nodeChoices : constraint.shapes)
        );
      }
    }

    return references;
  }
}
