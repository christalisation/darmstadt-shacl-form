import type { NamedNode, Term } from "@rdfjs/types";

import { RdfGraphReader } from "../rdf/graph-reader";
import { RdfListReader } from "../rdf/list-reader";
import type { ShaclPath } from "./path";
import { RDF_FIRST, SH } from "./vocabulary";

/**
 * Parses the RDF representation of SHACL Core property paths.
 */
export class ShaclPathParser {
  constructor(
    private readonly rdf: RdfGraphReader,
    private readonly lists: RdfListReader
  ) {}

  parse(term: Term): ShaclPath {
    if (term.termType === "NamedNode") {
      return {
        kind: "predicate",
        predicate: term as NamedNode
      };
    }

    const alternative = this.rdf.getSingleObject(term, SH.alternativePath);
    if (alternative) {
      return {
        kind: "alternative",
        paths: this.lists.read(alternative).map(item => this.parse(item))
      };
    }

    const inverse = this.rdf.getSingleObject(term, SH.inversePath);
    if (inverse) {
      return {
        kind: "inverse",
        path: this.parse(inverse)
      };
    }

    const zeroOrMore = this.rdf.getSingleObject(term, SH.zeroOrMorePath);
    if (zeroOrMore) {
      return {
        kind: "zeroOrMore",
        path: this.parse(zeroOrMore)
      };
    }

    const oneOrMore = this.rdf.getSingleObject(term, SH.oneOrMorePath);
    if (oneOrMore) {
      return {
        kind: "oneOrMore",
        path: this.parse(oneOrMore)
      };
    }

    const zeroOrOne = this.rdf.getSingleObject(term, SH.zeroOrOnePath);
    if (zeroOrOne) {
      return {
        kind: "zeroOrOne",
        path: this.parse(zeroOrOne)
      };
    }

    // A SHACL sequence path is represented directly as an RDF list.
    if (this.rdf.getObjects(term, RDF_FIRST).length > 0) {
      return {
        kind: "sequence",
        paths: this.lists.read(term).map(item => this.parse(item))
      };
    }

    throw new Error(
      `Unsupported or malformed SHACL property path at ${term.value}.`
    );
  }
}
