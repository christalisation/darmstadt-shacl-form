// Interaction regression story — NOT a static fixture catalogue entry.
//
// Historical bug this guards against: selecting an existing, already-
// authored ObjectMap through a predicateObjectMap's
// object/objectMap/quotedTriplesMap alternativePath "Or link existing:"
// action incorrectly re-opened the objectMap branch's inner sh:or selector
// (ObjectMap / RefObjectMap / StarMap) instead of rendering the picked node
// as a direct RDF reference. This story replays exactly that sequence and
// asserts the three properties that must hold for the fix to stay fixed.
//
// Initial state (an existing compatible ObjectMap already authored) is
// loaded via `data-values` rather than authored live in this play() function
// — the interaction under test is the REUSE action itself, not the
// unrelated multi-step process of authoring a valid ObjectMap from scratch.
//
// This story is exercised by the same Storybook test-runner sweep that
// produces the Stage 2 screenshots (no separate CI pipeline): a failing
// expect() inside play() fails that run the same way a broken static story
// would.
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { html } from 'lit'
import { expect } from 'storybook/test'
import { Parser as N3Parser, DataFactory } from 'n3'
import { rmlShapesGraph } from '../shapes'
import { createAlternativePathBranch, findProperty, reuseAlternativePathBranch, selectRootShape, waitForFormReady } from './_shared'

const EXISTING_OBJECTMAP_ID = 'http://example.org/existing-objectmap'

const existingValues = `
@prefix rml: <http://w3id.org/rml/> .
<${EXISTING_OBJECTMAP_ID}> a rml:ObjectMap ;
    rml:reference "$.Existing" .
`

interface Args {
    valuesContent: string
}

const meta: Meta<Args> = {
    title: 'RML/interaction',
    render: args => html`
        <shacl-form
            data-shapes=${rmlShapesGraph}
            data-values=${args.valuesContent}
            data-values-namespace="http://example.org/"
            data-ignore-owl-imports
        ></shacl-form>
    `,
    parameters: {
        docs: {
            description: {
                component: 'Interaction regression stories using Storybook play(). These test authoring SEQUENCES (reuse-through-alternativePath, cross-resource identity), complementing the static fixture stories and test/rml-browser-smoke.mjs rather than replacing them. See file header comments for the specific historical bug each story guards against.',
            },
        },
    },
}
export default meta

export const ObjectMapReuseThroughAlternativePath: StoryObj<Args> = {
    name: 'objectMap reuse through alternativePath + sh:or',
    args: {
        valuesContent: existingValues,
    },
    play: async ({ canvasElement }) => {
        const form = canvasElement.querySelector('shacl-form') as HTMLElement & { serialize(): string }
        await waitForFormReady(form)

        const triplesMapRoot = selectRootShape(form, 'TriplesMap')
        const pomProperty = findProperty(triplesMapRoot, 'predicateObjectMap')
        if (!pomProperty) {
            throw new Error('predicateObjectMap property not found on TriplesMap root')
        }
        pomProperty.addPropertyInstance()
        await new Promise(resolve => setTimeout(resolve, 150))
        const pomNodes = [...pomProperty.querySelectorAll('shacl-node')]
        const pomNode = pomNodes[pomNodes.length - 1]
        if (!pomNode) {
            throw new Error('adding a predicateObjectMap instance did not render a nested shacl-node')
        }

        const objectAlternative = findProperty(pomNode, 'object/objectMap/quotedTriplesMap')
        if (!objectAlternative) {
            throw new Error('object/objectMap/quotedTriplesMap alternativePath property not found on PredicateObjectMap')
        }

        // The actual interaction under test: reuse the existing ObjectMap
        // directly from the alternativePath add-button, WITHOUT first going
        // through "Create new objectMap..." + the inner sh:or selector.
        const instance = await reuseAlternativePathBranch(objectAlternative, 'objectMap', EXISTING_OBJECTMAP_ID)

        // Assertion 1: the selected RDF node is rendered as a direct reference.
        const referenceEditor = instance.querySelector<HTMLInputElement>('.reference-editor')
        await expect(referenceEditor, 'reused objectMap should render a .reference-editor pointing at the existing node').not.toBeNull()
        await expect(referenceEditor!.value).toBe(EXISTING_OBJECTMAP_ID)

        // Assertion 2: "Select alternative" (the inner sh:or picker for
        // ObjectMap/RefObjectMap/StarMap) is NOT reopened.
        const reopenedLogicalSelect = instance.querySelector(':scope > div > select')
        await expect(reopenedLogicalSelect, 'inner sh:or selector must not be reopened for a reused node').toBeNull()

        // Assertion 3: no duplicate nested ObjectMap is created.
        await expect(instance.querySelectorAll('shacl-node').length).toBe(0)

        // Assertion 4 (RDF-level, not just DOM): the exact expected quad is
        // present in the serialized graph.
        const turtle = form.serialize()
        const quads = new N3Parser({ format: 'text/turtle' }).parse(turtle)
        const objectMapPredicate = DataFactory.namedNode('http://w3id.org/rml/objectMap')
        const existingObjectMapNode = DataFactory.namedNode(EXISTING_OBJECTMAP_ID)
        const objectMapLinkQuads = quads.filter(quad => quad.predicate.equals(objectMapPredicate))

        // Exactly one rml:objectMap link, pointing at the existing node — not
        // zero (reuse failed silently) and not two (a duplicate ObjectMap was
        // also authored). The existing ObjectMap's OWN triples (its
        // rml:reference etc.) are intentionally not re-emitted here: it was
        // preloaded via data-values, not committed as its own root, and
        // toRDF() walks committed/active root subtrees, not the whole
        // background store — a linked reference is expected to appear only
        // as this one pointer, not as a re-serialized duplicate resource.
        await expect(objectMapLinkQuads.length, `expected exactly one rml:objectMap link, found ${objectMapLinkQuads.length}:\n${turtle}`).toBe(1)
        await expect(objectMapLinkQuads[0]?.object.equals(existingObjectMapNode), `rml:objectMap should point at <${EXISTING_OBJECTMAP_ID}>:\n${turtle}`).toBe(true)
    },
}
