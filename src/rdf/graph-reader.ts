// rdf/RdfGraphReader.ts

import { Literal, NamedNode, Store, Term } from "n3";

/**
 * Provides small, generic read operations over an RDF graph.
 *
 * This class is intentionally independent from SHACL. It only wraps
 * common N3 Store queries and provides stricter accessors where useful.
 */
export class RdfGraphReader {
  constructor(private readonly store: Store) {}

  /**
   * Returns all objects matching the given subject-predicate pair.
   */
  getObjects(subject: Term, predicate: NamedNode): Term[] {
    return this.store.getObjects(subject, predicate, null);
  }

  /**
   * Returns the single object matching the given subject-predicate pair.
   *
   * @returns The matching object, or undefined when no value is present.
   * @throws Error if multiple values are present.
   */
  getSingleObject(
    subject: Term,
    predicate: NamedNode
  ): Term | undefined {
    const objects = this.getObjects(subject, predicate);

    if (objects.length > 1) {
      throw new Error(
        `Expected at most one object for predicate <${predicate.value}>, ` +
        `but found ${objects.length}.`
      );
    }

    return objects[0];
  }

  /**
   * Returns the single literal matching the given subject-predicate pair.
   *
   * @returns The literal, or undefined when no value is present.
   * @throws Error if multiple values are present or if the value is not a literal.
   */
  getLiteral(
    subject: Term,
    predicate: NamedNode
  ): Literal | undefined {
    const object = this.getSingleObject(subject, predicate);

    if (object === undefined) {
      return undefined;
    }

    if (object.termType !== "Literal") {
      throw new Error(
        `Expected a literal for predicate <${predicate.value}>, ` +
        `but found ${object.termType}.`
      );
    }

    return object;
  }
}