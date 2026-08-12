import type { Quad, Term } from "@rdfjs/types";
import { Writer } from "n3";

import type { RdfPrefixes } from "../rdf";

/**
 * Converts generated RDF quads to a concrete output syntax.
 *
 * FormRdfSerializer decides which triples exist; this class only decides how
 * those triples are encoded.
 */
export class RdfFormatSerializer {
  serialize(
    quads: Quad[],
    format = "text/turtle",
    prefixes: RdfPrefixes = {}
  ): string {
    if (format === "application/ld+json") {
      return this.serializeJsonLd(quads);
    }

    const writer = new Writer({
      format,
      prefixes
    });

    writer.addQuads(quads as any);

    let output = "";
    writer.end((error, result) => {
      if (error) throw error;
      output = result;
    });

    return output;
  }

  private serializeJsonLd(quads: Quad[]): string {
    const subjects = new Map<string, Record<string, unknown>>();

    for (const quad of quads) {
      const subjectId = this.termId(quad.subject);

      let node = subjects.get(subjectId);
      if (!node) {
        node = { "@id": subjectId };
        subjects.set(subjectId, node);
      }

      const predicate = quad.predicate.value;

      if (
        predicate ===
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
      ) {
        this.addValue(node, "@type", this.termId(quad.object));
      } else {
        this.addValue(
          node,
          predicate,
          this.jsonLdObject(quad.object)
        );
      }
    }

    return JSON.stringify([...subjects.values()], null, 2);
  }

  private jsonLdObject(term: Term): unknown {
    if (term.termType === "NamedNode" || term.termType === "BlankNode") {
      return { "@id": this.termId(term) };
    }

    if (term.termType === "Literal") {
      const value: Record<string, string> = {
        "@value": term.value
      };

      if (term.language) {
        value["@language"] = term.language;
      } else if (
        term.datatype.value !==
        "http://www.w3.org/2001/XMLSchema#string"
      ) {
        value["@type"] = term.datatype.value;
      }

      return value;
    }

    return term.value;
  }

  private addValue(
    node: Record<string, unknown>,
    predicate: string,
    value: unknown
  ): void {
    const existing = node[predicate];

    if (existing === undefined) {
      node[predicate] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      node[predicate] = [existing, value];
    }
  }

  private termId(term: Term): string {
    return term.termType === "BlankNode"
      ? `_:${term.value}`
      : term.value;
  }
}
