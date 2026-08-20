# SHACL Form Generator - Thesis Extension

This repository is a thesis implementation based on the upstream
[`ULB-Darmstadt/shacl-form`](https://github.com/ULB-Darmstadt/shacl-form)
web component.

The thesis work investigates SHACL-driven RDF graph authoring. The main
demonstration use case is authoring non-trivial
[RML](https://rml.io/) mapping graphs from SHACL shapes while keeping the core
form generator vocabulary-independent.

## Public Demos

The intended static deployment exposes two entry points:

- `/` - generic SHACL form generator. No RML shapes are loaded by default; paste
  or load a Shapes Graph to generate a form.
- `/rml/` - RML authoring demo. Loads the pinned RML Core + RML IO shapes and
  the local thesis authoring overlay.

For local development, these are available through `npm run dev` at:

- `http://localhost:5173/`
- `http://localhost:5173/rml/`

The inherited Darmstadt demo remains under `demo/` for compatibility and
provenance, but it is not the primary public thesis navigation.

## Main Capabilities

This implementation supports a practical subset of SHACL for form generation.
It does **not** claim complete SHACL Core authoring coverage.

Currently demonstrated capabilities include:

- multiple root form instances in the same authored RDF graph;
- nested RDF resources through node-valued properties;
- node reuse while preserving RDF node identity;
- authoring-projectable `sh:or` / `sh:xone` alternatives;
- SHACL path parsing, including `sh:alternativePath`;
- branch-specific alternative-path authoring where branch constraints are
  available;
- same-focus composition through `sh:and` and node-level `sh:node`;
- value-node constraints derived from property-local constraints and
  `sh:targetObjectsOf`;
- SHACL validation of the generated data graph;
- RDF/Turtle output from the authored graph.

## Architecture Overview

The current implementation is organized around these layers:

```text
SHACL Shapes Graph
    -> SHACL Semantic Model
    -> Form Shape Model
    -> DOM-backed authoring/runtime UI
    -> RDF graph serialization
    -> SHACL validation
```

Important source directories:

- [`src/rdf/`](src/rdf/) - generic RDF parsing/reading helpers.
- [`src/shacl/`](src/shacl/) - SHACL semantic records, parser, path model,
  shape registry and effective-shape resolver.
- [`src/form-shape/`](src/form-shape/) - form-oriented projection of SHACL
  semantics and root-selection policy.
- [`src/dom-form/`](src/dom-form/) - current DOM-backed authoring/rendering
  implementation.
- [`src/themes/`](src/themes/) and [`src/plugins/`](src/plugins/) - presentation
  themes and editor plugins inherited/adapted from the upstream project.

An independent Form Data Model is intentionally **not** implemented yet; runtime
authoring state is still partly owned by DOM components.

## Local Development

Install dependencies:

```console
npm install
```

Start the development server:

```console
npm run dev
```

Run unit and semantic regression tests:

```console
npm test
```

Build the package bundles:

```console
npm run build
```

Build the static public demo site:

```console
npm run build:site
```

Run browser smoke tests:

```console
node test/browser-smoke.mjs
node test/rml-browser-smoke.mjs
```

## Basic Web Component Usage

```html
<script type="module" src="./dist/form-default.js"></script>

<shacl-form
  data-shapes="
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix ex: <http://example.org/> .

    ex:ExampleShape
      a sh:NodeShape ;
      sh:property [
        sh:path ex:title ;
        sh:name 'Title' ;
        sh:datatype <http://www.w3.org/2001/XMLSchema#string> ;
      ] .
  "
  data-values-namespace="http://example.org/"
  data-show-node-ids
></shacl-form>

<script>
  const form = document.querySelector('shacl-form')
  form.addEventListener('change', event => {
    if (event.detail?.valid) {
      console.log(form.serialize('text/turtle'))
    }
  })
</script>
```

Common attributes include:

| Attribute | Purpose |
| --- | --- |
| `data-shapes` / `data-shapes-url` | Shapes Graph input. |
| `data-shape-subject` | Explicit root NodeShape IRI(s). |
| `data-values` / `data-values-url` | Existing RDF data graph input. |
| `data-values-subject` | Existing or generated root RDF node IRI. |
| `data-values-namespace` | Namespace for generated NamedNode identifiers. |
| `data-show-node-ids` | Show/edit generated NamedNode IRIs in the form. |
| `data-skip-shape-validation` | Skip SHACL-SHACL validation of the Shapes Graph. |
| `data-collapse` | Collapse grouped or nested properties where supported. |
| `data-submit-button` | Add a submit button with the given label. |

Programmatic entry points retained from upstream include:

- `toRDF(graph?)`
- `serialize(format?, graph?)`
- `validate(ignoreEmptyValues?)`
- `registerPlugin(plugin)`
- `setTheme(theme)`
- `setClassInstanceProvider(callback)`

## RML Fixture Provenance

The active RML demo loads:

1. [`rml/rml-core-io.ttl`](rml/rml-core-io.ttl)
2. [`rml/authoring-overlay.ttl`](rml/authoring-overlay.ttl)

The combined fixture is documented in
[`docs/rml-fixture-provenance.md`](docs/rml-fixture-provenance.md).

Pinned upstream sources:

- RML-Core repository: `kg-construct/rml-core`
- RML-Core commit: `82ab28d46803ba66a83c133f1db371a60116f84d`
- RML-Core file: `shapes/core.ttl`
- RML-IO repository: `kg-construct/rml-io`
- RML-IO commit: `980b90626d86394af91ed606f8493927d59d5e67`
- RML-IO file: `shapes/io.ttl`

The local authoring overlay adds thesis-demo same-focus `sh:node` bridges so
the RML authoring flow can expose the intended LogicalSource and
RelativePathSource structures. This overlay is an authoring profile for the
demo, not a claim about all RML shapes.

## Static Deployment

The GitHub Pages workflow builds the package and static demo site, then uploads
`site-dist/` as the Pages artifact.

Manual repository setting still required:

1. In GitHub, open **Settings -> Pages**.
2. Set **Build and deployment / Source** to **GitHub Actions**.
3. Ensure the workflow trigger branch matches the repository's public/default
   deployment branch.

No backend, persistence service, account system or shareable form-session URLs
are required.

## Known Limitations

- SHACL support is intentionally partial for authoring; final validation remains
  responsible for unsupported constraints.
- Runtime RDF state is still DOM-backed; there is not yet an independent Form
  Data Model.
- Value-only root NodeShapes can be selected but do not expose an independent
  focus-node editor.
- Required single-valued RDF node references do not yet have a dedicated
  replace/relink interaction.
- Duplicate same-path PropertyShapes are not merged by a general constraint
  reconciliation rule.
- Unsupported alternative-path branches remain visible but unavailable when the
  loaded shapes do not provide branch-specific authoring constraints.

See the thesis discussion for the detailed evaluation and remaining work.
