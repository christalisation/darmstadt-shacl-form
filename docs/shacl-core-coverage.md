# SHACL Core Coverage Matrix

This matrix audits the current project support after the RDF, SHACL semantic,
Form Shape, effective-shape-resolution, and rendering-adapter refactoring
passes. Form Shape records expose effective properties and focus-node value
constraints directly; no root/renderability classification is used.

Statuses:

- `Yes`: supported directly in that layer.
- `Partial`: represented or handled only for a constrained subset.
- `No`: not represented or not authorable in the current layer.
- `Delegated`: handled by the final `shacl-engine` validator rather than the form generator.

| Construct | Parsed | Projected | Authored | Validated | Notes |
| --- | --- | --- | --- | --- | --- |
| `sh:class` | Yes | Yes | Partial | Delegated | Projected as expected class and used to find compatible node shapes; authoring depends on existing nested/resource controls. |
| `sh:datatype` | Yes | Yes | Yes | Delegated | Drives literal editor selection and value-only shape constraints. |
| `sh:nodeKind` | Yes | Yes | Partial | Delegated | IRI/literal behavior is used by templates; not every node kind has distinct UI affordances. |
| `sh:node` | Yes | Yes | Partial | Delegated | Structural shapes become nested form references; value-only shapes contribute value constraints. |
| `sh:minCount` | Yes | Yes | Partial | Delegated | Required values are represented; UI does not fully enforce every cardinality workflow. |
| `sh:maxCount` | Yes | Yes | Partial | Delegated | Single/multiple controls use it; final correctness remains validator-backed. |
| `sh:minExclusive` | Yes | Yes | Partial | Delegated | Projected to numeric input metadata where applicable. |
| `sh:minInclusive` | Yes | Yes | Partial | Delegated | Projected to numeric input metadata where applicable. |
| `sh:maxExclusive` | Yes | Yes | Partial | Delegated | Projected through FormPropertyShape into the legacy numeric editor adapter where applicable. |
| `sh:maxInclusive` | Yes | Yes | Partial | Delegated | Projected to numeric input metadata where applicable. |
| `sh:minLength` | Yes | Yes | Yes | Delegated | Projected to editor attributes. |
| `sh:maxLength` | Yes | Yes | Yes | Delegated | Projected to editor attributes. |
| `sh:pattern` | Yes | Yes | Yes | Delegated | Projected to editor pattern/placeholder behavior. |
| `sh:languageIn` | Yes | Yes | Partial | Delegated | Language chooser support exists; full language-tag semantics remain validator-backed. |
| `sh:uniqueLang` | Yes | No | No | Delegated | Parsed semantically, not projected into deterministic form authoring. |
| `sh:in` | Yes | Yes | Yes | Delegated | Projected to enumerated choices. |
| `sh:hasValue` | Yes | Yes | Partial | Delegated | Projected through FormPropertyShape; current editing ensures the required value is present but does not make it exclusive. |
| `sh:equals` | Yes | No | Partial | Delegated | Parsed and final validation compares value sets. The generic form can author both predicates if both property shapes are present, but there is no ex-ante equals enforcement. |
| `sh:disjoint` | Yes | No | No | Delegated | Parsed but not projected or authored as linked value constraints. |
| `sh:lessThan` | Yes | No | No | Delegated | Parsed but not projected or authored as linked value constraints. |
| `sh:lessThanOrEquals` | Yes | No | No | Delegated | Parsed but not projected or authored as linked value constraints. |
| `sh:not` | Yes | No | No | Delegated | Kept semantic; not a deterministic form-generation structure. |
| `sh:and` | Yes | Yes | Partial | Delegated | Effective structural properties are resolved before Form Shape compilation. |
| `sh:or` | Yes | Yes | Partial | Delegated | Preserved as FormLogicalAlternative and used by logical-choice rendering; branch matching for existing data still has a legacy runtime fallback. |
| `sh:xone` | Yes | Yes | Partial | Delegated | Preserved as FormLogicalAlternative and used by logical-choice rendering; branch matching for existing data still has a legacy runtime fallback. |
| `sh:qualifiedValueShape` | Yes | Partial | Partial | Delegated | Shape and min/max counts are projected onto property metadata; full qualified authoring semantics are not modeled. |
| `sh:qualifiedMinCount` | Yes | Partial | Partial | Delegated | Projected only together with `sh:qualifiedValueShape`. |
| `sh:qualifiedMaxCount` | Yes | Partial | Partial | Delegated | Projected only together with `sh:qualifiedValueShape`. |
| `sh:qualifiedValueShapesDisjoint` | Yes | No | No | Delegated | Parsed in the semantic constraint, not currently projected. |
| `sh:closed` | Yes | No | No | Delegated | Parsed, but the UI does not author a closed-shape state model. |
| `sh:ignoredProperties` | Yes | No | No | Delegated | Parsed with `sh:closed`, not projected. |
| `sh:targetClass` | Yes | Yes | Partial | Delegated | Used as metadata and compatible-shape policy input; not automatically a root policy. |
| `sh:targetNode` | Yes | No | No | Delegated | Validation target only; not treated as an authoring root by itself. |
| `sh:targetSubjectsOf` | Yes | No | No | Delegated | Validation target only; not treated as a root heuristic. |
| `sh:targetObjectsOf` | Yes | No | No | Delegated | Validation target only; broad root fallback still exposes all NodeShapes because SHACL does not define form entry points. |
| Predicate path | Yes | Yes | Yes | Delegated | Main authored path type. |
| Alternative path | Yes | Yes | Partial | Delegated | UI can select among predicate alternatives; data provenance is not yet modeled. |
| Sequence path | Yes | Yes | No | Delegated | Syntax is represented, but current RDF binding cannot write arbitrary sequence paths. |
| Inverse path | Yes | Yes | No | Delegated | Syntax is represented, but current RDF binding cannot author inverse paths generically. |
| Zero-or-more path | Yes | Yes | No | Delegated | Syntax is represented, not authored. |
| One-or-more path | Yes | Yes | No | Delegated | Syntax is represented, not authored. |
| Zero-or-one path | Yes | Yes | No | Delegated | Syntax is represented, not authored. |
| `sh:message` | Yes | Yes | No | Delegated | Preserved as validation-message metadata; validation report messages come from `shacl-engine`. |
