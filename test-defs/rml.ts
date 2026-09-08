// Plain data only — no logic. Each entry describes one RML Test Case
// (https://rml.io/test-cases/) used to drive a Storybook story.
//
// IMPORTANT — namespace note: no case in the official RML Test Cases suite
// (RMLio/rml-test-cases, mirrored at kg-construct/rml-test-cases; verified
// via GitHub code search across both, 0 hits) uses the w3id.org/rml/
// namespace — the entire upstream suite is written in the legacy
// http://www.w3.org/ns/r2rml# / http://semweb.mmlab.be/ns/rml# vocabulary.
// That vocabulary does not match the pinned rml/core-authoring.ttl +
// rml/io.ttl shapes (w3id.org/rml/), so upstream mapping.ttl files cannot be
// rendered through this project's RML form as-is.
//
// `mappingFile` therefore points to a mapping reconstructed THROUGH the
// project's own RML form UI (w3id.org/rml/ namespace) — semantically
// equivalent to the upstream test case, not a namespace-translated copy of
// its file. This is the exact mapping.ttl produced during the thesis's
// Chapter 6 evaluation (see christalisation/recherche-RML,
// evaluation/rml-tests/<id>/generated-mapping.ttl), reused verbatim here.
// `upstreamMappingFile` retains the original upstream file for provenance
// and citation only; it is not used for rendering or verification.
//
// `verification` is precomputed by scripts/verify-rml.mjs (RMLMapper +
// RDF graph isomorphism comparison against expectedOutputFile) and is
// displayed as-is in the story's Docs panel — Storybook never recomputes it.
// Re-run that script and update this field by hand if mappingFile or
// expectedOutputFile change.

export interface RmlVerification {
    tool: string
    result: 'pass' | 'fail'
    comparedAgainst: string
    verifiedAt: string
}

export interface RmlTestDef {
    id: string
    rmlTcId: string
    mappingFile: string
    upstreamMappingFile: string
    inputFile: string
    expectedOutputFile: string
    sourceUrl: string
    verification: RmlVerification
}

export const rmlTestDefs: RmlTestDef[] = [
    {
        id: 'RMLTC0001a-JSON',
        rmlTcId: 'RMLTC0001a-JSON',
        mappingFile: 'fixtures/rml/RMLTC0001a-JSON/generated-mapping.ttl',
        upstreamMappingFile: 'fixtures/rml/RMLTC0001a-JSON/upstream-mapping.ttl',
        inputFile: 'fixtures/rml/RMLTC0001a-JSON/student.json',
        expectedOutputFile: 'fixtures/rml/RMLTC0001a-JSON/output.nq',
        sourceUrl: 'https://github.com/RMLio/rml-test-cases/tree/master/test-cases/RMLTC0001a-JSON',
        verification: {
            // Produced by `node scripts/verify-rml.mjs`: RMLMapper 8.0.0
            // executed against mappingFile, materialised output compared to
            // expectedOutputFile via RDF graph isomorphism (rdf-isomorphic),
            // not string equality. Raw result: verification-results/rml.json.
            tool: 'RMLMapper 8.0.0',
            result: 'pass',
            comparedAgainst: 'fixtures/rml/RMLTC0001a-JSON/output.nq',
            verifiedAt: '2026-09-08T10:54:27.630Z',
        },
    },
]
