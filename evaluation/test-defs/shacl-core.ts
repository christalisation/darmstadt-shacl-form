// W3C SHACL Core cases used by the static Storybook evaluation stories.

export type ShaclCoreCategory = 'C1' | 'C2' | 'C3' | 'C4'

// normal: a NodeShape renders its properties. empty-root-no-editor: value-only NodeShapes have no focus-node editor. no-root-shape: a bare PropertyShape is not discovered as a form root.
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
        shapesFile: 'evaluation/fixtures/shacl/core-property-datatype-001.ttl',
        dataFile: 'evaluation/fixtures/shacl/core-property-datatype-001.ttl',
        expectedConformance: false,
        expectedRenderOutcome: 'normal',
        sourceUrl: 'https://w3c.github.io/data-shapes/data-shapes-test-suite/tests/core/property/datatype-001.ttl',
    },
    {
        id: 'core-node-and-001',
        category: 'C2',
        w3cTestId: 'core/node/and-001',
        shapesFile: 'evaluation/fixtures/shacl/core-node-and-001.ttl',
        dataFile: 'evaluation/fixtures/shacl/core-node-and-001.ttl',
        expectedConformance: false,
        expectedRenderOutcome: 'normal',
        sourceUrl: 'https://w3c.github.io/data-shapes/data-shapes-test-suite/tests/core/node/and-001.ttl',
    },
    {
        id: 'core-path-path-alternative-001',
        category: 'C2',
        w3cTestId: 'core/path/path-alternative-001',
        shapesFile: 'evaluation/fixtures/shacl/core-path-path-alternative-001.ttl',
        dataFile: 'evaluation/fixtures/shacl/core-path-path-alternative-001.ttl',
        expectedConformance: false,
        expectedRenderOutcome: 'no-root-shape',
        sourceUrl: 'https://w3c.github.io/data-shapes/data-shapes-test-suite/tests/core/path/path-alternative-001.ttl',
    },
    {
        id: 'core-targets-targetClass-001',
        category: 'C3',
        w3cTestId: 'core/targets/targetClass-001',
        shapesFile: 'evaluation/fixtures/shacl/core-targets-targetClass-001.ttl',
        dataFile: 'evaluation/fixtures/shacl/core-targets-targetClass-001.ttl',
        expectedConformance: false,
        expectedRenderOutcome: 'normal',
        sourceUrl: 'https://w3c.github.io/data-shapes/data-shapes-test-suite/tests/core/targets/targetClass-001.ttl',
    },
    {
        id: 'core-misc-message-001',
        category: 'C4',
        w3cTestId: 'core/misc/message-001',
        shapesFile: 'evaluation/fixtures/shacl/core-misc-message-001.ttl',
        dataFile: 'evaluation/fixtures/shacl/core-misc-message-001.ttl',
        expectedConformance: false,
        expectedRenderOutcome: 'empty-root-no-editor',
        sourceUrl: 'https://w3c.github.io/data-shapes/data-shapes-test-suite/tests/core/misc/message-001.ttl',
    },
]
