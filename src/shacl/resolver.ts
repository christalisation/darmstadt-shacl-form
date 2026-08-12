import { Term } from '@rdfjs/types'
import { ShaclConstraint } from './constraint'
import { ShaclNodeShape, ShaclPropertyShape } from './model'

export interface ResolvedShaclPropertyShape {
    property: ShaclPropertyShape
    sourceShapes: Term[]
}

export interface ResolvedShaclNodeShape {
    shape: ShaclNodeShape
    properties: ResolvedShaclPropertyShape[]
    composedNodeShapes: Term[]
    logicalConstraints: ShaclConstraint[]
}

export interface ShaclShapeResolverOptions {
    resolveNodeShape: (id: Term) => ShaclNodeShape | undefined
    resolvePropertyShape: (id: Term) => ShaclPropertyShape | undefined
}

export class ShaclShapeResolver {
    constructor(private readonly options: ShaclShapeResolverOptions) {}

    resolveEffectiveNodeShape(shape: ShaclNodeShape): ResolvedShaclNodeShape {
        const resolved = this.resolveNodeShape(shape, [shape.id], new Set<string>())

        return {
            shape,
            properties: this.dedupeResolvedProperties(resolved.properties),
            composedNodeShapes: this.uniqueTerms(resolved.composedNodeShapes),
            logicalConstraints: shape.constraints.filter(constraint =>
                constraint.kind === 'or' ||
                constraint.kind === 'xone' ||
                constraint.kind === 'not'
            ),
        }
    }

    private resolveNodeShape(shape: ShaclNodeShape, sourceShapes: Term[], visited: Set<string>): {
        properties: ResolvedShaclPropertyShape[]
        composedNodeShapes: Term[]
    } {
        const key = this.termKey(shape.id)
        if (visited.has(key)) {
            return { properties: [], composedNodeShapes: [] }
        }
        visited.add(key)

        const properties: ResolvedShaclPropertyShape[] = shape.propertyShapes.map(property => ({
            property,
            sourceShapes,
        }))
        const composedNodeShapes: Term[] = []

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
                        composedNodeShapes.push(member)
                        const nested = this.resolveNodeShape(nodeShape, [...sourceShapes, member], new Set(visited))
                        properties.push(...nested.properties)
                        composedNodeShapes.push(...nested.composedNodeShapes)
                    }
                }
            }
        }

        return { properties, composedNodeShapes }
    }

    private dedupeResolvedProperties(properties: ResolvedShaclPropertyShape[]): ResolvedShaclPropertyShape[] {
        const seen = new Set<string>()
        const result: ResolvedShaclPropertyShape[] = []

        for (const property of properties) {
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
