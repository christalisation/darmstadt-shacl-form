import type { Literal, Term } from "@rdfjs/types";

import type { FormShapeConstraint } from "../form-shape/form-shape-constraint";
import type { FormShapeProperty } from "../form-shape/form-shape-property";
import type { FormInstanceValue } from "./form-instance-value";
import type {
  FormValidationError,
  FormValidationResult
} from "./form-validation-result";

/**
 * Mutable runtime state for one form property.
 */
export class FormInstanceProperty {
  private readonly _values: FormInstanceValue[] = [];

  constructor(
    public readonly template: FormShapeProperty
  ) {}

  get values(): readonly FormInstanceValue[] {
    return this._values;
  }

  get canAdd(): boolean {
    const max = this.template.cardinality.max;
    return max === undefined || this._values.length < max;
  }

  addValue(value: FormInstanceValue): number {
    if (!this.canAdd) {
      throw new Error("Maximum cardinality reached.");
    }

    this._values.push(value);
    return this._values.length - 1;
  }

  setValue(index: number, value: FormInstanceValue): void {
    if (index < 0 || index >= this._values.length) {
      throw new Error(`Value index ${index} is out of range.`);
    }

    this._values[index] = value;
  }

  removeValue(index: number): void {
    if (index < 0 || index >= this._values.length) {
      return;
    }

    this._values.splice(index, 1);
  }

  clear(): void {
    this._values.length = 0;
  }

  validate(): FormValidationResult {
    const errors: FormValidationError[] = [];

    const { min, max } = this.template.cardinality;

    if (this._values.length < min) {
      errors.push({
        constraintKind: "minCount",
        message: `Expected at least ${min} value(s).`
      });
    }

    if (max !== undefined && this._values.length > max) {
      errors.push({
        constraintKind: "maxCount",
        message: `Expected at most ${max} value(s).`
      });
    }

    for (let i = 0; i < this._values.length; i++) {
      const value = this._values[i];

      if (value.kind !== "term") {
        // Nested nodes are authoritatively checked by final SHACL validation.
        continue;
      }

      for (const constraint of this.template.constraints) {
        const error = this.validateTerm(value.term, constraint);

        if (error) {
          errors.push({
            ...error,
            valueIndex: i
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private validateTerm(
    term: Term,
    constraint: FormShapeConstraint
  ): FormValidationError | undefined {
    switch (constraint.kind) {
      case "datatype":
        if (
          term.termType !== "Literal" ||
          !term.datatype.equals(constraint.datatype)
        ) {
          return {
            constraintKind: "datatype",
            message: `Expected datatype ${constraint.datatype.value}.`
          };
        }
        return undefined;

      case "nodeKind":
        if (!this.matchesNodeKind(term, constraint.nodeKind.value)) {
          return {
            constraintKind: "nodeKind",
            message: `Value does not match node kind ${constraint.nodeKind.value}.`
          };
        }
        return undefined;

      case "length": {
        if (term.termType !== "Literal") return undefined;

        const length = term.value.length;

        if (constraint.min !== undefined && length < constraint.min) {
          return {
            constraintKind: "minLength",
            message: `Value must contain at least ${constraint.min} character(s).`
          };
        }

        if (constraint.max !== undefined && length > constraint.max) {
          return {
            constraintKind: "maxLength",
            message: `Value must contain at most ${constraint.max} character(s).`
          };
        }

        return undefined;
      }

      case "pattern": {
        if (term.termType !== "Literal") return undefined;

        try {
          const regex = new RegExp(constraint.pattern, constraint.flags);

          if (!regex.test(term.value)) {
            return {
              constraintKind: "pattern",
              message: "Value does not match the required pattern."
            };
          }
        } catch {
          // Invalid JS regex translation should not make this runtime validator
          // authoritative. Final SHACL validation remains the source of truth.
        }

        return undefined;
      }

      case "choice":
        if (!constraint.values.some(value => value.equals(term))) {
          return {
            constraintKind: "in",
            message: "Value is not one of the allowed choices."
          };
        }
        return undefined;

      case "hasValue":
        // Property-level hasValue is checked over the whole collection elsewhere.
        return undefined;

      case "numericRange":
        return this.validateNumericRange(term, constraint);

      case "and":
      case "or":
      case "xone":
      case "not":
      case "equals":
      case "disjoint":
      case "lessThan":
      case "lessThanOrEquals":
        // These require shape/node/global context. Leave them to node-level or
        // authoritative SHACL validation for now.
        return undefined;
    }
  }

  private validateNumericRange(
    term: Term,
    constraint: Extract<
      FormShapeConstraint,
      { kind: "numericRange" }
    >
  ): FormValidationError | undefined {
    if (term.termType !== "Literal") return undefined;

    const value = Number(term.value);
    if (Number.isNaN(value)) return undefined;

    const compare = (literal?: Literal): number | undefined => {
      if (!literal) return undefined;
      const number = Number(literal.value);
      return Number.isNaN(number) ? undefined : number;
    };

    const minExclusive = compare(constraint.minExclusive);
    const minInclusive = compare(constraint.minInclusive);
    const maxExclusive = compare(constraint.maxExclusive);
    const maxInclusive = compare(constraint.maxInclusive);

    if (minExclusive !== undefined && !(value > minExclusive)) {
      return {
        constraintKind: "minExclusive",
        message: `Value must be greater than ${minExclusive}.`
      };
    }

    if (minInclusive !== undefined && !(value >= minInclusive)) {
      return {
        constraintKind: "minInclusive",
        message: `Value must be at least ${minInclusive}.`
      };
    }

    if (maxExclusive !== undefined && !(value < maxExclusive)) {
      return {
        constraintKind: "maxExclusive",
        message: `Value must be less than ${maxExclusive}.`
      };
    }

    if (maxInclusive !== undefined && !(value <= maxInclusive)) {
      return {
        constraintKind: "maxInclusive",
        message: `Value must be at most ${maxInclusive}.`
      };
    }

    return undefined;
  }

  private matchesNodeKind(term: Term, nodeKindIri: string): boolean {
    if (nodeKindIri.endsWith("BlankNodeOrIRI")) {
      return term.termType === "BlankNode" || term.termType === "NamedNode";
    }

    if (nodeKindIri.endsWith("BlankNodeOrLiteral")) {
      return term.termType === "BlankNode" || term.termType === "Literal";
    }

    if (nodeKindIri.endsWith("IRIOrLiteral")) {
      return term.termType === "NamedNode" || term.termType === "Literal";
    }

    if (nodeKindIri.endsWith("IRI")) return term.termType === "NamedNode";
    if (nodeKindIri.endsWith("BlankNode")) return term.termType === "BlankNode";
    if (nodeKindIri.endsWith("Literal")) return term.termType === "Literal";

    return true;
  }
}
