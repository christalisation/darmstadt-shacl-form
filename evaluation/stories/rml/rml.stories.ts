// Renders the reconstructed RML mapping and its precomputed verification result.
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { html } from 'lit'
import { rmlTestDefs, type RmlTestDef } from '../../test-defs/rml'
import { rmlShapesGraph } from './shapes'

// Vite keys these raw fixture imports by project-root-relative path.
const rmlFixtureText = import.meta.glob('/evaluation/fixtures/rml/**/*', {
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
            data-collapse=""
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
