# RML Core + IO fixture provenance

`rml/rml-core-io.ttl` is a combined thesis/demo fixture.

## Local history

- Introduced locally by commit `6f6b9c9` (`add RML-core & -io`).
- The original local fixture included the RML-Core shape definitions and a combined `RMLLogicalSourceShape`.
- Before the fixture audit, `RMLLogicalSourceShape` referenced `RMLSourceShape`, but the source/target shape definitions from RML-IO were absent.

## Upstream sources

- RML-Core repository: `kg-construct/rml-core`
- RML-Core commit: `82ab28d46803ba66a83c133f1db371a60116f84d`
- RML-Core file: `shapes/core.ttl`
- RML-IO repository: `kg-construct/rml-io`
- RML-IO commit: `980b90626d86394af91ed606f8493927d59d5e67`
- RML-IO file: `shapes/io.ttl`
- RML-IO ontology checked for subclass evidence: `ontology/rml-io.owl`

## Deliberate combination

The fixture keeps the local combined `RMLLogicalSourceShape` instead of replacing it verbatim with the RML-IO shape. The upstream RML-IO `RMLLogicalSourceShape` points to `RMLSourceShape`, but does not include the node-level `sh:node` link to the Core `RMLAbstractLogicalSourceShape`.

The thesis fixture needs that same-focus relationship so `RMLLogicalSourceShape` exposes the Core iterable properties:

- `rml:referenceFormulation`
- `rml:iterator`

The missing RML-IO source/target definitions were added from `kg-construct/rml-io` commit `980b90626d86394af91ed606f8493927d59d5e67`:

- `RMLLogicalTargetShape`
- `RMLRelativePathSourceShape`
- `RMLRelativePathTargetShape`
- `RMLSourceShape`
- `RMLTargetShape`

## Thesis authoring profile

The pinned combined fixture is loaded together with `rml/authoring-overlay.ttl`
in the RML demo. The overlay is an application authoring profile, not an
upstream RML SHACL claim.

It currently adds same-focus `sh:node` bridges:

```turtle
<http://w3id.org/rml/shapes/RMLLogicalSourceShape>
    sh:node <http://w3id.org/rml/shapes/RMLAbstractLogicalSourceShape> .

<http://w3id.org/rml/shapes/RMLSourceShape>
    sh:node <http://w3id.org/rml/shapes/RMLRelativePathSourceShape> .
```

The second bridge means the thesis demo authors sources as relative path
sources while preserving the upstream `RMLSourceShape` definition. It should
not be cited as evidence that every RML source is necessarily a relative path
source.
