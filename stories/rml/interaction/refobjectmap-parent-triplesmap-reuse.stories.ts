// Interaction regression story — NOT a static fixture catalogue entry.
//
// Covers a currently-uncovered cross-resource-identity workflow: reusing an
// already-authored TriplesMap as a RefObjectMap's rml:parentTriplesMap. The
// generic browser smoke tests (test/rml-browser-smoke.mjs) check that
// RefObjectMap exposes a parentTriplesMap property, but do not exercise
// reusing an existing TriplesMap through it with more than one candidate
// present. See file header of stories/rml/interaction/_shared.ts for the
// shared interaction techniques used here.
//
// Initial state (two existing, already-authored TriplesMaps) is loaded via
// `data-values` rather than authored live — authoring a valid rml:TriplesMap
// from scratch requires filling a nested rml:logicalSource (source,
// referenceFormulation, iterator) that is orthogonal to the parentTriplesMap
// reuse interaction under test here. Loading known-valid existing resources
// keeps this story focused on that one interaction, matching the "Initial
// state: ... already authored / exist" framing used for both regression
// stories in this folder.
//
// Note: unlike the alternativePath reuse in objectmap-alternative-path-reuse
// (which renders the reused node as a collapsed `.reference-editor`), this
// plain sh:class-based reuse (src/dom-form/property.ts
// refreshAddButtonOptions, not refreshAlternativePathAddButtonOptions)
// renders the reused node as a fully expanded, editable nested
// <shacl-node data-node-id="...">. That is expected — the assertions below
// verify RDF identity is preserved (same node id, single serialized
// resource), not any particular rendering shape.
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { html } from 'lit'
import { expect } from 'storybook/test'
import { Parser as N3Parser, DataFactory } from 'n3'
import { rmlShapesGraph } from '../shapes'
import { findProperty, reuseExistingNode, selectRootShape, waitForFormReady } from './_shared'

const TRIPLES_MAP_1_ID = 'http://example.org/existing-triplesmap-1'
const TRIPLES_MAP_2_ID = 'http://example.org/existing-triplesmap-2'

const existingValues = `
@prefix rml: <http://w3id.org/rml/> .
<${TRIPLES_MAP_1_ID}> a rml:TriplesMap ;
    rml:subject <http://example.org/existing-subject-1> ;
    rml:logicalSource [
        a rml:LogicalSource ;
        rml:source "existing1.csv" ;
        rml:referenceFormulation rml:CSV ;
    ] .
<${TRIPLES_MAP_2_ID}> a rml:TriplesMap ;
    rml:subject <http://example.org/existing-subject-2> ;
    rml:logicalSource [
        a rml:LogicalSource ;
        rml:source "existing2.csv" ;
        rml:referenceFormulation rml:CSV ;
    ] .
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
}
export default meta

export const RefObjectMapParentTriplesMapReuse: StoryObj<Args> = {
    name: 'RefObjectMap parentTriplesMap reuse',
    args: {
        valuesContent: existingValues,
    },
    play: async ({ canvasElement }) => {
        const form = canvasElement.querySelector('shacl-form') as HTMLElement & { serialize(): string }
        await waitForFormReady(form)

        const refObjectMapRoot = selectRootShape(form, 'RefObjectMap')
        const parentProperty = findProperty(refObjectMapRoot, 'parentTriplesMap')
        if (!parentProperty) {
            throw new Error('parentTriplesMap property not found on RefObjectMap root')
        }

        // Sanity check on the initial state: both existing TriplesMaps must
        // be offered, not just the one we are about to pick.
        const menuText = parentProperty.querySelector(':scope > .add-button')?.textContent || ''
        await expect(menuText.includes(TRIPLES_MAP_1_ID), `reuse menu should list ${TRIPLES_MAP_1_ID}:\n${menuText}`).toBe(true)
        await expect(menuText.includes(TRIPLES_MAP_2_ID), `reuse menu should list ${TRIPLES_MAP_2_ID}:\n${menuText}`).toBe(true)

        // The actual interaction under test: reuse TriplesMap #1 specifically.
        const instance = await reuseExistingNode(parentProperty, TRIPLES_MAP_1_ID)

        // Assertion 1: the existing node reference is rendered (by RDF node
        // id, not by re-authoring an equivalent-looking duplicate).
        const nestedNode = instance.querySelector<HTMLElement>('shacl-node')
        await expect(nestedNode, 'reused parentTriplesMap should render the existing TriplesMap node').not.toBeNull()
        await expect(nestedNode!.dataset.nodeId).toBe(TRIPLES_MAP_1_ID)

        // Assertion 2 (RDF-level): the selected RDF node identity is
        // preserved — the exact expected quad is present, TriplesMap #1's
        // own data still hangs off the SAME subject, and no duplicate
        // TriplesMap resource was created for the reuse.
        const turtle = form.serialize()
        const quads = new N3Parser({ format: 'text/turtle' }).parse(turtle)
        const parentTriplesMapPredicate = DataFactory.namedNode('http://w3id.org/rml/parentTriplesMap')
        const triplesMap1Node = DataFactory.namedNode(TRIPLES_MAP_1_ID)
        const parentLinkQuads = quads.filter(quad => quad.predicate.equals(parentTriplesMapPredicate))

        // Exactly one rml:parentTriplesMap link, pointing at TriplesMap #1
        // specifically (not #2, and not a duplicate of either).
        await expect(parentLinkQuads.length, `expected exactly one rml:parentTriplesMap link, found ${parentLinkQuads.length}:\n${turtle}`).toBe(1)
        await expect(parentLinkQuads[0]?.object.equals(triplesMap1Node), `rml:parentTriplesMap should point at <${TRIPLES_MAP_1_ID}>:\n${turtle}`).toBe(true)

        // TriplesMap #1 is pulled into the serialized tree (it is now nested
        // under the active RefObjectMap root) — its OWN pre-existing
        // rml:subject must still be attached to the SAME node, not
        // duplicated or dropped, proving RDF identity was preserved rather
        // than the node being re-authored from scratch.
        const subjectQuadsForTriplesMap1 = quads.filter(quad =>
            quad.subject.equals(triplesMap1Node) && quad.predicate.value === 'http://w3id.org/rml/subject'
        )
        await expect(subjectQuadsForTriplesMap1.length, `TriplesMap #1's own rml:subject should still be attached to the same node:\n${turtle}`).toBe(1)
        await expect(subjectQuadsForTriplesMap1[0]?.object.value).toBe('http://example.org/existing-subject-1')

        // TriplesMap #2 was never touched/referenced, so it correctly does
        // NOT appear in this serialization (toRDF() walks the committed/
        // active root subtree, not the whole background data-values store) —
        // and, more importantly, no SECOND TriplesMap resource was created
        // as a byproduct of the reuse action.
        const triplesMapTypeQuads = quads.filter(quad =>
            quad.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
            quad.object.value === 'http://w3id.org/rml/TriplesMap'
        )
        await expect(triplesMapTypeQuads.length, `expected exactly one rml:TriplesMap resource (the reused one, no duplicate), found ${triplesMapTypeQuads.length}:\n${turtle}`).toBe(1)
        await expect(triplesMapTypeQuads[0]?.subject.equals(triplesMap1Node)).toBe(true)
    },
}
