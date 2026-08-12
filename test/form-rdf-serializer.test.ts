import { describe, expect, it } from "vitest";
import { DataFactory } from "n3";

import { FormInstanceGraph } from "../src/form-instance/form-instance-graph";
import { FormShapeNode } from "../src/form-shape/form-shape-node";
import { FormShapeProperty } from "../src/form-shape/form-shape-property";
import { FormRdfSerializer } from "../src/rdf-binding/form-rdf-serializer";
import { RdfPathWriter } from "../src/rdf-binding/rdf-path-writer";

const EX = "http://example.org/";
const RDF_TYPE =
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

const namedNode = DataFactory.namedNode;

describe("FormRdfSerializer", () => {
  it("serializes materialized nodes and ignores empty root placeholders", () => {
    const organisationShape = namedNode(`${EX}OrganisationShape`);
    const organisationTemplate = new FormShapeNode(
      organisationShape,
      [],
      [],
      "Organisation",
      undefined,
      [namedNode(`${EX}Organisation`)]
    );

    const employerProperty = new FormShapeProperty(
      namedNode(`${EX}employerShape`),
      {
        kind: "predicate",
        predicate: namedNode(`${EX}employer`)
      },
      { min: 0 },
      {
        kind: "nestedNode",
        shape: organisationShape
      },
      [],
      [],
      "Employer"
    );

    const personTemplate = new FormShapeNode(
      namedNode(`${EX}PersonShape`),
      [employerProperty],
      [],
      "Person",
      undefined,
      [namedNode(`${EX}Person`)]
    );

    const graph = new FormInstanceGraph();

    graph.createNode(
      namedNode(`${EX}empty-root`),
      organisationTemplate,
      true
    );

    const person = graph.createNode(
      namedNode(`${EX}person`),
      personTemplate,
      true
    );

    const organisation = graph.createNode(
      namedNode(`${EX}organisation`),
      organisationTemplate
    );

    person.properties[0].addValue({
      kind: "node",
      node: organisation
    });

    const quads = new FormRdfSerializer(
      new RdfPathWriter()
    ).serialize(graph);

    const triples = quads.map(
      quad =>
        `${quad.subject.value} ${quad.predicate.value} ${quad.object.value}`
    );

    expect(triples).toContain(
      `${EX}person ${RDF_TYPE} ${EX}Person`
    );
    expect(triples).toContain(
      `${EX}person ${EX}employer ${EX}organisation`
    );
    expect(triples).toContain(
      `${EX}organisation ${RDF_TYPE} ${EX}Organisation`
    );
    expect(triples).not.toContain(
      `${EX}empty-root ${RDF_TYPE} ${EX}Organisation`
    );
  });
});
