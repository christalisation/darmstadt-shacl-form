export class ShaclGraphParser {
  constructor(
    private readonly rdf: RdfGraphReader,
    private readonly lists: RdfListReader,
    private readonly paths: ShaclPathParser
  ) {}

parseNodeShape(id: Term): ShaclNodeShape {
  const targets = this.parseTargets(id);
  const properties = this.parseProperties(id);
  const constraints = this.parseConstraints(id);

  return new ShaclNodeShape(
    id,
    targets,
    properties,
    constraints
  );
}

  parsePropertyShape(id: Term): ShaclPropertyShape {
    ...
  }
}