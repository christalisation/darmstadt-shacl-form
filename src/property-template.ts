import { Literal, NamedNode, Quad, DataFactory } from 'n3'
import { Term } from '@rdfjs/types'
import { OWL_PREDICATE_IMPORTS, PREFIX_DASH, PREFIX_OA, PREFIX_RDF, PREFIX_SHACL, SHACL_PREDICATE_CLASS, SHACL_PREDICATE_TARGET_CLASS } from './constants'
import { Config } from './config'
import { findLabel, prioritizeByLanguage, removePrefixes } from './util'
import { ShaclNode } from './node'
import { getAlternativePredicatePaths, getPredicatePath, pathToString, ShaclPath } from './shacl-path'
import { FormPropertyShape } from './form-shape'

const mappers: Record<string, (template: ShaclPropertyTemplate, term: Term) => void> = {
    [`${PREFIX_SHACL}name`]:         (template, term) => { const literal = term as Literal; template.name = prioritizeByLanguage(template.config.languages, template.name, literal) },
    [`${PREFIX_SHACL}description`]:  (template, term) => { const literal = term as Literal; template.description = prioritizeByLanguage(template.config.languages, template.description, literal) },
    [`${PREFIX_SHACL}path`]:         (template, term) => { template.setPath(term) },
    [`${PREFIX_SHACL}node`]:         (template, term) => { template.node = term as NamedNode },
    [`${PREFIX_SHACL}datatype`]:     (template, term) => { template.datatype = term as NamedNode },
    [`${PREFIX_SHACL}nodeKind`]:     (template, term) => { template.nodeKind = term as NamedNode },
    [`${PREFIX_SHACL}minCount`]:     (template, term) => { template.minCount = parseInt(term.value) },
    [`${PREFIX_SHACL}maxCount`]:     (template, term) => { template.maxCount = parseInt(term.value) },
    [`${PREFIX_SHACL}minLength`]:    (template, term) => { template.minLength = parseInt(term.value) },
    [`${PREFIX_SHACL}maxLength`]:    (template, term) => { template.maxLength = parseInt(term.value) },
    [`${PREFIX_SHACL}minInclusive`]: (template, term) => { template.minInclusive = parseInt(term.value) },
    [`${PREFIX_SHACL}maxInclusive`]: (template, term) => { template.maxInclusive = parseInt(term.value) },
    [`${PREFIX_SHACL}minExclusive`]: (template, term) => { template.minExclusive = parseInt(term.value) },
    [`${PREFIX_SHACL}maxExclusive`]: (template, term) => { template.maxExclusive = parseInt(term.value) },
    [`${PREFIX_SHACL}pattern`]:      (template, term) => { template.pattern = term.value },
    [`${PREFIX_SHACL}order`]:        (template, term) => { template.order = parseInt(term.value) },
    [`${PREFIX_DASH}singleLine`]:    (template, term) => { template.singleLine = term.value === 'true' },
    [`${PREFIX_DASH}readonly`]:      (template, term) => { template.readonly = term.value === 'true' },
    [`${PREFIX_OA}styleClass`]:      (template, term) => { template.cssClass = term.value },
    [`${PREFIX_SHACL}and`]:          (template, term) => { template.shaclAnd = term.value },
    [`${PREFIX_SHACL}in`]:           (template, term) => { template.shaclIn = term.value },
    // sh:datatype might be undefined, but sh:languageIn defined. this is undesired. the spec says, that strings without a lang tag are not valid if sh:languageIn is set. but the shacl validator accepts these as valid. to prevent this, we just set the datatype here to 'langString'.
    [`${PREFIX_SHACL}languageIn`]:   (template, term) => { template.languageIn = template.config.lists[term.value]; template.datatype = DataFactory.namedNode(PREFIX_RDF + 'langString') },
    [`${PREFIX_SHACL}defaultValue`]: (template, term) => { template.defaultValue = term },
    [`${PREFIX_SHACL}hasValue`]:     (template, term) => { template.hasValue = term },
    [`${PREFIX_SHACL}qualifiedValueShape`]:     (template, term) => { template.qualifiedValueShape = term },
    [`${PREFIX_SHACL}qualifiedMinCount`]: (template, term) => { template.minCount = parseInt(term.value) },
    [`${PREFIX_SHACL}qualifiedMaxCount`]: (template, term) => { template.maxCount = parseInt(term.value) },
    [OWL_PREDICATE_IMPORTS.id]:      (template, term) => { template.owlImports.push(term as NamedNode) },
    [SHACL_PREDICATE_CLASS.id]:      (template, term) => {
        template.class = term as NamedNode
        // try to find node shape that has requested target class
        const nodeShapes = template.config.store.getSubjects(SHACL_PREDICATE_TARGET_CLASS, term, null)
        if (nodeShapes.length > 0) {
            template.node = nodeShapes[0] as NamedNode
        }
    },
    [`${PREFIX_SHACL}or`]:           (template, term) => {
        const list = template.config.lists[term.value]
        if (list?.length) {
            template.shaclOr = list
        } else {
            console.error('list for sh:or not found:', term.value, 'existing lists:', template.config.lists)
        }
    },
    [`${PREFIX_SHACL}xone`]:           (template, term) => {
        const list = template.config.lists[term.value]
        if (list?.length) {
            template.shaclXone = list
        } else {
            console.error('list for sh:xone not found:', term.value, 'existing lists:', template.config.lists)
        }
    }
}

const valueNodeConstraintPredicates = new Set<string>([
    `${PREFIX_SHACL}datatype`,
    `${PREFIX_SHACL}nodeKind`,
    `${PREFIX_SHACL}minLength`,
    `${PREFIX_SHACL}maxLength`,
    `${PREFIX_SHACL}minInclusive`,
    `${PREFIX_SHACL}maxInclusive`,
    `${PREFIX_SHACL}minExclusive`,
    `${PREFIX_SHACL}maxExclusive`,
    `${PREFIX_SHACL}pattern`,
    `${PREFIX_SHACL}in`,
    `${PREFIX_SHACL}languageIn`,
    `${PREFIX_SHACL}defaultValue`,
    `${PREFIX_SHACL}hasValue`,
])

export class ShaclPropertyTemplate {
    id: Term | undefined
    parent: ShaclNode
    label = ''
    name: Literal | undefined
    description: Literal | undefined
    path: string | undefined
    pathExpression: ShaclPath | undefined
    pathAlternatives: string[] | undefined
    pathAlternativeLabels: Record<string, string> = {}
    node: NamedNode | undefined
    class: NamedNode | undefined
    minCount: number | undefined
    maxCount: number | undefined
    minLength: number | undefined
    maxLength: number | undefined
    minInclusive: number | undefined
    maxInclusive: number | undefined
    minExclusive: number | undefined
    maxExclusive: number | undefined
    singleLine: boolean | undefined
    readonly: boolean | undefined
    cssClass: string | undefined
    defaultValue: Term | undefined
    pattern: string | undefined
    order: number | undefined
    nodeKind: NamedNode | undefined
    shaclAnd: string | undefined
    shaclIn: string | undefined
    shaclInValues: Term[] | undefined
    shaclOr: Term[] | undefined
    shaclXone: Term[] | undefined
    languageIn: Term[] | undefined
    datatype: NamedNode | undefined
    hasValue: Term | undefined
    qualifiedValueShape: Term | undefined
    owlImports: NamedNode[] = []

    config: Config
    extendedShapes: NamedNode[]  = []

    constructor(quads: Quad[], parent: ShaclNode, config: Config, formShape?: FormPropertyShape) {
        this.id = formShape?.id || quads[0]?.subject
        this.parent = parent
        this.config = config
        const compiledShape = formShape || (this.id ? config.shapeGraph.getFormPropertyShape(this.id) : undefined)
        if (compiledShape) {
            this.applyFormPropertyShape(compiledShape)
            this.mergeLegacyCompatibilityExtensions(quads)
        } else {
            this.merge(quads)
            if (this.qualifiedValueShape) {
                this.merge(config.store.getQuads(this.qualifiedValueShape, null, null, null))
            }
        }
    }

    /**
     * Temporary compatibility adapter: the rendering layer still consumes
     * ShaclPropertyTemplate, but form semantics now come from FormPropertyShape.
     */
    private applyFormPropertyShape(shape: FormPropertyShape): void {
        this.id = shape.id
        this.label = shape.label
        this.description = shape.description as Literal | undefined
        this.pathExpression = shape.path
        this.path = shape.writablePath?.value || shape.pathAlternatives?.[0]?.value
        this.pathAlternatives = shape.pathAlternatives?.map(path => path.value)
        this.pathAlternativeLabels = { ...shape.pathAlternativeLabels }
        this.node = shape.nodeShape as NamedNode | undefined
        this.datatype = shape.datatype as NamedNode | undefined
        this.nodeKind = shape.nodeKind as NamedNode | undefined
        this.class = shape.class as NamedNode | undefined
        this.minCount = shape.minCount
        this.maxCount = shape.maxCount
        this.minLength = shape.minLength
        this.maxLength = shape.maxLength
        this.minInclusive = shape.minInclusive
        this.maxInclusive = shape.maxInclusive
        this.minExclusive = shape.minExclusive
        this.maxExclusive = shape.maxExclusive
        this.pattern = shape.pattern
        this.order = shape.order
        this.defaultValue = shape.defaultValue
        this.hasValue = shape.hasValue
        this.qualifiedValueShape = shape.qualifiedValueShape
        this.shaclInValues = shape.shaclIn ? [...shape.shaclIn] : undefined
        this.languageIn = shape.languageIn ? [...shape.languageIn] : undefined
        this.extendedShapes = shape.nestedNodeShapes
            .filter((node): node is NamedNode => node.termType === 'NamedNode')
        this.shaclOr = shape.logicalAlternatives.find(alternative => alternative.kind === 'or')?.shapes
        this.shaclXone = shape.logicalAlternatives.find(alternative => alternative.kind === 'xone')?.shapes

        if (!this.label && this.pathAlternatives?.length) {
            this.label = this.pathAlternatives.map(path => removePrefixes(path, this.config.prefixes)).join(' / ')
        } else if (!this.label) {
            this.label = this.path ? removePrefixes(this.path, this.config.prefixes) : 'unknown'
        }
    }

    private mergeLegacyCompatibilityExtensions(quads: Quad[]): void {
        for (const quad of quads) {
            switch (quad.predicate.id) {
                case `${PREFIX_DASH}singleLine`:
                case `${PREFIX_DASH}readonly`:
                case `${PREFIX_OA}styleClass`:
                case OWL_PREDICATE_IMPORTS.id:
                    mappers[quad.predicate.id]?.call(this, this, quad.object)
                    break
            }
        }
    }

    merge(quads: Quad[]): ShaclPropertyTemplate {
        for (const quad of quads) {
            mappers[quad.predicate.id]?.call(this, this, quad.object)
        }
        // provide best fitting label for UI
        this.label = this.name?.value || findLabel(quads, this.config.languages)
        if (!this.label && !this.shaclAnd) {
            if (this.pathAlternatives?.length) {
                this.label = this.pathAlternatives.map(path => removePrefixes(path, this.config.prefixes)).join(' / ')
            } else {
                this.label = this.path ? removePrefixes(this.path, this.config.prefixes) : 'unknown'
            }
        }
        // register structural node shapes, or absorb value-shape constraints
        if (this.node) {
            if (this.config.shapeGraph.hasRenderableNodeShapeContent(this.node)) {
                this.addExtendedShape(this.node)
            } else {
                this.mergeValueNodeShapeConstraints(this.node)
            }
        }
        if (this.shaclAnd) {
            const list = this.config.lists[this.shaclAnd]
            if (list?.length) {
                for (const node of list) {
                    this.addExtendedShape(node as NamedNode)
                }
            }
        }
        return this
    }

    private addExtendedShape(node: NamedNode): void {
        if (!this.extendedShapes.some(shape => shape.value === node.value)) {
            this.extendedShapes.push(node)
        }
    }

    private mergeValueNodeShapeConstraints(node: NamedNode): void {
        for (const quad of this.config.store.getQuads(node, null, null, null)) {
            if (valueNodeConstraintPredicates.has(quad.predicate.id)) {
                mappers[quad.predicate.id]?.call(this, this, quad.object)
            }
        }
    }

    setPath(term: Term) {
        const path = this.id ? this.config.shapeGraph.getPath(this.id) : undefined
        this.pathExpression = path

        if (!path) {
            this.path = term.termType === 'NamedNode' ? term.value : undefined
            return
        }

        const predicate = getPredicatePath(path)
        if (predicate) {
            this.path = predicate.value
            return
        }

        const alternatives = getAlternativePredicatePaths(path)
        if (alternatives) {
            this.pathAlternatives = alternatives.map(alternative => alternative.value)
            this.pathAlternativeLabels = Object.fromEntries(
                this.pathAlternatives.map(path => [path, this.findAlternativePathLabel(path)])
            )
            this.path = this.pathAlternatives[0]
            return
        }

        console.warn(`unsupported SHACL property path ignored: ${pathToString(path)}`)
    }

    getPathLabel(path: string): string {
        return this.pathAlternativeLabels[path] || removePrefixes(path, this.config.prefixes)
    }

    createTemplateForAlternativePath(path: string): ShaclPropertyTemplate {
        const propertyShape = this.findSiblingPropertyShapeByPath(path)
        if (propertyShape) {
            const formPropertyShape = this.config.shapeGraph.getFormPropertyShape(propertyShape)
            const template = new ShaclPropertyTemplate(this.config.store.getQuads(propertyShape, null, null, null), this.parent, this.config, formPropertyShape)
            template.minCount = this.minCount
            template.maxCount = this.maxCount
            return template
        }

        const template = this.clone()
        template.path = path
        template.pathAlternatives = undefined
        template.pathAlternativeLabels = {}
        return template
    }

    private findAlternativePathLabel(path: string): string {
        const propertyShape = this.findSiblingPropertyShapeByPath(path)
        if (propertyShape) {
            const label = this.config.shapeGraph.getLabel(propertyShape)
            if (label) {
                return label
            }
        }

        const predicateLabel = this.config.shapeGraph.getLabel(DataFactory.namedNode(path))
        return predicateLabel || removePrefixes(path, this.config.prefixes)
    }

    private findSiblingPropertyShapeByPath(path: string): Term | undefined {
        for (const propertyShape of this.config.shapeGraph.getPropertyShapes(this.parent.shaclSubject)) {
            if (this.id?.termType === propertyShape.termType && this.id.value === propertyShape.value) {
                continue
            }

            const siblingPath = this.config.shapeGraph.getPath(propertyShape)
            const siblingPredicate = siblingPath ? getPredicatePath(siblingPath) : undefined
            if (siblingPredicate?.value === path) {
                return propertyShape
            }
        }
    }

    clone(): ShaclPropertyTemplate {
        const copy = Object.assign(Object.create(Object.getPrototypeOf(this)), this) as ShaclPropertyTemplate
        // arrays are not cloned but referenced, so create them manually
        copy.extendedShapes = [ ...this.extendedShapes ]
        copy.owlImports = [ ...this.owlImports ]
        if (this.languageIn) {
            copy.languageIn = [ ...this.languageIn ]
        }
        if (this.pathAlternatives) {
            copy.pathAlternatives = [ ...this.pathAlternatives ]
        }
        copy.pathAlternativeLabels = { ...this.pathAlternativeLabels }
        if (this.shaclOr) {
            copy.shaclOr = [ ...this.shaclOr ]
        }
        if (this.shaclXone) {
            copy.shaclXone = [ ...this.shaclXone ]
        }
        return copy
    }
}
