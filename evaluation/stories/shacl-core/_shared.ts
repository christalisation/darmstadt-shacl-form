// Adapts SHACL test definitions into Storybook stories and shared render helpers. Category files stay separate because Storybook's title is set once per file.
import type { StoryObj } from '@storybook/web-components-vite'
import type { ShaclCoreTestDef, ShaclRenderOutcome } from '../../test-defs/shacl-core'
import { renderShaclDemoPage } from './demo-page'

// Vite keys these raw fixture imports by project-root-relative path.
const shaclFixtureText = import.meta.glob('/evaluation/fixtures/shacl/*.ttl', {
    eager: true,
    query: '?raw',
    import: 'default',
}) as Record<string, string>

export function loadFixture(path: string): string {
    const key = `/${path}`
    const text = shaclFixtureText[key]
    if (text === undefined) {
        throw new Error(`SHACL fixture not found for path "${path}" (looked up as "${key}"). Available: ${Object.keys(shaclFixtureText).join(', ')}`)
    }
    return text
}

export const CATEGORY_FOLDER: Record<ShaclCoreTestDef['category'], string> = {
    C1: 'C1-value-constraints',
    C2: 'C2-structural-paths',
    C3: 'C3-target-selection',
    C4: 'C4-authoring-guidance',
}

const RENDER_OUTCOME_NOTE: Record<ShaclRenderOutcome, string> = {
    'normal': 'The shape exposes sh:property statements (directly or via composition), so the root NodeShape renders an editable form as usual.',
    'empty-root-no-editor': 'This is a **value-only NodeShape** (constraints directly on the NodeShape, no `sh:property`). The current root renderer has no dedicated focus-node editor for this case (see thesis "Observed Limitations", Section 6.4) — an empty/near-empty form is **expected**, not a harness bug.',
    'no-root-shape': 'This fixture declares its constraining resource as a bare `sh:PropertyShape` (via `sh:path`) rather than wrapping it in a `sh:NodeShape`. `FormRootSelection` / `isNodeShape()` (`src/shacl/registry.ts`) only discover `sh:NodeShape` subjects, so **no root renders at all** — the form throws `shacl root node shape not found` (`src/form.ts:151`), observed directly when rendering this fixture. This is expected, and illustrates a real gap between this W3C test\'s shape and the UI\'s root-selection model rather than a harness bug.',
}

export interface ShaclCoreStoryArgs {
    shapesContent: string
}

export function renderShaclForm(args: ShaclCoreStoryArgs) {
    return renderShaclDemoPage(args)
}

export function buildShaclStoryObj(def: ShaclCoreTestDef): StoryObj<ShaclCoreStoryArgs> {
    const outcome = def.expectedRenderOutcome ?? 'normal'
    return {
        name: def.id,
        args: {
            shapesContent: loadFixture(def.shapesFile),
        },
        parameters: {
            docs: {
                description: {
                    story: [
                        `**W3C test:** \`${def.w3cTestId}\``,
                        `**Source:** ${def.sourceUrl}`,
                        `**Category:** ${def.category} (${CATEGORY_FOLDER[def.category]})`,
                        def.dataFile === def.shapesFile
                            ? '**Data graph:** this upstream W3C test uses the same file as both `shapesGraph` and `dataGraph` (self-contained validator test). Its embedded instance data is **not** loaded into this form as `data-values`: `src/loader.ts` loads shapes and values into the same `N3.Store` under separate named graphs, but `RdfReader.getSingleObject()` (`src/rdf/reader.ts:13`) queries across all graphs by default — feeding identical text into both would duplicate every shapes-defining triple and can break single-valued-constraint parsing (observed directly on `core/node/and-001`, which throws `Expected at most one object for predicate sh:and, but found 2` when wired that way). Only the shapes graph is rendered here.'
                            : `**Data graph:** \`${def.dataFile}\``,
                        `**Expected conformance (upstream sh:ValidationReport):** \`${def.expectedConformance}\``,
                        `**Expected render outcome:** \`${outcome}\` — ${RENDER_OUTCOME_NOTE[outcome]}`,
                    ].join('\n\n'),
                },
            },
        },
    }
}

export function toExportName(id: string): string {
    return id.replace(/-/g, '_')
}

// Fail if a category's test definitions and named story exports drift apart.
export function assertExportsMatch(categoryDefs: ShaclCoreTestDef[], declaredExportNames: string[]) {
    const expected = categoryDefs.map(def => toExportName(def.id)).sort()
    const declared = [...declaredExportNames].sort()
    if (JSON.stringify(expected) !== JSON.stringify(declared)) {
        throw new Error(`Story exports out of sync with evaluation/test-defs/shacl-core.ts.\nExpected: ${expected.join(', ')}\nDeclared: ${declared.join(', ')}`)
    }
}
