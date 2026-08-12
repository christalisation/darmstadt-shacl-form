import { DataFactory, Store, StreamParser } from 'n3'
import { Term } from '@rdfjs/types'
import { Validator } from 'shacl-engine'
import shaclShacl from '../assets/shacl-shacl.ttl?raw'

export interface ShaclShapeValidationResult {
    conforms: boolean
    violations: ShaclShapeValidationViolation[]
}

export interface ShaclShapeValidationViolation {
    message: string
    focusNode?: Term
    path?: unknown
    constraintComponent?: Term
    sourceShape?: Term
    value?: Term
}

/**
 * Validates the input SHACL shapes graph against SHACL-SHACL.
 */
export class ShaclShapeValidator {
    private static shapes: Store | null = null
    private static promise: Promise<Store> | null = null

    private static async getShacl(): Promise<Store> {
        if (this.shapes) {
            return this.shapes
        }
        if (this.promise) {
            return this.promise
        }

        this.promise = new Promise((resolve, reject) => {
            const spec = new Store()
            const parser = new StreamParser()
            parser.on('data', (quad) => spec.add(quad))
            parser.on('end', () => {
                this.shapes = spec
                resolve(spec)
            })
            parser.on('error', reject)
            parser.write(shaclShacl)
            parser.end()
        })

        return this.promise
    }

    async validate(shapes: Store): Promise<any> {
        const shaclShapes = await ShaclShapeValidator.getShacl()
        const validator = new Validator(shaclShapes, { details: true, factory: DataFactory })
        return await validator.validate({ dataset: shapes })
    }

    formatReport(report: any): string {
        if (!report.results?.length) {
            return '- The shapes graph does not conform, but the validator returned no result details.'
        }

        return report.results
            .map((result: any) => `- ${this.formatResult(result)}`)
            .join('\n')
    }

    private formatResult(result: any): string {
        const message = result.message?.length
            ? result.message.map((message: any) => message.value).join(', ')
            : 'SHACL-SHACL validation error'

        const details = [
            this.formatDetail('focus', this.formatTerm(result.focusNode?.term)),
            this.formatDetail('path', this.formatPath(result.path)),
            this.formatDetail('component', this.formatTerm(result.constraintComponent)),
            this.formatDetail('shape', this.formatTerm(result.shape?.ptr?.term)),
            this.formatDetail('value', this.formatTerm(result.value?.term)),
        ].filter(Boolean)

        return details.length ? `${message} (${details.join('; ')})` : message
    }

    private formatDetail(label: string, value?: string): string | undefined {
        return value ? `${label}: ${value}` : undefined
    }

    private formatTerm(term: any): string | undefined {
        if (!term) {
            return undefined
        }
        if (term.termType === 'Literal') {
            const language = term.language ? `@${term.language}` : ''
            const datatype = term.datatype?.value ? `^^${term.datatype.value}` : ''
            return `"${term.value}"${language || datatype}`
        }
        if (term.termType === 'BlankNode') {
            return `_:${term.value}`
        }
        return term.value || term.id
    }

    private formatPath(path: any[] | undefined): string | undefined {
        if (!path?.length) {
            return undefined
        }

        return path.map(step => {
            const predicates = step.predicates
                ?.map((predicate: any) => this.formatTerm(predicate))
                .filter(Boolean)
                .join('|')
            return predicates || step.quantifier
        }).filter(Boolean).join('/')
    }
}

export { ShaclShapeValidator as ShaclShapeGraphValidator, ShaclShapeValidator as ShaclSpec }
