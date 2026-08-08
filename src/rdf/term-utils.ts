// rdf/RdfTermUtils.ts

import {
  BlankNode,
  Literal,
  NamedNode,
  Term
} from "n3";

/**
 * Utility functions for narrowing RDF/JS Term types.
 */
export class RdfTermUtils {
  private constructor() {}

  /**
   * Tests whether a term is a literal.
   */
  static isLiteral(term: Term): term is Literal {
    return term.termType === "Literal";
  }

  /**
   * Tests whether a term is a named node (IRI).
   */
  static isNamedNode(term: Term): term is NamedNode {
    return term.termType === "NamedNode";
  }

  /**
   * Tests whether a term is a blank node.
   */
  static isBlankNode(term: Term): term is BlankNode {
    return term.termType === "BlankNode";
  }

  /**
   * Tests whether a term can represent an RDF resource.
   */
  static isResource(
    term: Term
  ): term is NamedNode | BlankNode {
    return (
      term.termType === "NamedNode" ||
      term.termType === "BlankNode"
    );
  }
}