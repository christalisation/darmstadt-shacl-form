# RML Core + IO fixture provenance

The RML demo (`rml/index.html`), the unit tests and the RML browser smoke test
load three files and concatenate them in this order:

1. `rml/core-authoring.ttl`
2. `rml/io.ttl`
3. `rml/authoring-overlay.ttl`

## Upstream sources

- RML-Core repository: `kg-construct/rml-core`
- RML-Core commit: `82ab28d46803ba66a83c133f1db371a60116f84d`
- RML-Core file: `shapes/core.ttl`
- RML-IO repository: `kg-construct/rml-io`
- RML-IO commit: `980b90626d86394af91ed606f8493927d59d5e67`
- RML-IO file: `shapes/io.ttl`

## Local history

- Commit `6f6b9c9` (`add RML-core & -io`) introduced a single combined fixture
  `rml/rml-core-io.ttl`.
- Commit `13acb6e` (`rml shapes used for authoring`) replaced it with the three
  files above. `rml/rml-core-io.ttl` and the older `rml/core.ttl`,
  `rml/core-davan.ttl`, `rml/rml-shape*.ttl`, `rml/rml-data.ttl` are no longer
  in the repository.

## Deviations from upstream

### `rml/core-authoring.ttl`

One change, stated in the file header: in `RMLTriplesMapPropertiesShape`, the
`sh:node` of the `rml:logicalSource` property is `RMLLogicalSourceShape`
(RML-IO) instead of `RMLAbstractLogicalSourceShape`. The original line is kept
as a comment.

### `rml/authoring-overlay.ttl`

An application authoring profile, not an upstream RML SHACL claim. It adds two
same-focus `sh:node` bridges:

```turtle
<http://w3id.org/rml/shapes/RMLLogicalSourceShape>
    sh:node <http://w3id.org/rml/shapes/RMLAbstractLogicalSourceShape> .

<http://w3id.org/rml/shapes/RMLSourceShape>
    sh:node <http://w3id.org/rml/shapes/RMLRelativePathSourceShape> .
```

The first exposes the Core iterable properties (`rml:referenceFormulation`,
`rml:iterator`) on a logical source. The second means the thesis demo authors
sources as relative path sources while preserving the upstream
`RMLSourceShape` definition. It should not be cited as evidence that every RML
source is necessarily a relative path source.

## `owl:imports`

`rml/io.ttl` contains `owl:imports <http://w3id.org/rml/core/shapes>`. With the
default behaviour of `<shacl-form>` the import is fetched and stored in a
separate graph, so every Core shape is present twice (local copy and imported
copy). SHACL-SHACL validation then fails, for example with two `sh:in` values
on `RMLStrategyAppendShape`. All consumers of these fixtures therefore set
`data-ignore-owl-imports`.

## Generated `rdf:type` triples

The form types an authored node with the `sh:targetClass` values of its shape
and of the shapes composed into it through node-level `sh:node` / `sh:and`.
With these fixtures this yields, beyond the shape's own class:

| Shape | Additional types |
| --- | --- |
| `RMLTriplesMapShape` | `rml:NonAssertedTriplesMap` |
| `RMLLogicalSourceShape` | `rml:AbstractLogicalSource`, `rml:Iterable` |
| `RMLAbstractLogicalSourceShape` | `rml:Iterable` |
| `RMLSourceShape` | `rml:RelativePathSource` |

Measured with RMLMapper 8.0.0 on test case RMLTC0001a-JSON: removing
`rml:RelativePathSource` makes the mapper fail; removing the other additional
types does not change the output. Whether `rml:NonAssertedTriplesMap` should be
generated is an open design decision (see the workspace `DESIGN_DECISIONS.md`).
