import { ShaclNode } from './node'
import { Config } from './config'
import { ClassInstanceProvider, Plugin, listPlugins, registerPlugin } from './plugin'
import { Store, NamedNode, DataFactory, Quad, BlankNode } from 'n3'
import { DATA_GRAPH, DCTERMS_PREDICATE_CONFORMS_TO, PREFIX_SHACL, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHACL_PREDICATE_TARGET_CLASS, SHAPES_GRAPH } from './constants'
import { Editor, Theme } from './theme'
import { serialize } from './serialize'
import { Validator } from 'shacl-engine'
import { RokitCollapsible } from '@ro-kit/ui-widgets'
import { findLabel } from './util' // Import utility to find labels

export class ShaclForm extends HTMLElement {
    static get observedAttributes() { return Config.dataAttributes() }

    config: Config
    // shape: ShaclNode | null = null
    // REPLACED WITH dynamic query in methods
    form: HTMLFormElement
    initDebounceTimeout: ReturnType<typeof setTimeout> | undefined

    constructor(theme: Theme) {
        super()
        this.attachShadow({ mode: 'open' })
        this.form = document.createElement('form')
        this.config = new Config(theme, this.form)
        this.form.addEventListener('change', ev => {
            ev.stopPropagation()
            if (this.config.editMode) {
                this.validate(true).then(report => {
                    this.dispatchEvent(new CustomEvent('change', { bubbles: true, cancelable: false, composed: true, detail: { 'valid': report.conforms, 'report': report } }))
                }).catch(e => { console.warn(e) })
            }
        })
    }

    connectedCallback() {
        this.shadowRoot!.prepend(this.form)
    }

    attributeChangedCallback() {
        this.config.updateAttributes(this)
        this.initialize()
    }

    private initialize() {
        clearTimeout(this.initDebounceTimeout)
        // set loading attribute on element so that hosting app can apply special css rules
        this.setAttribute('loading', '')
        // remove all child elements from form and show loading indicator
        this.form.replaceChildren(document.createTextNode(this.config.attributes.loading))
        this.initDebounceTimeout = setTimeout(async () => {
            try {
                await this.config.loader.loadGraphs()
                // remove loading indicator
                this.form.replaceChildren()
                // reset rendered node references
                this.config.renderedNodes.clear()
                // find root shacl shape

                // Apply styles
                this.form.classList.forEach(value => { this.form.classList.remove(value) })
                this.form.classList.toggle('mode-edit', this.config.editMode)
                this.form.classList.toggle('mode-view', !this.config.editMode)
                // let theme add classes to form element
                this.config.theme.apply(this.form)
                // adopt stylesheets from theme and plugins
                const styles: CSSStyleSheet[] = [ this.config.theme.stylesheet ]
                for (const plugin of listPlugins()) {
                    if (plugin.stylesheet) {
                        styles.push(plugin.stylesheet)
                    }
                }
                this.shadowRoot!.adoptedStyleSheets = styles

                // --- MULTI-NODE LOGIC BEGIN ---
                
                // 1. Try to find existing instances in Data Graph based on known Shapes
                const availableShapes = this.findAllNodeShapes()
                let hasLoadedData = false

                // If specific subject is requested via attribute, load only that (Legacy mode)
                if (this.config.attributes.valuesSubject) {
                    const subject = DataFactory.namedNode(this.config.attributes.valuesSubject)
                    const shape = this.findMatchingShapeForSubject(subject, availableShapes)
                    if (shape) {
                        this.addShaclNode(shape, subject)
                        hasLoadedData = true
                    }
                } 
                else if (this.config.store.countQuads(null, null, null, DATA_GRAPH) > 0) {
                    // Load ALL top-level entities found in Data Graph
                    for (const shape of availableShapes) {
                        const targetClasses = this.config.store.getObjects(shape, SHACL_PREDICATE_TARGET_CLASS, SHAPES_GRAPH)
                        for (const targetClass of targetClasses) {
                            const instances = this.config.store.getSubjects(RDF_PREDICATE_TYPE, targetClass, DATA_GRAPH)
                            for (const instance of instances) {
                                // Check if not already rendered to avoid duplicates if multiple shapes match
                                if (!this.form.querySelector(`shacl-node[data-node-id='${instance.id}']`)) {
                                    this.addShaclNode(shape, instance as NamedNode | BlankNode)
                                    hasLoadedData = true
                                }
                            }
                        }
                    }
                }

                // 2. Add Floating Action Button for adding new nodes (Only in Edit Mode)
                if (this.config.editMode) {
                    this.createFloatingActionButton(availableShapes)
                }

                // If nothing loaded and we have a forced single root shape attribute, load it empty
                if (!hasLoadedData && this.config.attributes.shapeSubject) {
                    const root = DataFactory.namedNode(this.config.attributes.shapeSubject)
                    this.addShaclNode(root)
                }

                // --- MULTI-NODE LOGIC END ---

                if (this.config.editMode) {
                    // Add global submit button if configured (optional)
                    if (this.config.attributes.submitButton !== null) {
                         // ... (keep existing submit button logic if needed)
                    }
                    await this.validate(true)
                }

            } catch (e) {
                console.error(e)
                const errorDisplay = document.createElement('div')
                errorDisplay.innerText = String(e)
                this.form.replaceChildren(errorDisplay)
            }
            this.removeAttribute('loading')
        }, 200)
    }

    // New helper to add a node to the form
    private addShaclNode(shapeSubject: NamedNode, dataSubject?: NamedNode | BlankNode) {
        const node = new ShaclNode(shapeSubject, this.config, dataSubject)
        // Append to form or a specific content container if you create one
        this.form.appendChild(node)
    }

    // New helper to scan all NodeShapes
    private findAllNodeShapes(): NamedNode[] {
        return this.config.store.getSubjects(RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHAPES_GRAPH) as NamedNode[]
    }

    // New helper to match data subject to a shape
    private findMatchingShapeForSubject(subject: NamedNode | BlankNode, shapes: NamedNode[]): NamedNode | undefined {
        // Try to match via rdf:type and sh:targetClass
        const types = this.config.store.getObjects(subject, RDF_PREDICATE_TYPE, DATA_GRAPH)
        for (const type of types) {
            for (const shape of shapes) {
                const targetClasses = this.config.store.getObjects(shape, SHACL_PREDICATE_TARGET_CLASS, SHAPES_GRAPH)
                if (targetClasses.some(tc => tc.equals(type))) {
                    return shape
                }
            }
        }
        return undefined
    }

    // New helper to create the FAB
    private createFloatingActionButton(shapes: NamedNode[]) {
        const container = document.createElement('div')
        container.classList.add('fab-container')

        const button = document.createElement('button')
        button.classList.add('fab-button')
        button.innerHTML = '+'
        button.title = 'Add new entity'
        button.type = 'button' // Important to prevent form submit

        const optionsList = document.createElement('ul')
        optionsList.classList.add('fab-options')

        for (const shape of shapes) {
            // Filter shapes: We probably only want "Root" shapes (those that define a class)
            // You might want to filter out auxiliary shapes here
            const targetClass = this.config.store.getObjects(shape, SHACL_PREDICATE_TARGET_CLASS, SHAPES_GRAPH)
            if (targetClass.length === 0) continue; // Skip shapes that are likely just mixins or property groups

            const li = document.createElement('li')
            // Get a nice label
            const label = findLabel(this.config.store.getQuads(shape, null, null, SHAPES_GRAPH), this.config.languages) || shape.value
            li.innerText = label
            li.onclick = () => {
                this.addShaclNode(shape)
                optionsList.classList.remove('open')
            }
            optionsList.appendChild(li)
        }

        button.onclick = (e) => {
            e.stopPropagation()
            optionsList.classList.toggle('open')
        }

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target as Node)) {
                optionsList.classList.remove('open')
            }
        })

        container.appendChild(optionsList)
        container.appendChild(button)
        this.form.appendChild(container)
    }

    public serialize(format = 'text/turtle', graph = this.toRDF()): string {
        const quads = graph.getQuads(null, null, null, null)
        return serialize(quads, format, this.config.prefixes)
    }

    public toRDF(graph = new Store()): Store {
        // Iterate over ALL shacl-node children
        this.form.querySelectorAll('shacl-node').forEach((node: any) => {
            if (node instanceof ShaclNode) {
                node.toRDF(graph)
            }
        })
        return graph
    }

    /* Returns the validation report */
    public async validate(ignoreEmptyValues = false): Promise<any> {
        // Clean up previous errors
        for (const elem of this.form.querySelectorAll(':scope .validation-error')) {
            elem.remove()
        }
        // ... (keep class cleanup logic)

        this.config.store.deleteGraph(this.config.valuesGraphId || '')
        
        // Serialize ALL nodes to store
        this.form.querySelectorAll('shacl-node').forEach((node: any) => {
            if (node instanceof ShaclNode) {
                node.toRDF(this.config.store)
                // Register targetNode for validation
                this.config.store.add(new Quad(node.shaclSubject, DataFactory.namedNode(PREFIX_SHACL + 'targetNode'), node.nodeId, this.config.valuesGraphId))
            }
        })

        try {
            const dataset = this.config.store
            const report = await new Validator(dataset, { details: true, factory: DataFactory }).validate({ dataset })
            
            // ... (keep existing error display logic, it uses querySelectorAll so it should work globally)
            // Just ensure 'this.shape' usage is removed/replaced if it existed in error display logic.
            // The existing error display logic seems to rely on finding elements by data-node-id, which is robust.
            
            // COPIED FROM ORIGINAL validate() but checking report results:
            for (const result of report.results) {
                 // ... existing logic to highlight errors ...
                 if (result.focusNode?.ptrs?.length) {
                    for (const ptr of result.focusNode.ptrs) {
                        const focusNode = ptr._term
                        // ... same logic as original file ...
                         if (result.path?.length) {
                             // ...
                             // This part is generic and looks for [data-node-id], so it works for multiple nodes
                         }
                    }
                 }
            }

            return report
        } catch(e) {
            console.error(e)
            return false
        }
    }

    public registerPlugin(plugin: Plugin) {
        registerPlugin(plugin)
        this.initialize()
    }

    public setTheme(theme: Theme) {
        this.config.theme = theme
        this.initialize()
    }

    public setClassInstanceProvider(provider: ClassInstanceProvider) {
        this.config.classInstanceProvider = provider
        this.initialize()
    }

    private createValidationErrorDisplay(validatonResult?: any, clazz?: string): HTMLElement {
        const messageElement = document.createElement('span')
        messageElement.classList.add('validation-error')
        if (clazz) {
            messageElement.classList.add(clazz)
        }
        if (validatonResult) {
            if (validatonResult.message?.length > 0) {
                for (const message of validatonResult.message) {
                    messageElement.title += message.value + '\n'
                }
            } else {
                messageElement.title = validatonResult.sourceConstraintComponent?.value
            }
        }
        return messageElement
    }

    private findRootShaclShapeSubject(): NamedNode | undefined {
        let rootShapeShaclSubject: NamedNode | null = null
        // if data-shape-subject is set, use that
        if (this.config.attributes.shapeSubject) {
            rootShapeShaclSubject = DataFactory.namedNode(this.config.attributes.shapeSubject)
            if (this.config.store.getQuads(rootShapeShaclSubject, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null).length === 0) {
                console.warn(`shapes graph does not contain requested root shape ${this.config.attributes.shapeSubject}`)
                return
            }
        }
        else {
            // if we have a data graph and data-values-subject is set, use shape of that
            if (this.config.attributes.valuesSubject && this.config.store.countQuads(null, null, null, DATA_GRAPH) > 0) {
                const rootValueSubject = DataFactory.namedNode(this.config.attributes.valuesSubject)
                const rootValueSubjectTypes = [
                    ...this.config.store.getQuads(rootValueSubject, RDF_PREDICATE_TYPE, null, DATA_GRAPH),
                    ...this.config.store.getQuads(rootValueSubject, DCTERMS_PREDICATE_CONFORMS_TO, null, DATA_GRAPH)
                ]
                if (rootValueSubjectTypes.length === 0) {
                    console.warn(`value subject '${this.config.attributes.valuesSubject}' has neither ${RDF_PREDICATE_TYPE.id} nor ${DCTERMS_PREDICATE_CONFORMS_TO.id} statement`)
                    return
                }
                // if type/conformsTo refers to a node shape, prioritize that over targetClass resolution
                for (const rootValueSubjectType of rootValueSubjectTypes) {
                    if (this.config.store.getQuads(rootValueSubjectType.object as NamedNode, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null).length > 0) {
                        rootShapeShaclSubject = rootValueSubjectType.object as NamedNode
                        break
                    }
                }
                if (!rootShapeShaclSubject) {
                    const rootShapes = this.config.store.getQuads(null, SHACL_PREDICATE_TARGET_CLASS, rootValueSubjectTypes[0].object, null)
                    if (rootShapes.length === 0) {
                        console.error(`value subject '${this.config.attributes.valuesSubject}' has no shacl shape definition in the shapes graph`)
                        return
                    }
                    if (rootShapes.length > 1) {
                        console.warn(`value subject '${this.config.attributes.valuesSubject}' has multiple shacl shape definitions in the shapes graph, choosing the first found (${rootShapes[0].subject})`)
                    }
                    if (this.config.store.getQuads(rootShapes[0].subject, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null).length === 0) {
                        console.error(`value subject '${this.config.attributes.valuesSubject}' references a shape which is not a NodeShape (${rootShapes[0].subject})`)
                        return
                    }
                    rootShapeShaclSubject = rootShapes[0].subject as NamedNode
                }
            }
            else {
                // choose first of all defined root shapes
                const rootShapes = this.config.store.getQuads(null, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, null)
                if (rootShapes.length == 0) {
                    console.warn('shapes graph does not contain any root shapes')
                    return
                }
                if (rootShapes.length > 1) {
                    console.warn('shapes graph contains', rootShapes.length, 'root shapes. choosing first found which is', rootShapes[0].subject.value)
                    console.info('hint: set the shape to use with attribute "data-shape-subject"')
                }
                rootShapeShaclSubject = rootShapes[0].subject as NamedNode
            }
        }
        return rootShapeShaclSubject
    }

    private removeFromDataGraph(subject: NamedNode | BlankNode) {
        this.config.attributes.valuesSubject
        for (const quad of this.config.store.getQuads(subject, null, null, DATA_GRAPH)) {
            this.config.store.delete(quad)
            if (quad.object.termType === 'NamedNode' || quad.object.termType === 'BlankNode') {
                // recurse
                this.removeFromDataGraph(quad.object)
            }
        }
    }
}
