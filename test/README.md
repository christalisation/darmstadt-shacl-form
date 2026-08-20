# Test Suite Map

This directory intentionally stays small. Tests are grouped by layer or by
observable browser workflow rather than by source file under test.

## Test Files

| File | Classification | Purpose |
| --- | --- | --- |
| `shacl-semantic-layer.test.ts` | unit; semantic/model | SHACL parser and RDF reader coverage for NodeShapes, PropertyShapes, constraints, paths, metadata, and RDF list extraction. |
| `shape-graph-model.test.ts` | semantic/model; focused regression | Compatibility facade coverage for root discovery, anonymous NodeShapes, broad NodeShape availability, value-only root availability, path parsing, labels, groups, and serialization-facing helpers. |
| `form-shape-compiler.test.ts` | semantic/model; focused regression; RML reproducibility | Form Shape projection coverage for datatype/cardinality/value constraints, descriptions/messages, nested `sh:node`, same-focus node-level `sh:node`, `sh:and`, anonymous branches, logical alternatives, target-derived value shapes, compatible node-shape discovery, cycles, and RML effective structures. |
| `w3c-derived-form-fixtures.test.ts` | focused regression; semantic/model | W3C SHACL Core-derived fixtures for `maxExclusive`, `equals`, and `hasValue`, separating parser/projection/editor-adapter support from final validation support. |
| `browser-smoke.mjs` | browser smoke; runtime regression | Generic browser workflow coverage for rendering, nested property-level `sh:node`, generated/editable node IDs, blank node display, alternative paths, unavailable alternative branches, reuse compatibility, multiple roots, validation, and serialization. |
| `rml-browser-smoke.mjs` | RML browser smoke; reproducibility fixture | End-to-end RML demo coverage using the pinned Core+IO fixture and thesis authoring overlay, including SubjectMap/ObjectMap flows, PredicateObjectMap, RefObjectMap, Join/JoinCondition, node reuse, lazy logical option instantiation, RelativePathSource, validation, and exported Turtle structure. |

## Fixture Classification

| Fixture | Classification | Notes |
| --- | --- | --- |
| `rml/rml-core-io.ttl` | reproducibility fixture; official/pinned external material with documented local combination | Active RML test/demo input. Provenance is documented in `docs/rml-fixture-provenance.md`. |
| `rml/core.ttl` | official/pinned external fixture | Retained as the upstream Core source used to construct the combined thesis fixture. |
| `rml/io.ttl` | official/pinned external fixture | Retained as the upstream IO source used to construct the combined thesis fixture. |
| `rml/authoring-overlay.ttl` | locally authored regression/demo fixture | Thesis authoring profile loaded with the pinned RML fixture; not an upstream SHACL claim. |
| `rml/core-davan.ttl` | historical fixture | Retained as thesis provenance for earlier RML work; not an active regression input. |
| `rml/rml-shape.ttl`, `rml/rml-shape-complex.ttl`, `rml/rml-shape-ui.ttl`, `rml/rml-data.ttl` | historical/demo fixtures | Retained for project provenance and older demo material; the active RML regression path uses `rml-core-io.ttl` plus `authoring-overlay.ttl`. |
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
