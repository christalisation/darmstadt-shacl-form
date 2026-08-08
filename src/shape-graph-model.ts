import { ShapeGraphRepository } from './shape-graph-repository'

export { ShapeGraphRepository }
export type { RootShapeOptions } from './shape-graph-repository'

/**
 * @deprecated Use ShapeGraphRepository for RDF graph queries, then compile the
 * semantic form model from it. This alias keeps the existing renderer stable
 * while the architecture is migrated layer by layer.
 */
export class ShapeGraphModel extends ShapeGraphRepository {}
