import { DataFactory } from 'n3'
import { Literal, NamedNode, Term } from '@rdfjs/types'
import {
    getAlternativePredicatePaths,
    getPredicatePath,
    pathToString,
    ShaclConstraint,
    ShaclNodeShape,
    ShaclPropertyShape,
    ShaclShapeResolver,
} from '../shacl'
import { PREFIX_RDF } from '../constants'
import { FormLogicalAlternative, FormNodeShape, FormPropertyShape, FormValueConstraints } from './model'

export interface FormShapeCompilerOptions {
    languages: string[]
    prefixes?: Record<string, unknown>
    resolveNodeShape: (id: Term) => ShaclNodeShape | undefined
    findNodeShapeByTargetClass?: (targetClass: NamedNode) => Term | undefined
    labelForTerm?: (term: Term) => string | undefined
    shapeResolver?: ShaclShapeResolver
    findCompatibleNodeShapes?: (baseShape: Term) => Term[]
}

export class FormShapeCompiler {
    constructor(private readonly options: FormShapeCompilerOptions) {}

    compileNodeShape(shape: ShaclNodeShape): FormNodeShape {
        const effectiveShape = this.options.shapeResolver?.resolveEffectiveNodeShape(shape)
        const effectiveProperties = effectiveShape?.properties || shape.propertyShapes.map(property => ({
            property,
            sourceShapes: [shape.id],
        }))
        const semanticSiblings = effectiveProperties.map(entry => entry.property)
        const properties = this.getRenderableProperties(
            effectiveProperties.map(entry => this.compilePropertyShape(entry.property, semanticSiblings, entry.sourceShapes))
        )
        return {
            id: shape.id,
            label: this.resolveLabel(shape) || this.fallbackLabel(shape.id),
            description: this.resolveDescription(shape)?.value,
            messages: shape.metadata.messages,
            targetClasses: shape.targets.flatMap(target => target.kind === 'class' ? [target.class] : []),
            valueConstraints: this.compileValueConstraints(shape.constraints),
            properties,
            composedNodeShapes: effectiveShape?.composedNodeShapes || this.composedNodeShapes(shape.constraints),
            logicalAlternatives: this.logicalAlternatives(shape.constraints),
        }
    }

    compilePropertyShape(shape: ShaclPropertyShape, siblings: ShaclPropertyShape[] = [], sourceShapes: Term[] = []): FormPropertyShape {
        const property: FormPropertyShape = {
            id: shape.id,
            label: this.resolveLabel(shape) || this.fallbackPropertyLabel(shape),
            description: this.resolveDescription(shape),
            messages: shape.metadata.messages,
            path: shape.path,
            writablePath: shape.path ? getPredicatePath(shape.path) : undefined,
            pathAlternatives: shape.path ? getAlternativePredicatePaths(shape.path) : undefined,
            pathAlternativeLabels: {},
            group: shape.metadata.group,
            order: shape.metadata.order,
            defaultValue: shape.metadata.defaultValue,
            nestedNodeShapes: [],
            compatibleNodeShapes: [],
            logicalAlternatives: [],
            sourceShapes: sourceShapes.length ? [...sourceShapes] : [shape.id],
        }

        for (const constraint of shape.constraints) {
            this.applyConstraint(property, constraint)
        }

        if (property.class && !property.nodeShape && this.options.findNodeShapeByTargetClass) {
            property.nodeShape = this.options.findNodeShapeByTargetClass(property.class)
        }

        if (property.nodeShape) {
            property.compatibleNodeShapes = this.options.findCompatibleNodeShapes?.(property.nodeShape) || []
            if (this.hasRenderableNodeShapeContent(property.nodeShape)) {
                property.nestedNodeShapes.push(property.nodeShape)
            } else {
                this.mergeValueNodeShapeConstraints(property, property.nodeShape)
            }
        }

        for (const alternative of property.pathAlternatives || []) {
            property.pathAlternativeLabels[alternative.value] = this.findAlternativePathLabel(alternative, siblings)
        }

        return property
    }

    private applyConstraint(property: FormPropertyShape, constraint: ShaclConstraint): void {
        switch (constraint.kind) {
            case 'datatype':
                property.datatype = constraint.datatype
                break
            case 'nodeKind':
                property.nodeKind = constraint.nodeKind
                break
            case 'class':
                property.class = constraint.class
                break
            case 'node':
                property.nodeShape = constraint.shape
                break
            case 'minCount':
                property.minCount = constraint.value
                break
            case 'maxCount':
                property.maxCount = constraint.value
                break
            case 'minLength':
                property.minLength = constraint.value
                break
            case 'maxLength':
                property.maxLength = constraint.value
                break
            case 'minInclusive':
                property.minInclusive = Number(constraint.value.value)
                break
            case 'maxInclusive':
                property.maxInclusive = Number(constraint.value.value)
                break
            case 'minExclusive':
                property.minExclusive = Number(constraint.value.value)
                break
            case 'maxExclusive':
                property.maxExclusive = Number(constraint.value.value)
                break
            case 'pattern':
                property.pattern = constraint.pattern
                break
            case 'languageIn':
                property.languageIn = constraint.languages.map(language => DataFactory.literal(language))
                property.datatype = DataFactory.namedNode(PREFIX_RDF + 'langString')
                break
            case 'in':
                property.shaclIn = constraint.values
                break
            case 'hasValue':
                property.hasValue = constraint.value
                break
            case 'or':
            case 'xone':
                property.logicalAlternatives.push({ kind: constraint.kind, shapes: constraint.shapes })
                break
            case 'and':
                property.nestedNodeShapes.push(...constraint.shapes)
                break
            case 'qualifiedValueShape':
                property.qualifiedValueShape = constraint.shape
                if (constraint.minCount !== undefined) property.minCount = constraint.minCount
                if (constraint.maxCount !== undefined) property.maxCount = constraint.maxCount
                break
        }
    }

    private applyValueConstraint(value: FormValueConstraints, constraint: ShaclConstraint): void {
        switch (constraint.kind) {
            case 'datatype':
                value.datatype = constraint.datatype
                break
            case 'nodeKind':
                value.nodeKind = constraint.nodeKind
                break
            case 'class':
                value.class = constraint.class
                break
            case 'minLength':
                value.minLength = constraint.value
                break
            case 'maxLength':
                value.maxLength = constraint.value
                break
            case 'minInclusive':
                value.minInclusive = Number(constraint.value.value)
                break
            case 'maxInclusive':
                value.maxInclusive = Number(constraint.value.value)
                break
            case 'minExclusive':
                value.minExclusive = Number(constraint.value.value)
                break
            case 'maxExclusive':
                value.maxExclusive = Number(constraint.value.value)
                break
            case 'pattern':
                value.pattern = constraint.pattern
                break
            case 'languageIn':
                value.languageIn = constraint.languages.map(language => DataFactory.literal(language))
                value.datatype = DataFactory.namedNode(PREFIX_RDF + 'langString')
                break
            case 'in':
                value.shaclIn = constraint.values
                break
            case 'hasValue':
                value.hasValue = constraint.value
                break
        }
    }

    private compileValueConstraints(constraints: ShaclConstraint[]): FormValueConstraints {
        const value: FormValueConstraints = {}
        for (const constraint of constraints) {
            this.applyValueConstraint(value, constraint)
        }
        return value
    }

    private mergeValueNodeShapeConstraints(property: FormPropertyShape, nodeShapeId: Term): void {
        const nodeShape = this.options.resolveNodeShape(nodeShapeId)
        if (!nodeShape) {
            return
        }
        for (const constraint of nodeShape.constraints) {
            this.applyConstraint(property, constraint)
        }
    }

    private hasRenderableNodeShapeContent(nodeShapeId: Term, visited = new Set<string>()): boolean {
        const key = this.termKey(nodeShapeId)
        if (visited.has(key)) {
            return false
        }
        visited.add(key)

        const nodeShape = this.options.resolveNodeShape(nodeShapeId)
        if (!nodeShape) {
            return false
        }
        if (nodeShape.propertyShapes.length > 0) {
            return true
        }
        for (const composed of this.composedNodeShapes(nodeShape.constraints)) {
            if (this.hasRenderableNodeShapeContent(composed, visited)) {
                return true
            }
        }
        return false
    }

    private composedNodeShapes(constraints: ShaclConstraint[]): Term[] {
        const shapes: Term[] = []
        for (const constraint of constraints) {
            if (constraint.kind === 'node') {
                shapes.push(constraint.shape)
            } else if (constraint.kind === 'and') {
                shapes.push(...constraint.shapes)
            }
        }
        return this.uniqueTerms(shapes)
    }

    private logicalAlternatives(constraints: ShaclConstraint[]): FormLogicalAlternative[] {
        return constraints.flatMap(constraint =>
            constraint.kind === 'or' || constraint.kind === 'xone'
                ? [{ kind: constraint.kind, shapes: constraint.shapes }]
                : []
        )
    }

    private findAlternativePathLabel(path: NamedNode, siblings: ShaclPropertyShape[]): string {
        for (const sibling of siblings) {
            if (!sibling.path) {
                continue
            }
            const siblingPredicate = getPredicatePath(sibling.path)
            if (siblingPredicate?.value === path.value) {
                const label = this.resolveLabel(sibling)
                if (label) {
                    return label
                }
            }
        }

        return this.options.labelForTerm?.(path) || this.fallbackLabel(path)
    }

    private getRenderableProperties(properties: FormPropertyShape[]): FormPropertyShape[] {
        const pathsCoveredByAlternative = new Set<string>()
        for (const property of properties) {
            for (const alternative of property.pathAlternatives || []) {
                pathsCoveredByAlternative.add(alternative.value)
            }
        }

        return properties.filter(property =>
            !property.writablePath || !pathsCoveredByAlternative.has(property.writablePath.value)
        )
    }

    private resolveLabel(shape: ShaclNodeShape | ShaclPropertyShape): string | undefined {
        const literal = this.prioritizeLiteral([...shape.metadata.names, ...shape.metadata.labels])
        return literal?.value
    }

    private resolveDescription(shape: ShaclNodeShape | ShaclPropertyShape): Literal | undefined {
        return this.prioritizeLiteral(shape.metadata.descriptions)
    }

    private prioritizeLiteral(literals: Literal[]): Literal | undefined {
        let fallback: Literal | undefined
        for (const language of this.options.languages) {
            for (const literal of literals) {
                if (literal.language === language) {
                    return literal
                }
                if (!literal.language && !fallback) {
                    fallback = literal
                } else if (!fallback) {
                    fallback = literal
                }
            }
        }
        return fallback
    }

    private fallbackPropertyLabel(shape: ShaclPropertyShape): string {
        if (!shape.path) {
            return 'unknown'
        }
        const alternatives = getAlternativePredicatePaths(shape.path)
        if (alternatives?.length) {
            return alternatives.map(path => this.fallbackLabel(path)).join(' / ')
        }
        const predicate = getPredicatePath(shape.path)
        if (predicate) {
            return this.fallbackLabel(predicate)
        }
        return pathToString(shape.path)
    }

    private fallbackLabel(term: Term): string {
        let id = term.value
        for (const key in this.options.prefixes || {}) {
            const prefix = (this.options.prefixes || {})[key]
            const namespace = typeof prefix === 'string' ? prefix : (prefix as any)?.value
            if (namespace) {
                id = id.replace(namespace, '')
            }
        }
        if (/^https?:\/\//.test(id)) {
            return id.split(/[\/#]/).filter(Boolean).pop() || id
        }
        return id
    }

    private uniqueTerms(terms: Term[]): Term[] {
        return [...new Map(terms.map(term => [this.termKey(term), term])).values()]
    }

    private termKey(term: Term): string {
        return `${term.termType}:${term.value}`
    }
}
