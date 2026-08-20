import { DataFactory, NamedNode, Prefixes, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { ClassInstanceProvider } from './plugin'
import { Loader } from './loader'
import { Theme } from './theme'
import { ShaclShapeRegistry, ShaclShapeResolver } from './shacl'
import { FormRootSelection, FormShapeCompiler, FormShapeRegistry } from './form-shape'

export class ElementAttributes {
    shapes: string | null = null
    shapesUrl: string | null = null
    shapeSubject: string | null = null
    values: string | null = null
    valuesUrl: string | null = null
    /**
     * @deprecated Use valuesSubject instead
     */
    valueSubject: string | null = null // for backward compatibility
    valuesSubject: string | null = null
    valuesNamespace = ''
    valuesGraph: string | null = null
    view: string | null = null
    language: string | null = null
    loading: string = 'Loading\u2026'
    proxy: string | null = null
    ignoreOwlImports: string | null = null
    skipShapeValidation: string | null = null
    collapse: string | null = null
    submitButton: string | null = null
    generateNodeShapeReference: string | null = null
    showNodeIds: string | null = null
}

export class Config {
    attributes = new ElementAttributes()
    loader = new Loader(this)
    classInstanceProvider: ClassInstanceProvider | undefined
    prefixes: Prefixes = {}
    editMode = true
    languages: string[]
    shaclShapes!: ShaclShapeRegistry
    formShapes!: FormShapeRegistry
    rootSelection!: FormRootSelection

    lists: Record<string, Term[]> = {}
    groups: Array<string> = []
    theme: Theme
    form: HTMLElement
    renderedNodes = new Set<string>()
    valuesGraphId: NamedNode | undefined
    private _store = new Store()

    constructor(theme: Theme, form: HTMLElement) {
        this.theme = theme
        this.form = form
        this.languages = [...new Set(navigator.languages.flatMap(lang => {
            if (lang.length > 2) {
                // for each 5 letter lang code (e.g. de-DE) append its corresponding 2 letter code (e.g. de) directly afterwards
                return [lang.toLocaleLowerCase(), lang.substring(0, 2)]
            } 
            return lang
        })), ''] // <-- append empty string to accept RDF literals with no language
        this.rebuildShapeLayers(this._store)
    }
 
    updateAttributes(elem: HTMLElement) {
        const atts = new ElementAttributes();
        (Object.keys(atts) as Array<keyof ElementAttributes>).forEach(key => {
            const value = elem.dataset[key]
            if (value !== undefined) {
                atts[key] = value
            }
        })
        this.editMode = atts.view === null
        this.attributes = atts
        // for backward compatibility
        if (this.attributes.valueSubject && !this.attributes.valuesSubject) {
            this.attributes.valuesSubject = this.attributes.valueSubject
        }
        if (atts.language) {
            const index = this.languages.indexOf(atts.language)
            if (index > -1) {
                // remove preferred language from the list of languages
                this.languages.splice(index, 1)
            }
            // now prepend preferred language at start of the list of languages
            this.languages.unshift(atts.language)
        }
        if (atts.valuesGraph) {
            this.valuesGraphId = DataFactory.namedNode(atts.valuesGraph)
        }
    }

    static dataAttributes(): Array<string> {
        const atts = new ElementAttributes()
        return Object.keys(atts).map(key => {
            // convert camelcase key to kebap case
            key = key.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
            return 'data-' + key
        })
    }

    get store() {
        return this._store
    }

    set store(store: Store) {
        this._store = store
        this.rebuildShapeLayers(store)
    }

    private rebuildShapeLayers(store: Store) {
        this.shaclShapes = new ShaclShapeRegistry(store, this.languages)
        const resolver = new ShaclShapeResolver({
            resolveNodeShape: id => this.shaclShapes.getNodeShape(id),
            resolvePropertyShape: id => this.shaclShapes.getPropertyShape(id),
        })
        const compiler = new FormShapeCompiler({
            languages: this.languages,
            prefixes: this.prefixes,
            resolveNodeShape: id => this.shaclShapes.getNodeShape(id),
            findNodeShapeByTargetClass: targetClass => this.shaclShapes.findNodeShapeByTargetClass(targetClass),
            findNodeShapesByTargetObjectsOf: predicate => this.shaclShapes.findNodeShapesByTargetObjectsOf(predicate),
            findNodeShapesByLogicalBranch: branch => this.shaclShapes.findNodeShapesByLogicalBranch(branch),
            findCompatibleNodeShapes: baseShape => this.formShapes?.getCompatibleNodeShapeTerms(baseShape) || [],
            labelForTerm: term => this.shaclShapes.getLabel(term),
            shapeResolver: resolver,
        })
        this.formShapes = new FormShapeRegistry(compiler, this.shaclShapes)
        this.rootSelection = new FormRootSelection(store, this.shaclShapes)
        this.lists = this.shaclShapes.lists
        this.groups = this.shaclShapes.propertyGroupIds
    }
}
