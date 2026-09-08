// Plain data only — no logic. Each entry describes one W3C SHACL Data Shapes
// Test Suite case (validate-rdf-data tests) used to drive a Storybook story
// that renders the test's shapes graph through the <shacl-form> component.
//
// Fixtures are verbatim copies of the official test files fetched from the
// W3C data-shapes repo (gh-pages branch), which combines the shapes graph,
// data graph, and expected sh:ValidationReport in a single Turtle file
// (mf:action sht:shapesGraph <> ; sht:dataGraph <> ;).
//
// See thesis Section 3.4 (Comparative Methodology) for the C1-C4
// classification and Section 3.5 (Table tab:feature-comparison) for the
// specific features these categories track.

export type ShaclCoreCategory = 'C1' | 'C2' | 'C3' | 'C4'

// "normal": a NodeShape root is discovered and renders its properties as usual.
// "empty-root-no-editor": a NodeShape root is discovered, but it is value-only
//   (constraints directly on the NodeShape, no sh:property) — the current
//   root renderer has no dedicated focus-node editor for this case (see
//   thesis "Observed Limitations", Section 6.4). An empty/near-empty form is
//   expected, not a harness bug.
// "no-root-shape": the fixture's shape is not discoverable as a form root at
//   all. E.g. core/path/path-alternative-001 declares its constraining
//   resource as a bare sh:PropertyShape (via sh:path) rather than wrapping it
//   in a sh:NodeShape; src/shacl/registry.ts's isNodeShape() explicitly
//   excludes any term carrying sh:path, and FormRootSelection only discovers
//   sh:NodeShape subjects. Loaded standalone, this fixture yields zero root
//   candidates, so no form renders at all.
export type ShaclRenderOutcome = 'normal' | 'empty-root-no-editor' | 'no-root-shape'

export interface ShaclCoreTestDef {
    id: string
    category: ShaclCoreCategory
    w3cTestId: string
    shapesFile: string
    dataFile?: string
    expectedConformance: boolean
    expectedRenderOutcome?: ShaclRenderOutcome
    sourceUrl: string
}

export const shaclCoreTestDefs: ShaclCoreTestDef[] = [
    {
        id: 'core-property-datatype-001',
        category: 'C1',
        w3cTestId: 'core/property/datatype-001',
        shapesFile: 'fixtures/shacl/core-property-datatype-001.ttl',
        dataFile: 'fixtures/shacl/core-property-datatype-001.ttl',
        expectedConformance: false,
        expectedRenderOutcome: 'normal',
        sourceUrl: 'https://w3c.github.io/data-shapes/data-shapes-test-suite/tests/core/property/datatype-001.ttl',
    },
    {
        id: 'core-node-and-001',
        category: 'C2',
        w3cTestId: 'core/node/and-001',
        shapesFile: 'fixtures/shacl/core-node-and-001.ttl',
        dataFile: 'fixtures/shacl/core-node-and-001.ttl',
        expectedConformance: false,
        expectedRenderOutcome: 'normal',
        sourceUrl: 'https://w3c.github.io/data-shapes/data-shapes-test-suite/tests/core/node/and-001.ttl',
    },
    {
        id: 'core-path-path-alternative-001',
        category: 'C2',
        w3cTestId: 'core/path/path-alternative-001',
        shapesFile: 'fixtures/shacl/core-path-path-alternative-001.ttl',
        dataFile: 'fixtures/shacl/core-path-path-alternative-001.ttl',
        expectedConformance: false,
        expectedRenderOutcome: 'no-root-shape',
        sourceUrl: 'https://w3c.github.io/data-shapes/data-shapes-test-suite/tests/core/path/path-alternative-001.ttl',
    },
    {
        id: 'core-targets-targetClass-001',
        category: 'C3',
        w3cTestId: 'core/targets/targetClass-001',
        shapesFile: 'fixtures/shacl/core-targets-targetClass-001.ttl',
        dataFile: 'fixtures/shacl/core-targets-targetClass-001.ttl',
        expectedConformance: false,
        expectedRenderOutcome: 'normal',
        sourceUrl: 'https://w3c.github.io/data-shapes/data-shapes-test-suite/tests/core/targets/targetClass-001.ttl',
    },
    {
        id: 'core-misc-message-001',
        category: 'C4',
        w3cTestId: 'core/misc/message-001',
        shapesFile: 'fixtures/shacl/core-misc-message-001.ttl',
        dataFile: 'fixtures/shacl/core-misc-message-001.ttl',
        expectedConformance: false,
        expectedRenderOutcome: 'empty-root-no-editor',
        sourceUrl: 'https://w3c.github.io/data-shapes/data-shapes-test-suite/tests/core/misc/message-001.ttl',
    },
]
