import { Term } from '@rdfjs/types'
import { getAlternativePredicatePaths, getPredicatePath, ShaclShapeRegistry } from '../shacl'
import { FormShapeCompiler } from './compiler'
import { FormNodeShape, FormPropertyShape } from './model'

/**
 * Lazy cache of compiled FormNodeShapes.
 *
 * The registry contains every compilable NodeShape; root-selection policy must
 * not remove shapes from this cache because nested/logical resolution depends
 * on the full set.
 */
export class FormShapeRegistry {
    private readonly cache = new Map<string, FormNodeShape>()
    private readonly propertyCache = new Map<string, FormPropertyShape>()

    constructor(
        private readonly compiler: FormShapeCompiler,
        private readonly shaclShapes: ShaclShapeRegistry,
    ) {}

    getNodeShape(id: Term): FormNodeShape | undefined {
        const key = this.termKey(id)
        const cached = this.cache.get(key)
        if (cached) {
            return cached
        }

        const semanticShape = this.shaclShapes.getNodeShape(id)
        if (!semanticShape) {
            return undefined
        }

        const formShape = this.compiler.compileNodeShape(semanticShape)
        this.cache.set(key, formShape)
        for (const property of formShape.properties) {
            this.propertyCache.set(this.termKey(property.id), property)
        }
        return formShape
    }

    getNodeShapes(): FormNodeShape[] {
        return [...this.cache.values()]
    }

    getAllNodeShapes(): FormNodeShape[] {
        return this.shaclShapes.getNodeShapeSubjects()
            .flatMap(subject => {
                const formShape = this.getNodeShape(subject)
                return formShape ? [formShape] : []
            })
    }

    getPropertyShape(propertyShape: Term): FormPropertyShape | undefined {
        const key = this.termKey(propertyShape)
        const cached = this.propertyCache.get(key)
        if (cached) {
            return cached
        }

        for (const nodeShape of this.shaclShapes.getNodeShapeSubjects()) {
            const formShape = this.getNodeShape(nodeShape)
            const property = formShape?.properties.find(property => this.termKey(property.id) === key)
            if (property) {
                this.propertyCache.set(key, property)
                return property
            }
        }

        try {
            const semanticProperty = this.shaclShapes.parsePropertyShape(propertyShape)
            const property = this.compiler.compilePropertyShape(semanticProperty)
            this.propertyCache.set(key, property)
            return property
        } catch (error) {
            console.warn(error)
            return undefined
        }
    }

    getCompatibleNodeShapes(baseShape: Term): FormNodeShape[] {
        return this.getCompatibleNodeShapeTerms(baseShape)
            .flatMap(shape => {
                const formShape = this.getNodeShape(shape)
                return formShape ? [formShape] : []
            })
    }

    getCompatibleNodeShapeTerms(baseShape: Term): Term[] {
        const base = this.getNodeShape(baseShape)
        if (!base || base.targetClasses.length === 0) {
            return []
        }

        const candidates: Term[] = []
        for (const candidateSubject of this.shaclShapes.getNodeShapeSubjects()) {
            if (this.termKey(candidateSubject) === this.termKey(baseShape)) {
                continue
            }
            const candidate = this.shaclShapes.getNodeShape(candidateSubject)
            const candidateClasses = candidate?.targets.flatMap(target => target.kind === 'class' ? [target.class] : []) || []
            if (candidateClasses.some(candidateClass =>
                base.targetClasses.some(baseClass => this.shaclShapes.isSubclassOf(candidateClass, baseClass))
            )) {
                candidates.push(candidateSubject)
            }
        }
        return candidates
    }

    getRenderablePropertyShapeTerms(nodeShape: Term): Term[] {
        const formShape = this.getNodeShape(nodeShape)
        if (formShape) {
            return formShape.properties.map(property => property.id)
        }

        const propertyShapes = this.shaclShapes.getPropertyShapes(nodeShape)
        const pathsCoveredByAlternative = new Set<string>()

        for (const propertyShape of propertyShapes) {
            const path = this.shaclShapes.getPath(propertyShape)
            if (path) {
                const alternatives = getAlternativePredicatePaths(path)
                for (const alternative of alternatives || []) {
                    pathsCoveredByAlternative.add(alternative.value)
                }
            }
        }

        return propertyShapes.filter(propertyShape => {
            const path = this.shaclShapes.getPath(propertyShape)
            const predicatePath = path ? getPredicatePath(path) : undefined
            return !predicatePath || !pathsCoveredByAlternative.has(predicatePath.value)
        })
    }

    hasRenderableNodeShapeContent(nodeShape: Term): boolean {
        return Boolean(this.getNodeShape(nodeShape)?.properties.length)
    }

    clear(): void {
        this.cache.clear()
        this.propertyCache.clear()
    }

    private termKey(term: Term): string {
        return `${term.termType}:${term.value}`
    }
}
