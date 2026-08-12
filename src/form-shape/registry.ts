import { Term } from '@rdfjs/types'
import { ShaclNodeShape } from '../shacl'
import { FormShapeCompiler } from './compiler'
import { FormNodeShape } from './model'

export class FormShapeRegistry {
    private readonly cache = new Map<string, FormNodeShape>()

    constructor(
        private readonly compiler: FormShapeCompiler,
        private readonly resolveNodeShape: (id: Term) => ShaclNodeShape | undefined,
    ) {}

    getNodeShape(id: Term): FormNodeShape | undefined {
        const key = this.termKey(id)
        const cached = this.cache.get(key)
        if (cached) {
            return cached
        }

        const semanticShape = this.resolveNodeShape(id)
        if (!semanticShape) {
            return undefined
        }

        const formShape = this.compiler.compileNodeShape(semanticShape)
        this.cache.set(key, formShape)
        return formShape
    }

    clear(): void {
        this.cache.clear()
    }

    private termKey(term: Term): string {
        return `${term.termType}:${term.value}`
    }
}
