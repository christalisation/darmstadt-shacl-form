// ONE parameterized CSF file for the RML suite (only one category here, so
// the CSF-title-per-file constraint documented in
// stories/shacl-core/_shared.ts doesn't force a split — see that file for
// why the SHACL Core suite needed one file per C1-C4 category instead).
//
// Renders the mapping RECONSTRUCTED through this project's own RML form UI
// (w3id.org/rml/ namespace, matching the pinned rml/core-authoring.ttl +
// rml/io.ttl + rml/authoring-overlay.ttl shapes) — the same
// generated-mapping.ttl produced during the thesis's Chapter 6 evaluation —
// loaded back into the form as `data-values` against those exact shapes, the
// same way rml/index.html's live demo is wired (shapeFiles array, joined
// with '\n\n', data-values-namespace / data-show-node-ids /
// data-ignore-owl-imports). It does NOT render the upstream RMLTC's own
// mapping.ttl, which uses the legacy rr:/semweb.mmlab.be namespace and would
// not resolve against these shapes (see test-defs/rml.ts header).
//
// Correctness (does the mapping actually execute to the expected RDF?) is
// NOT determined here — that's scripts/verify-rml.mjs's job, run
// independently of Storybook. This story only displays the precomputed
// `verification` field already recorded on the test-def.

import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { html } from 'lit'
import { rmlTestDefs, type RmlTestDef } from '../../test-defs/rml'
import { rmlShapesGraph } from './shapes'

// Eagerly load every RML fixture's raw text at build time (Vite), keyed by
// project-root-relative path (leading '/'), matching test-def file fields.
const rmlFixtureText = import.meta.glob('/fixtures/rml/**/*', {
    eager: true,
    query: '?raw',
    import: 'default',
}) as Record<string, string>

function loadFixture(path: string): string {
    const key = `/${path}`
    const text = rmlFixtureText[key]
    if (text === undefined) {
        throw new Error(`RML fixture not found for path "${path}" (looked up as "${key}"). Available: ${Object.keys(rmlFixtureText).join(', ')}`)
    }
    return text
}

interface RmlStoryArgs {
    valuesContent: string
}

const meta: Meta<RmlStoryArgs> = {
    title: 'RML',
    render: args => html`
        <shacl-form
            data-shapes=${rmlShapesGraph}
            data-values=${args.valuesContent}
            data-values-namespace="http://example.org/"
            data-show-node-ids
            data-ignore-owl-imports
        ></shacl-form>
    `,
    tags: ['autodocs'],
}
export default meta

function rmlStory(def: RmlTestDef): StoryObj<RmlStoryArgs> {
    return {
        name: def.id,
        args: {
            valuesContent: loadFixture(def.mappingFile),
        },
        parameters: {
            docs: {
                description: {
                    story: [
                        `**RML test case:** \`${def.rmlTcId}\``,
                        `**Source (upstream RMLTC):** ${def.sourceUrl}`,
                        `**Rendered mapping:** \`${def.mappingFile}\` — reconstructed through this project's RML form UI (w3id.org/rml/ namespace), not the upstream file.`,
                        `**Upstream mapping (provenance only, not rendered):** \`${def.upstreamMappingFile}\` (legacy rr:/semweb.mmlab.be namespace — see file header note)`,
                        '**Input data (`' + def.inputFile + '`):**',
                        '```json\n' + loadFixture(def.inputFile).trim() + '\n```',
                        '**Expected output (`' + def.expectedOutputFile + '`):**',
                        '```\n' + loadFixture(def.expectedOutputFile).trim() + '\n```',
                        `**Verification:** \`${def.verification.result}\` via ${def.verification.tool}, compared against \`${def.verification.comparedAgainst}\` using RDF graph isomorphism (rdf-isomorphic), not string equality. Verified at ${def.verification.verifiedAt}. Computed by \`scripts/verify-rml.mjs\` — Storybook only displays this value, it does not recompute it.`,
                    ].join('\n\n'),
                },
            },
        },
    }
}

export const RMLTC0001a_JSON = rmlStory(rmlTestDefs[0])
