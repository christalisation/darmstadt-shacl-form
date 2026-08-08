import type { Literal, NamedNode, Term } from "@rdfjs/types";

import { RdfGraphReader } from "../rdf/graph-reader";
import { RdfListReader } from "../rdf/list-reader";
import { RdfTermUtils } from "../rdf/term-utils";
import type { ShaclConstraint } from "./constraint";
import { ShaclNodeShape } from "./node-shape";
import { ShaclPathParser } from "./path-parser";
import { ShaclPropertyShape } from "./property-shape";
import type { ShaclTarget } from "./target";
import type { ShaclShapeMetadata } from "./shape-metadata";
import { SH } from "./vocabulary";

/**
 * Converts RDF SHACL structures into the semantic SHACL model.
 *
 * It assumes the shape graph has already been checked by ShaclSemanticAnalyzer.
 */
export class ShaclGraphParser {
  constructor(
    private readonly rdf: RdfGraphReader,
    private readonly lists: RdfListReader,
    private readonly paths: ShaclPathParser
  ) {}

  parseNodeShape(id: Term): ShaclNodeShape {
    const targets = this.parseTargets(id);

    const properties = this.rdf
      .getObjects(id, SH.property)
      .map(property => this.parsePropertyShape(property));

    const constraints = this.parseConstraints(id);

    return new ShaclNodeShape(id, targets, properties, constraints, this.parseMetadata(id));
  }

  parsePropertyShape(id: Term): ShaclPropertyShape {
    const pathTerm = this.rdf.getSingleObject(id, SH.path);

    if (!pathTerm) {
      throw new Error(`Property shape ${id.value} has no sh:path.`);
    }

    return new ShaclPropertyShape(
      id,
      this.paths.parse(pathTerm),
      this.parseConstraints(id),
      this.parseMetadata(id)
    );
  }


  private parseMetadata(id: Term): ShaclShapeMetadata {
    const names = this.rdf
      .getObjects(id, SH.name)
      .map(term => this.requireLiteral(term, "sh:name"));

    const descriptions = this.rdf
      .getObjects(id, SH.description)
      .map(term => this.requireLiteral(term, "sh:description"));

    const orderTerm = this.rdf.getSingleObject(id, SH.order);
    const order = orderTerm
      ? Number(this.requireLiteral(orderTerm, "sh:order").value)
      : undefined;

    return {
      names,
      descriptions,
      order: order !== undefined && !Number.isNaN(order) ? order : undefined,
      group: this.rdf.getSingleObject(id, SH.group)
    };
  }

  private parseTargets(id: Term): ShaclTarget[] {
    const targets: ShaclTarget[] = [];

    for (const value of this.rdf.getObjects(id, SH.targetClass)) {
      targets.push({
        kind: "class",
        class: this.requireNamedNode(value, "sh:targetClass")
      });
    }

    for (const value of this.rdf.getObjects(id, SH.targetNode)) {
      targets.push({
        kind: "node",
        node: value
      });
    }

    for (const value of this.rdf.getObjects(id, SH.targetSubjectsOf)) {
      targets.push({
        kind: "subjectsOf",
        predicate: this.requireNamedNode(value, "sh:targetSubjectsOf")
      });
    }

    for (const value of this.rdf.getObjects(id, SH.targetObjectsOf)) {
      targets.push({
        kind: "objectsOf",
        predicate: this.requireNamedNode(value, "sh:targetObjectsOf")
      });
    }

    return targets;
  }

  private parseConstraints(id: Term): ShaclConstraint[] {
    const constraints: ShaclConstraint[] = [];

    this.pushNamedNodeConstraint(constraints, id, SH.datatype, "datatype", "datatype");
    this.pushNamedNodeConstraint(constraints, id, SH.nodeKind, "nodeKind", "nodeKind");
    this.pushNamedNodeConstraint(constraints, id, SH.class, "class", "class");

    const node = this.rdf.getSingleObject(id, SH.node);
    if (node) constraints.push({ kind: "node", shape: node });

    this.pushIntegerConstraint(constraints, id, SH.minCount, "minCount");
    this.pushIntegerConstraint(constraints, id, SH.maxCount, "maxCount");

    this.pushLiteralConstraint(constraints, id, SH.minExclusive, "minExclusive");
    this.pushLiteralConstraint(constraints, id, SH.minInclusive, "minInclusive");
    this.pushLiteralConstraint(constraints, id, SH.maxExclusive, "maxExclusive");
    this.pushLiteralConstraint(constraints, id, SH.maxInclusive, "maxInclusive");

    this.pushIntegerConstraint(constraints, id, SH.minLength, "minLength");
    this.pushIntegerConstraint(constraints, id, SH.maxLength, "maxLength");

    const pattern = this.rdf.getSingleObject(id, SH.pattern);
    if (pattern) {
      const patternLiteral = this.requireLiteral(pattern, "sh:pattern");
      const flagsTerm = this.rdf.getSingleObject(id, SH.flags);
      const flags = flagsTerm
        ? this.requireLiteral(flagsTerm, "sh:flags").value
        : undefined;

      constraints.push({
        kind: "pattern",
        pattern: patternLiteral.value,
        flags
      });
    }

    const languageIn = this.rdf.getSingleObject(id, SH.languageIn);
    if (languageIn) {
      constraints.push({
        kind: "languageIn",
        languages: this.lists.read(languageIn).map(term =>
          this.requireLiteral(term, "sh:languageIn member").value
        )
      });
    }

    const uniqueLang = this.rdf.getSingleObject(id, SH.uniqueLang);
    if (uniqueLang) {
      constraints.push({
        kind: "uniqueLang",
        value: this.parseBoolean(uniqueLang, "sh:uniqueLang")
      });
    }

    const shIn = this.rdf.getSingleObject(id, SH.in);
    if (shIn) {
      constraints.push({
        kind: "in",
        values: this.lists.read(shIn)
      });
    }

    for (const value of this.rdf.getObjects(id, SH.hasValue)) {
      constraints.push({
        kind: "hasValue",
        value
      });
    }

    this.pushPropertyPairConstraint(constraints, id, SH.equals, "equals");
    this.pushPropertyPairConstraint(constraints, id, SH.disjoint, "disjoint");
    this.pushPropertyPairConstraint(constraints, id, SH.lessThan, "lessThan");
    this.pushPropertyPairConstraint(
      constraints,
      id,
      SH.lessThanOrEquals,
      "lessThanOrEquals"
    );

    const not = this.rdf.getSingleObject(id, SH.not);
    if (not) constraints.push({ kind: "not", shape: not });

    this.pushShapeListConstraint(constraints, id, SH.and, "and");
    this.pushShapeListConstraint(constraints, id, SH.or, "or");
    this.pushShapeListConstraint(constraints, id, SH.xone, "xone");

    const qualifiedShape = this.rdf.getSingleObject(id, SH.qualifiedValueShape);
    if (qualifiedShape) {
      constraints.push({
        kind: "qualifiedValueShape",
        shape: qualifiedShape,
        minCount: this.readOptionalInteger(id, SH.qualifiedMinCount),
        maxCount: this.readOptionalInteger(id, SH.qualifiedMaxCount),
        disjoint: this.readOptionalBoolean(id, SH.qualifiedValueShapesDisjoint)
      });
    }

    const closed = this.rdf.getSingleObject(id, SH.closed);
    if (closed) {
      const ignoredHead = this.rdf.getSingleObject(id, SH.ignoredProperties);
      const ignoredProperties = ignoredHead
        ? this.lists
            .read(ignoredHead)
            .map(term => this.requireNamedNode(term, "sh:ignoredProperties member"))
        : [];

      constraints.push({
        kind: "closed",
        value: this.parseBoolean(closed, "sh:closed"),
        ignoredProperties
      });
    }

    return constraints;
  }

  private pushNamedNodeConstraint(
    constraints: ShaclConstraint[],
    id: Term,
    predicate: NamedNode,
    kind: "datatype" | "nodeKind" | "class",
    _property: "datatype" | "nodeKind" | "class"
  ): void {
    const term = this.rdf.getSingleObject(id, predicate);
    if (!term) return;

    const namedNode = this.requireNamedNode(term, `sh:${kind}`);

    switch (kind) {
      case "datatype":
        constraints.push({ kind, datatype: namedNode });
        return;

      case "nodeKind":
        constraints.push({ kind, nodeKind: namedNode });
        return;

      case "class":
        constraints.push({ kind, class: namedNode });
        return;
    }
  }

  private pushIntegerConstraint(
    constraints: ShaclConstraint[],
    id: Term,
    predicate: NamedNode,
    kind: "minCount" | "maxCount" | "minLength" | "maxLength"
  ): void {
    const value = this.readOptionalInteger(id, predicate);
    if (value === undefined) return;

    constraints.push({ kind, value } as ShaclConstraint);
  }

  private pushLiteralConstraint(
    constraints: ShaclConstraint[],
    id: Term,
    predicate: NamedNode,
    kind:
      | "minExclusive"
      | "minInclusive"
      | "maxExclusive"
      | "maxInclusive"
  ): void {
    const term = this.rdf.getSingleObject(id, predicate);
    if (!term) return;

    constraints.push({
      kind,
      value: this.requireLiteral(term, `sh:${kind}`)
    } as ShaclConstraint);
  }

  private pushPropertyPairConstraint(
    constraints: ShaclConstraint[],
    id: Term,
    predicate: NamedNode,
    kind: "equals" | "disjoint" | "lessThan" | "lessThanOrEquals"
  ): void {
    for (const term of this.rdf.getObjects(id, predicate)) {
      constraints.push({
        kind,
        property: this.requireNamedNode(term, `sh:${kind}`)
      } as ShaclConstraint);
    }
  }

  private pushShapeListConstraint(
    constraints: ShaclConstraint[],
    id: Term,
    predicate: NamedNode,
    kind: "and" | "or" | "xone"
  ): void {
    const head = this.rdf.getSingleObject(id, predicate);
    if (!head) return;

    constraints.push({
      kind,
      shapes: this.lists.read(head)
    } as ShaclConstraint);
  }

  private readOptionalInteger(
    id: Term,
    predicate: NamedNode
  ): number | undefined {
    const term = this.rdf.getSingleObject(id, predicate);
    if (!term) return undefined;

    const literal = this.requireLiteral(term, predicate.value);
    const value = Number.parseInt(literal.value, 10);

    if (!Number.isInteger(value)) {
      throw new Error(`${predicate.value} must be an integer literal.`);
    }

    return value;
  }

  private readOptionalBoolean(
    id: Term,
    predicate: NamedNode
  ): boolean | undefined {
    const term = this.rdf.getSingleObject(id, predicate);
    return term ? this.parseBoolean(term, predicate.value) : undefined;
  }

  private parseBoolean(term: Term, label: string): boolean {
    const literal = this.requireLiteral(term, label);

    if (literal.value === "true" || literal.value === "1") return true;
    if (literal.value === "false" || literal.value === "0") return false;

    throw new Error(`${label} must be a boolean literal.`);
  }

  private requireNamedNode(term: Term, label: string): NamedNode {
    if (!RdfTermUtils.isNamedNode(term)) {
      throw new Error(`${label} must be an IRI.`);
    }

    return term;
  }

  private requireLiteral(term: Term, label: string): Literal {
    if (!RdfTermUtils.isLiteral(term)) {
      throw new Error(`${label} must be a literal.`);
    }

    return term;
  }
}
