# Test Suite Map

This directory intentionally stays small. Tests are grouped by layer or by
observable browser workflow rather than by source file under test.

## Test Files

| File | Classification | Purpose |
| --- | --- | --- |
| `shacl-semantic-layer.test.ts` | unit; semantic/model | SHACL parser and RDF reader coverage for NodeShapes, PropertyShapes, constraints, paths, metadata, and RDF list extraction. |
| `shape-layers.test.ts` | semantic/model; focused regression | SHACL registry, Form Shape registry, and root-selection coverage for root discovery, anonymous NodeShapes, broad NodeShape availability, value-only root availability, path parsing, labels, groups, and rendering-facing helpers. |
| `form-shape-compiler.test.ts` | semantic/model; focused regression; RML reproducibility | Form Shape projection coverage for datatype/cardinality/value constraints, descriptions/messages, nested `sh:node`, same-focus node-level `sh:node`, `sh:and`, anonymous branches, logical alternatives, target-derived value shapes, compatible node-shape discovery, cycles, and RML effective structures. |
| `w3c-derived-form-fixtures.test.ts` | focused regression; semantic/model | W3C SHACL Core-derived fixtures for `maxExclusive`, `equals`, and `hasValue`, separating parser/projection/editor-adapter support from final validation support. |
| `node-logical-rdf.test.ts` | DOM-level (happy-dom); focused regression | RDF output and validation of node-level `sh:or` / `sh:xone` branches. |
| `existing-values.test.ts` | DOM-level (happy-dom); focused regression | Loading an existing data graph: values on plain predicate paths and on `sh:alternativePath` branches survive a load/serialise round trip. |
| `node-reuse.test.ts` | DOM-level (happy-dom); focused regression | Reusing a node authored in the form (IRI and blank node, shape with and without `sh:targetClass`, plain and `sh:or` properties); loaded data that references one blank node twice. |
| `multiple-value-shapes.test.ts` | DOM-level (happy-dom); focused regression | Repeated property-level `sh:node` and `sh:and` author a single value node; warning for logical constraints the value editor cannot follow. |
| `support/dom-form.ts` | test helper | Shared setup and interaction helpers for the DOM-level tests. |
| `browser-smoke.mjs` | browser smoke; runtime regression | Generic browser workflow coverage for rendering, nested property-level `sh:node`, generated/editable node IDs, blank node display, alternative paths, unavailable alternative branches, reuse compatibility, multiple roots, validation, and serialization. |
| `rml-browser-smoke.mjs` | RML browser smoke; reproducibility fixture | End-to-end RML demo coverage using the three active RML fixtures (with `data-ignore-owl-imports`, as in the demo), including SubjectMap/ObjectMap flows, PredicateObjectMap, RefObjectMap, Join/JoinCondition, node reuse, lazy logical option instantiation, RelativePathSource, validation, and exported Turtle structure. |

## Fixture Classification

| Fixture | Classification | Notes |
| --- | --- | --- |
| `rml/core-authoring.ttl` | reproducibility fixture; pinned external material with one documented change | Active RML test/demo input. Provenance is documented in `docs/rml-fixture-provenance.md`. |
| `rml/io.ttl` | reproducibility fixture; pinned external material | Active RML test/demo input. Declares `owl:imports` of the upstream Core shapes, hence `data-ignore-owl-imports`. |
| `rml/authoring-overlay.ttl` | locally authored regression/demo fixture | Thesis authoring profile loaded after the two files above; not an upstream SHACL claim. |
| `evaluation/suites/**` | authoring test cases | Executed by the Storybook Vitest project (`npm run test:stories`). |
| `evaluation-old/**` | previous evaluation fixtures and stories | Not loaded by Storybook. `evaluation-old/test-defs/rml.ts` and its fixtures are still used by `scripts/verify-rml.mjs`. |
| `demo/*.ttl`, `demo/theme-*.html`, `demo/index.html` | demo-only; inherited upstream/Darmstadt material | Retained for compatibility and provenance. They are not the thesis RML reproducibility fixtures. |

## Deliberate Non-Coverage

The following are known limitations and should not receive passing tests that
imply the behaviour exists:

- general required single-valued node replace/relink;
- root clear/reset;
- independent focus-node editing for value-only root NodeShapes;
- generic same-path PropertyShape merging.

Overlap between semantic tests and browser smoke tests is intentional when they
exercise different layers or observables. For example, Form Shape projection of
an alternative path and browser authoring of the selected predicate are kept as
separate evidence.
