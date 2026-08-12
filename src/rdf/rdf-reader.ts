import type { Literal, NamedNode, Term } from "@rdfjs/types";
import { Store } from "n3";
import { PREFIX_RDF, RDF_PREDICATE_TYPE } from "../constants";

/**
 * Provides generic read operations over an N3 RDF store.
 *
 * It wraps Store with convenience methods used by higher layers.
 */
export class RdfReader {
  constructor(private readonly store: Store) {}

  /**
   * Returns all objects matching the given subject-predicate pair.
   */
  public getObjects(subject: Term, predicate: NamedNode): Term[] {
    return this.store.getObjects(
      subject,
      predicate,
      null
    );
  }

  /**
   * Returns the single object matching the given subject-predicate pair.
   *
   * @returns The matching object, or undefined when no value is present.
   * @throws Error if multiple values are present.
   */
  public getSingleObject(
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
  public getSingleLiteral(
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

  public readList(head: Term): Term[] {
    const lists = this.extractLists();

    return lists[head.value] ?? [];
  }

  /*
   This code is taken from https://github.com/rdfjs/N3.js/blob/main/src/N3Store.js and adapted to allow rdf:type triples in lists.
   Can be removed as soon as https://github.com/rdfjs/N3.js/issues/546 is fixed.
  */
  private extractLists({ remove = false, ignoreErrors = false } = {}) {
      const lists: Record<string, Term[]> = {} // has scalar keys so could be a simple Object
      const onError = ignoreErrors ? (() => true) :
                    ((node: Term, message: string) => { throw new Error(`${node.value} ${message}`) })
  
      // Traverse each list from its tail
      const tails = this.store.getQuads(null, PREFIX_RDF + 'rest', PREFIX_RDF + 'nil', null)
      const toRemove = remove ? [...tails] : []
      tails.forEach(tailQuad => {
        const items = []             // the members found as objects of rdf:first quads
        let malformed = false        // signals whether the current list is malformed
        let head                     // the head of the list (_:b1 in above example)
        let headPos: string                // set to subject or object when head is set
        const graph = tailQuad.graph // make sure list is in exactly one graph
  
        // Traverse the list from tail to end
        let current: Term | null = tailQuad.subject as Term
        while (current && !malformed) {
          const objectQuads = this.store.getQuads(null, null, current as any, null)
          const subjectQuads = this.store.getQuads(current as any, null, null, null).filter(quad => !quad.predicate.equals(RDF_PREDICATE_TYPE))
          let quad, first = null, rest = null, parent = null
  
          // Find the first and rest of this list node
          for (let i = 0; i < subjectQuads.length && !malformed; i++) {
            quad = subjectQuads[i]
            if (!quad.graph.equals(graph))
              malformed = onError(current, 'not confined to single graph')
            else if (head)
              malformed = onError(current, 'has non-list arcs out')
  
            // one rdf:first
            else if (quad.predicate.value === PREFIX_RDF + 'first') {
              if (first)
                malformed = onError(current, 'has multiple rdf:first arcs')
              else
                toRemove.push(first = quad)
            }
  
            // one rdf:rest
            else if (quad.predicate.value === PREFIX_RDF + 'rest') {
              if (rest)
                malformed = onError(current, 'has multiple rdf:rest arcs')
              else
                toRemove.push(rest = quad)
            }
  
            // alien triple
            else if (objectQuads.length)
              malformed = onError(current, 'can\'t be subject and object')
            else {
              head = quad // e.g. { (1 2 3) :p :o }
              headPos = 'subject'
            }
          }
  
          // { :s :p (1 2) } arrives here with no head
          // { (1 2) :p :o } arrives here with head set to the list.
          for (let i = 0; i < objectQuads.length && !malformed; ++i) {
            quad = objectQuads[i]
            if (head)
              malformed = onError(current, 'can\'t have coreferences')
            // one rdf:rest
            else if (quad.predicate.value === PREFIX_RDF + 'rest') {
              if (parent)
                malformed = onError(current, 'has incoming rdf:rest arcs')
              else
                parent = quad
            }
            else {
              head = quad // e.g. { :s :p (1 2) }
              headPos = 'object'
            }
          }
  
          // Store the list item and continue with parent
          if (!first)
            malformed = onError(current, 'has no list head')
          else
            items.unshift(first.object)
          current = parent ? parent.subject as Term : null
        }
  
        // Don't remove any quads if the list is malformed
        if (malformed)
          remove = false
        // Store the list under the value of its head
        else if (head) {
          // @ts-ignore
          lists[head[headPos].value] = items as Term[]
        }
      })
  
      // Remove list quads if requested
      if (remove)
        this.store.removeQuads(toRemove)
      return lists
  }
  
}
