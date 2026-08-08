// rdf/list-reader.ts
import { Store, Term } from "n3";
import { PREFIX_RDF, RDF_PREDICATE_TYPE } from "../constants";

/**
 * RDF list reader based on N3.js Store.extractLists().
 *
 * The underlying extraction algorithm is adapted from N3.js and allows
 * rdf:type statements on RDF list nodes.
 *
 * @see https://github.com/rdfjs/N3.js
 */
export class RdfListReader {
  constructor(private readonly store: Store) {}

  read(head: Term): Term[] {
    const lists = extractLists(this.store);

    return lists[head.value] ?? [];
  }
}


/*
 This code is taken from https://github.com/rdfjs/N3.js/blob/main/src/N3Store.js and adapted to allow rdf:type triples in lists.
 Can be removed as soon as https://github.com/rdfjs/N3.js/issues/546 is fixed.
*/
export function  extractLists(store: Store, { remove = false, ignoreErrors = false } = {}) {
    const lists: Record<string, Term[]> = {} // has scalar keys so could be a simple Object
    const onError = ignoreErrors ? (() => true) :
                  ((node: Term, message: string) => { throw new Error(`${node.value} ${message}`) })

    // Traverse each list from its tail
    const tails = store.getQuads(null, PREFIX_RDF + 'rest', PREFIX_RDF + 'nil', null)
    const toRemove = remove ? [...tails] : []
    tails.forEach(tailQuad => {
      const items = []             // the members found as objects of rdf:first quads
      let malformed = false        // signals whether the current list is malformed
      let head                     // the head of the list (_:b1 in above example)
      let headPos: string                // set to subject or object when head is set
      const graph = tailQuad.graph // make sure list is in exactly one graph

      // Traverse the list from tail to end
      let current: Term | null = tailQuad.subject
      while (current && !malformed) {
        const objectQuads = store.getQuads(null, null, current, null)
        const subjectQuads = store.getQuads(current, null, null, null).filter(quad => !quad.predicate.equals(RDF_PREDICATE_TYPE))
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
        current = parent && parent.subject
      }

      // Don't remove any quads if the list is malformed
      if (malformed)
        remove = false
      // Store the list under the value of its head
      else if (head) {
        // @ts-ignore
        lists[head[headPos].value] = items
      }
    })

    // Remove list quads if requested
    if (remove)
      store.removeQuads(toRemove)
    return lists
}