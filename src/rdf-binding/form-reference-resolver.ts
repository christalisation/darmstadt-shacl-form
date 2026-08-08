import type { NamedNode, Term } from "@rdfjs/types";
import { DataFactory, Store } from "n3";

import type { FormTemplateProperty } from "../form-template/form-template-property";
import type { FormTemplateRegistry } from "../form-template/form-template-registry";
import type { FormReferenceOption } from "./form-reference-option";

const RDF_TYPE = DataFactory.namedNode(
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
);
const RDFS_LABEL = DataFactory.namedNode(
  "http://www.w3.org/2000/01/rdf-schema#label"
);
const RDFS_SUBCLASS_OF = DataFactory.namedNode(
  "http://www.w3.org/2000/01/rdf-schema#subClassOf"
);
const SKOS_PREF_LABEL = DataFactory.namedNode(
  "http://www.w3.org/2004/02/skos/core#prefLabel"
);
const SKOS_BROADER = DataFactory.namedNode(
  "http://www.w3.org/2004/02/skos/core#broader"
);
const SKOS_NARROWER = DataFactory.namedNode(
  "http://www.w3.org/2004/02/skos/core#narrower"
);
const FOAF_NAME = DataFactory.namedNode(
  "http://xmlns.com/foaf/0.1/name"
);
const SH_NAME = DataFactory.namedNode(
  "http://www.w3.org/ns/shacl#name"
);

/**
 * Finds selectable existing resources for form properties.
 *
 * This is the non-DOM replacement for the old util.findInstancesOf().
 */
export class FormReferenceResolver {
  constructor(
    private readonly shapes: Store,
    private readonly data: Store,
    private readonly reference: Store,
    private readonly languages: string[] = [],
    private readonly templates?: FormTemplateRegistry
  ) {}

  findOptions(property: FormTemplateProperty): FormReferenceOption[] {
    if (property.valueType.kind === "choice") {
      return property.valueType.values.map(value => ({
        value,
        label: this.label(value)
      }));
    }

    if (
      property.valueType.kind === "nestedNode"
    ) {
      const nestedTemplate =
        this.templates?.get(
          property.valueType.shape
        );

      if (!nestedTemplate) {
        return [];
      }

      return this.deduplicate(
        nestedTemplate.targetClasses.flatMap(
          targetClass =>
            this.findClassInstances(
              targetClass
            )
        )
      );
    }

    if (
      property.valueType.kind !== "resource" ||
      !property.valueType.class
    ) {
      return [];
    }

    return this.findClassInstances(property.valueType.class);
  }

  findClassInstances(
    classIri: NamedNode,
    visitedClasses = new Set<string>()
  ): FormReferenceOption[] {
    if (visitedClasses.has(classIri.value)) return [];
    visitedClasses.add(classIri.value);

    const instances = this.collectInstances(classIri);
    const nodes = new Map<string, FormReferenceOption>();
    const childToParent = new Map<string, string>();

    for (const instance of instances) {
      nodes.set(this.key(instance), {
        value: instance,
        label: this.label(instance),
        children: []
      });
    }

    for (const instance of instances) {
      const childKey = this.key(instance);

      for (const parent of this.getObjects(instance, SKOS_BROADER)) {
        if (nodes.has(this.key(parent))) {
          childToParent.set(childKey, this.key(parent));
        }
      }

      for (const child of this.getObjects(instance, SKOS_NARROWER)) {
        if (nodes.has(this.key(child))) {
          childToParent.set(this.key(child), childKey);
        }
      }

      for (const parent of this.getObjects(instance, RDFS_SUBCLASS_OF)) {
        if (nodes.has(this.key(parent))) {
          childToParent.set(childKey, this.key(parent));
        }
      }
    }

    for (const [child, parent] of childToParent) {
      const childNode = nodes.get(child);
      const parentNode = nodes.get(parent);

      if (childNode && parentNode) {
        parentNode.children ??= [];
        parentNode.children.push(childNode);
      }
    }

    const roots = [...nodes.entries()]
      .filter(([key]) => !childToParent.has(key))
      .map(([, option]) => option);

    for (const subClass of this.getSubjects(RDFS_SUBCLASS_OF, classIri)) {
      if (subClass.termType === "NamedNode") {
        roots.push(
          ...this.findClassInstances(subClass, visitedClasses)
        );
      }
    }

    return this.deduplicate(roots);
  }

  label(term: Term): string {
    for (const predicate of [
      SH_NAME,
      SKOS_PREF_LABEL,
      RDFS_LABEL,
      FOAF_NAME
    ]) {
      const values = this.getObjects(term, predicate);

      for (const language of this.languages) {
        const match = values.find(
          value =>
            value.termType === "Literal" &&
            value.language === language
        );
        if (match) return match.value;
      }

      const neutral = values.find(
        value =>
          value.termType === "Literal" &&
          !value.language
      );
      if (neutral) return neutral.value;

      const anyLiteral = values.find(
        value => value.termType === "Literal"
      );
      if (anyLiteral) return anyLiteral.value;
    }

    return term.value;
  }

  private collectInstances(classIri: NamedNode): Term[] {
    const values = new Map<string, Term>();

    for (const store of this.stores()) {
      for (const subject of store.getSubjects(RDF_TYPE, classIri, null)) {
        values.set(this.key(subject), subject);
      }
    }

    return [...values.values()];
  }

  private getObjects(subject: Term, predicate: NamedNode): Term[] {
    const values = new Map<string, Term>();

    for (const store of this.stores()) {
      for (const object of store.getObjects(subject, predicate, null)) {
        values.set(this.key(object), object);
      }
    }

    return [...values.values()];
  }

  private getSubjects(predicate: NamedNode, object: Term): Term[] {
    const values = new Map<string, Term>();

    for (const store of this.stores()) {
      for (const subject of store.getSubjects(predicate, object, null)) {
        values.set(this.key(subject), subject);
      }
    }

    return [...values.values()];
  }

  private stores(): Store[] {
    return [this.shapes, this.reference, this.data];
  }

  private key(term: Term): string {
    if (term.termType === "Literal") {
      return [
        term.termType,
        term.value,
        term.language,
        term.datatype.value
      ].join(":");
    }

    return `${term.termType}:${term.value}`;
  }

  private deduplicate(
    options: FormReferenceOption[]
  ): FormReferenceOption[] {
    const seen = new Set<string>();

    return options.filter(option => {
      const key = this.key(option.value);
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  }
}
