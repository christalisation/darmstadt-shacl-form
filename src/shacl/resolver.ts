import { Term } from '@rdfjs/types'
import { ShaclConstraint } from './constraint'
import { ShaclNodeShape, ShaclPropertyShape } from './model'

/**
 * A property shape plus the node shapes through which it became effective.
 *
 * Provenance is retained so distinct PropertyShapes on the same path are not
 * collapsed unless they have the same semantic source identity.
 */
export interface ResolvedShaclPropertyShape {
    property: ShaclPropertyShape
    sourceShapes: Term[]
}

export interface ResolvedShaclNodeShape {
    shape: ShaclNodeShape
    properties: ResolvedShaclPropertyShape[]
    composedNodeShapes: Term[]
    constraints: ShaclConstraint[]
    logicalConstraints: ShaclConstraint[]
}

export interface ShaclShapeResolverOptions {
    resolveNodeShape: (id: Term) => ShaclNodeShape | undefined
    resolvePropertyShape: (id: Term) => ShaclPropertyShape | undefined
}

/**
 * Computes effective same-focus structure from SHACL composition.
 *
 * `sh:and` and node-level `sh:node` contribute requirements to the same focus
 * node. Property-level `sh:node` is not resolved here; it remains a constraint
 * on the property's value node and is projected by the Form Shape compiler.
 */
export class ShaclShapeResolver {
    constructor(private readonly options: ShaclShapeResolverOptions) {}

    resolveEffectiveNodeShape(shape: ShaclNodeShape): ResolvedShaclNodeShape {
        const resolved = this.resolveNodeShape(shape, [shape.id], new Set<string>())

        return {
            shape,
            properties: this.dedupeResolvedProperties(resolved.properties),
            composedNodeShapes: this.uniqueTerms(resolved.composedNodeShapes),
            constraints: resolved.constraints,
            logicalConstraints: resolved.constraints.filter(constraint =>
                constraint.kind === 'or' ||
                constraint.kind === 'xone' ||
                constraint.kind === 'not'
            ),
        }
    }

    private resolveNodeShape(shape: ShaclNodeShape, sourceShapes: Term[], visited: Set<string>): {
        properties: ResolvedShaclPropertyShape[]
        composedNodeShapes: Term[]
        constraints: ShaclConstraint[]
    } {
        const key = this.termKey(shape.id)
        if (visited.has(key)) {
            return { properties: [], composedNodeShapes: [], constraints: [] }
        }
        visited.add(key)

        const properties: ResolvedShaclPropertyShape[] = shape.propertyShapes.map(property => ({
            property,
            sourceShapes,
        }))
        const composedNodeShapes: Term[] = []
        const constraints: ShaclConstraint[] = shape.constraints.filter(constraint =>
            constraint.kind !== 'and' &&
            constraint.kind !== 'node'
        )

        for (const constraint of shape.constraints) {
            if (constraint.kind === 'and') {
                for (const member of constraint.shapes) {
                    const propertyShape = this.options.resolvePropertyShape(member)
                    if (propertyShape?.path) {
                        properties.push({
                            property: propertyShape,
                            sourceShapes: [...sourceShapes, member],
                        })
                        continue
                    }

                    const nodeShape = this.options.resolveNodeShape(member)
                    if (nodeShape) {
                        // sh:and means every branch applies to the same focus node.
                        composedNodeShapes.push(member)
                        const nested = this.resolveNodeShape(nodeShape, [...sourceShapes, member], new Set(visited))
                        properties.push(...nested.properties)
                        composedNodeShapes.push(...nested.composedNodeShapes)
                        constraints.push(...nested.constraints)
                    }
                }
            } else if (constraint.kind === 'node') {
                const nodeShape = this.options.resolveNodeShape(constraint.shape)
                if (nodeShape) {
                    // NodeShape-level sh:node is same-focus composition, not a nested RDF node.
                    composedNodeShapes.push(constraint.shape)
                    const nested = this.resolveNodeShape(nodeShape, [...sourceShapes, constraint.shape], new Set(visited))
                    properties.push(...nested.properties)
                    composedNodeShapes.push(...nested.composedNodeShapes)
                    constraints.push(...nested.constraints)
                }
            }
        }

        return { properties, composedNodeShapes, constraints }
    }

    private dedupeResolvedProperties(properties: ResolvedShaclPropertyShape[]): ResolvedShaclPropertyShape[] {
        const seen = new Set<string>()
        const result: ResolvedShaclPropertyShape[] = []

        for (const property of properties) {
            // Do not merge distinct PropertyShapes merely because they share a path.
            const key = [
                this.termKey(property.property.id),
                ...property.sourceShapes.map(shape => this.termKey(shape)),
            ].join('|')
            if (!seen.has(key)) {
                seen.add(key)
                result.push(property)
            }
        }

        return result
    }

    private uniqueTerms(terms: Term[]): Term[] {
        return [...new Map(terms.map(term => [this.termKey(term), term])).values()]
    }

    private termKey(term: Term): string {
        return `${term.termType}:${term.value}`
    }
}
