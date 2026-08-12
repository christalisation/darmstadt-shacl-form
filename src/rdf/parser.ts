import { Prefixes, Quad, StreamParser } from 'n3'
import { RdfXmlParser } from 'rdfxml-streaming-parser'
import { toRDF } from 'jsonld'

export type RdfParseResult = {
    quads: Quad[],
    prefixes: Prefixes,
}

export async function parseRdf(input: string): Promise<RdfParseResult> {
    const prefixes: Prefixes = {}
    if (!input) {
        return { quads: [], prefixes }
    }

    if (guessContentType(input) === 'json') {
        input = await toRDF(JSON.parse(input), { format: 'application/n-quads' }) as string
    }

    const quads: Quad[] = []
    await new Promise((resolve, reject) => {
        const parser = guessContentType(input) === 'xml' ? new RdfXmlParser() : new StreamParser()
        parser.on('data', (quad: Quad) => { quads.push(quad) })
            .on('error', reject)
            .on('prefix', (prefix, iri) => {
                if (prefix) {
                    prefixes[prefix] = iri
                }
            })
            .on('end', () => { resolve(null) })
        parser.write(input)
        parser.end()
    })

    return { quads, prefixes }
}

/* Can't rely on HTTP content-type header, since many resources are delivered with text/plain */
export function guessContentType(input: string) {
    if (/^\s*\{/.test(input)) {
        return 'json'
    } else if (/^\s*<\?xml/.test(input)) {
        return 'xml'
    }
    return 'ttl'
}
