import { describe, expect, it } from "vitest";
import { DataFactory } from "n3";

import { FormInstanceProperty } from "../src/form-instance/form-instance-property";
import { FormShapeProperty } from "../src/form-shape/form-shape-property";

const SH = "http://www.w3.org/ns/shacl#";
const EX = "http://example.org/";

describe("FormInstanceProperty", () => {
  it("accepts IRIs for sh:BlankNodeOrIRI", () => {
    const property = new FormInstanceProperty(
      new FormShapeProperty(
        DataFactory.namedNode(`${EX}shape`),
        {
          kind: "predicate",
          predicate: DataFactory.namedNode(`${EX}predicate`)
        },
        { min: 0 },
        { kind: "resource" },
        [
          {
            kind: "nodeKind",
            nodeKind: DataFactory.namedNode(`${SH}BlankNodeOrIRI`)
          }
        ]
      )
    );

    property.addValue({
      kind: "term",
      term: DataFactory.namedNode(`${EX}resource`)
    });

    expect(property.validate().valid).toBe(true);
  });
});
