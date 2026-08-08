import { DataFactory, Quad, Store, StreamParser } from "n3";
import type { Quad as RdfQuad } from "@rdfjs/types";
import { RdfXmlParser } from "rdfxml-streaming-parser";
import { toRDF as jsonLdToRdf } from "jsonld";

import { FormConfig } from "./config";
import type { RdfPrefixes } from "./rdf/rdf-prefixes";
export type { RdfPrefixes } from "./rdf/rdf-prefixes";

const OWL_IMPORTS = DataFactory.namedNode(
  "http://www.w3.org/2002/07/owl#imports"
);
const DCTERMS_CONFORMS_TO = DataFactory.namedNode(
  "http://purl.org/dc/terms/conformsTo"
);
const SH_CLASS = DataFactory.namedNode(
  "http://www.w3.org/ns/shacl#class"
);
const SH_TARGET_CLASS = DataFactory.namedNode(
  "http://www.w3.org/ns/shacl#targetClass"
);

export interface LoadedFormGraphs {
  shapes: Store;
  data: Store;
  reference: Store;
  prefixes: RdfPrefixes;
}

const loadedUrlCache = new Map<string, Promise<string>>();
const loadedClassCache = new Map<string, Promise<string>>();

export class FormLoader {
  private readonly loadedExternalUrls = new Set<string>();
  private readonly loadedClasses = new Set<string>();
  private readonly prefixes: RdfPrefixes = {};

  constructor(private readonly config: FormConfig) {}

  async load(): Promise<LoadedFormGraphs> {
    this.loadedExternalUrls.clear();
    this.loadedClasses.clear();

    for (const key of Object.keys(this.prefixes)) {
      delete this.prefixes[key];
    }

    const shapes = new Store();
    const data = new Store();
    const reference = new Store();

    const shapesInput = await this.resolveSource(
      this.config.shapes,
      this.config.shapesUrl
    );

    if (shapesInput) {
      await this.importRdf(
        shapesInput.text,
        shapes,
        shapesInput.baseIri,
        !this.config.ignoreOwlImports
      );
    }

    const valuesInput = await this.resolveSource(
      this.config.values,
      this.config.valuesUrl
    );

    if (valuesInput) {
      await this.importRdf(
        valuesInput.text,
        data,
        valuesInput.baseIri,
        false
      );
    }

    if (shapes.size === 0 && this.config.valuesSubject) {
      await this.loadReferencedShapes(data, shapes);
    }

    await this.loadProvidedClassInstances(shapes, reference);

    return {
      shapes,
      data,
      reference,
      prefixes: { ...this.prefixes }
    };
  }

  async importRdf(
    input: string,
    store: Store,
    baseIri?: string,
    resolveImports = false
  ): Promise<void> {
    if (!input.trim()) return;

    switch (guessRdfSyntax(input)) {
      case "jsonld": {
        const nquads = await jsonLdToRdf(
          JSON.parse(input),
          {
            format: "application/n-quads",
            base: baseIri
          }
        ) as string;

        await this.parseN3(nquads, store, baseIri, resolveImports);
        return;
      }

      case "rdfxml":
        await this.parseRdfXml(input, store, baseIri, resolveImports);
        return;

      case "n3":
        await this.parseN3(input, store, baseIri, resolveImports);
    }
  }

  private async resolveSource(
    inline?: string,
    url?: string
  ): Promise<{ text: string; baseIri?: string } | undefined> {
    if (inline) return { text: inline };
    if (!url) return undefined;

    return {
      text: await this.fetchRdf(url),
      baseIri: url
    };
  }

  private async parseN3(
    input: string,
    store: Store,
    baseIri?: string,
    resolveImports = false
  ): Promise<void> {
    const imports: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const parser = new StreamParser({ baseIRI: baseIri });

      parser
        .on("data", (quad: Quad) => {
          store.addQuad(quad);

          if (
            resolveImports &&
            quad.predicate.equals(OWL_IMPORTS) &&
            quad.object.termType === "NamedNode"
          ) {
            imports.push(quad.object.value);
          }
        })
        .on("prefix", (prefix, iri) => {
          if (prefix) {
            this.prefixes[prefix] =
              typeof iri === "string" ? iri : iri.value;
          }
        })
        .on("error", reject)
        .on("end", resolve);

      parser.write(input);
      parser.end();
    });

    await this.loadImports(imports, store);
  }

  private async parseRdfXml(
    input: string,
    store: Store,
    baseIri?: string,
    resolveImports = false
  ): Promise<void> {
    const imports: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const parser = new RdfXmlParser({ baseIRI: baseIri });

      parser
        .on("data", (quad: RdfQuad) => {
          store.addQuad(quad);

          if (
            resolveImports &&
            quad.predicate.equals(OWL_IMPORTS) &&
            quad.object.termType === "NamedNode"
          ) {
            imports.push(quad.object.value);
          }
        })
        .on("error", reject)
        .on("end", resolve);

      parser.write(input);
      parser.end();
    });

    await this.loadImports(imports, store);
  }

  private async loadImports(imports: string[], store: Store): Promise<void> {
    if (this.config.ignoreOwlImports) return;

    for (const url of imports) {
      if (this.loadedExternalUrls.has(url)) continue;
      this.loadedExternalUrls.add(url);

      await this.importRdf(
        await this.fetchRdf(url),
        store,
        url,
        true
      );
    }
  }

  private async loadReferencedShapes(
    data: Store,
    shapes: Store
  ): Promise<void> {
    const subject = DataFactory.namedNode(this.config.valuesSubject!);

    for (const candidate of data.getObjects(
      subject,
      DCTERMS_CONFORMS_TO,
      null
    )) {
      const url = this.toUrl(candidate.value);
      if (!url || this.loadedExternalUrls.has(url)) continue;

      this.loadedExternalUrls.add(url);

      try {
        await this.importRdf(
          await this.fetchRdf(url),
          shapes,
          url,
          !this.config.ignoreOwlImports
        );
      } catch (error) {
        console.warn(`Unable to load referenced SHACL shape ${url}.`, error);
      }
    }
  }

  private async loadProvidedClassInstances(
    shapes: Store,
    reference: Store
  ): Promise<void> {
    const provider = this.config.classInstanceProvider;
    if (!provider) return;

    const classes = new Set<string>();

    for (const predicate of [SH_CLASS, SH_TARGET_CLASS]) {
      for (const term of shapes.getObjects(null, predicate, null)) {
        if (term.termType === "NamedNode") {
          classes.add(term.value);
        }
      }
    }

    for (const classIri of classes) {
      if (this.loadedClasses.has(classIri)) continue;
      this.loadedClasses.add(classIri);

      let promise = loadedClassCache.get(classIri);
      if (!promise) {
        promise = Promise.resolve(provider(classIri));
        loadedClassCache.set(classIri, promise);
      }

      const input = await promise;
      if (!input?.trim()) continue;

      await this.importRdf(input, reference, undefined, false);
    }
  }

  private toUrl(id: string): string | undefined {
    if (isHttpUrl(id)) return id;

    const separator = id.indexOf(":");
    if (separator <= 0) return undefined;

    const namespace = this.prefixes[id.slice(0, separator)];
    if (!namespace) return undefined;

    const expanded = namespace + id.slice(separator + 1);
    return isHttpUrl(expanded) ? expanded : undefined;
  }

  private async fetchRdf(url: string): Promise<string> {
    const cached = loadedUrlCache.get(url);
    if (cached) return cached;

    const requestUrl = this.config.proxy
      ? this.config.proxy + encodeURIComponent(url)
      : url;

    const promise = fetch(requestUrl, {
      headers: {
        Accept:
          "text/turtle, application/trig, application/n-triples, " +
          "application/n-quads, text/n3, application/ld+json, application/rdf+xml"
      }
    }).then(response => {
      if (!response.ok) {
        throw new Error(
          `Unable to load RDF from ${url}: ${response.status} ${response.statusText}`
        );
      }
      return response.text();
    });

    loadedUrlCache.set(url, promise);
    return promise;
  }
}

export type DetectedRdfSyntax = "n3" | "jsonld" | "rdfxml";

export function guessRdfSyntax(input: string): DetectedRdfSyntax {
  if (/^\s*[\{\[]/.test(input)) return "jsonld";
  if (/^\s*<\?xml/.test(input) || /^\s*<rdf:RDF[\s>]/.test(input)) {
    return "rdfxml";
  }
  return "n3";
}

function isHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
