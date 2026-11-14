import { Term } from '@rdfjs/types'

/** Map key that distinguishes terms by type and value (an IRI and a blank node label may coincide). */
export function termKey(term: Term): string {
    return `${term.termType}:${term.value}`
}
