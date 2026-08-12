import { Store } from 'n3'
import { Literal, Term } from '@rdfjs/types'
import { PREFIX_RDF, RDF_PREDICATE_TYPE } from '../constants'

export class RdfReader {
    private listsCache: Record<string, Term[]> | undefined

    constructor(private readonly store: Store) {}

    getObjects(subject: Term, predicate: Term | string, graph: Term | string | null = null): Term[] {
        return this.store.getObjects(subject, predicate, graph)
    }

    getSingleObject(subject: Term, predicate: Term | string, graph: Term | string | null = null): Term | undefined {
        const objects = this.getObjects(subject, predicate, graph)
        if (objects.length > 1) {
            const predicateId = typeof predicate === 'string' ? predicate : predicate.value
            throw new Error(`Expected at most one object for predicate <${predicateId}>, but found ${objects.length}.`)
        }
        return objects[0]
    }

    getSingleLiteral(subject: Term, predicate: Term | string, graph: Term | string | null = null): Literal | undefined {
        const object = this.getSingleObject(subject, predicate, graph)
        if (!object) {
            return undefined
        }
        if (object.termType !== 'Literal') {
            const predicateId = typeof predicate === 'string' ? predicate : predicate.value
            throw new Error(`Expected a literal for predicate <${predicateId}>, but found ${object.termType}.`)
        }
        return object as Literal
    }

    readList(head: Term): Term[] {
        return this.lists[head.value] || []
    }

    get lists(): Record<string, Term[]> {
        if (!this.listsCache) {
            this.listsCache = extractLists(this.store, { ignoreErrors: true })
        }
        return this.listsCache
    }
}

/*
 This code is taken from https://github.com/rdfjs/N3.js/blob/main/src/N3Store.js and adapted to allow rdf:type triples in lists.
 Can be removed as soon as https://github.com/rdfjs/N3.js/issues/546 is fixed.
*/
export function extractLists(store: Store, { remove = false, ignoreErrors = false } = {}) {
    const lists: Record<string, Term[]> = {}
    const onError = ignoreErrors ? (() => true) :
                  ((node: Term, message: string) => { throw new Error(`${node.value} ${message}`) })

    const tails = store.getQuads(null, PREFIX_RDF + 'rest', PREFIX_RDF + 'nil', null)
    const toRemove = remove ? [...tails] : []
    tails.forEach(tailQuad => {
      const items = []
      let malformed = false
      let head
      let headPos: string
      const graph = tailQuad.graph

      let current: Term | null = tailQuad.subject
      while (current && !malformed) {
        const objectQuads = store.getQuads(null, null, current, null)
        const subjectQuads = store.getQuads(current, null, null, null).filter(quad => !quad.predicate.equals(RDF_PREDICATE_TYPE))
        let quad, first = null, rest = null, parent = null

        for (let i = 0; i < subjectQuads.length && !malformed; i++) {
          quad = subjectQuads[i]
          if (!quad.graph.equals(graph))
            malformed = onError(current, 'not confined to single graph')
          else if (head)
            malformed = onError(current, 'has non-list arcs out')
          else if (quad.predicate.value === PREFIX_RDF + 'first') {
            if (first)
              malformed = onError(current, 'has multiple rdf:first arcs')
            else
              toRemove.push(first = quad)
          }
          else if (quad.predicate.value === PREFIX_RDF + 'rest') {
            if (rest)
              malformed = onError(current, 'has multiple rdf:rest arcs')
            else
              toRemove.push(rest = quad)
          }
          else if (objectQuads.length)
            malformed = onError(current, 'can\'t be subject and object')
          else {
            head = quad
            headPos = 'subject'
          }
        }

        for (let i = 0; i < objectQuads.length && !malformed; ++i) {
          quad = objectQuads[i]
          if (head)
            malformed = onError(current, 'can\'t have coreferences')
          else if (quad.predicate.value === PREFIX_RDF + 'rest') {
            if (parent)
              malformed = onError(current, 'has incoming rdf:rest arcs')
            else
              parent = quad
          }
          else {
            head = quad
            headPos = 'object'
          }
        }

        if (!first)
          malformed = onError(current, 'has no list head')
        else
          items.unshift(first.object)
        current = parent && parent.subject
      }

      if (malformed)
        remove = false
      else if (head) {
        // @ts-ignore
        lists[head[headPos].value] = items
      }
    })

    if (remove)
      store.removeQuads(toRemove)
    return lists
}
