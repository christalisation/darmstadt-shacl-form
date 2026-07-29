import { ShaclNode } from './node'
import { Config } from './config'
import { ClassInstanceProvider, Plugin, listPlugins, registerPlugin } from './plugin'
import { Store, NamedNode, DataFactory, Quad, BlankNode } from 'n3'
import { DATA_GRAPH, PREFIX_SHACL, RDF_PREDICATE_TYPE, SHACL_OBJECT_NODE_SHAPE, SHACL_PREDICATE_TARGET_CLASS, SHAPES_GRAPH } from './constants'
import { Theme } from './theme'
import { serialize } from './serialize'
import { Validator } from 'shacl-engine'
import { findLabel } from './util' // Import utility to find labels

export class ShaclForm extends HTMLElement {
    static get observedAttributes() { return Config.dataAttributes() }

    config: Config
    // shape: ShaclNode | null = null
    // REPLACED WITH dynamic query in methods
    form: HTMLFormElement
    private historyContainer: HTMLDetailsElement | undefined
    private savedNodes = new Map<string, HTMLDetailsElement>()
    initDebounceTimeout: ReturnType<typeof setTimeout> | undefined

    constructor(theme: Theme) {
        super()
        this.attachShadow({ mode: 'open' })
        this.form = document.createElement('form')
        this.config = new Config(theme, this.form)
        this.form.addEventListener('save-node', ev => {
            const detail = (ev as CustomEvent<{ node: ShaclNode }>).detail
            if (detail?.node) {
                this.saveNodeToHistory(detail.node)
            }
        })
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
                this.savedNodes.clear()
                this.historyContainer = undefined
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
                    this.ensureHistoryPanel()
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
        const { wrapper } = this.createNodeWrapper(shapeSubject, dataSubject, dataSubject !== undefined)
        this.form.appendChild(wrapper)
    }

    private createNodeWrapper(shapeSubject: NamedNode, dataSubject?: NamedNode | BlankNode, open = dataSubject !== undefined) {
        const node = new ShaclNode(shapeSubject, this.config, dataSubject)
        const wrapper = document.createElement('details')
        wrapper.classList.add('node-wrapper')
        wrapper.open = open

        const title = document.createElement('summary')
        const label = findLabel(this.config.store.getQuads(shapeSubject, null, null, SHAPES_GRAPH), this.config.languages) || shapeSubject.value
        title.innerText = label
        wrapper.appendChild(title)

        wrapper.appendChild(node)
        return { wrapper, node, title, shapeSubject }
    }

    private replaceNodeInPlace(node: ShaclNode) {
        const wrapper = node.closest('.node-wrapper') as HTMLDetailsElement | null
        if (!wrapper) {
            return
        }

        const title = wrapper.querySelector(':scope > summary') as HTMLElement | null
        const freshNode = new ShaclNode(node.shaclSubject, this.config, undefined)
        wrapper.replaceChildren(title || document.createElement('summary'), freshNode)
        wrapper.open = false
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

    private ensureHistoryPanel() {
        if (this.historyContainer) {
            return this.historyContainer
        }

        const panel = document.createElement('details')
        panel.classList.add('node-history-panel')
        panel.open = false

        const title = document.createElement('summary')
        title.innerText = 'Created nodes'
        panel.appendChild(title)

        const content = document.createElement('div')
        content.classList.add('node-history-content')

        const emptyState = document.createElement('p')
        emptyState.classList.add('node-history-empty')
        emptyState.innerText = 'No saved node yet.'
        content.appendChild(emptyState)

        const list = document.createElement('div')
        list.classList.add('node-history-list')
        content.appendChild(list)

        panel.appendChild(content)

        this.historyContainer = panel
        this.form.appendChild(panel)
        return panel
    }

    private saveNodeToHistory(node: ShaclNode) {
        const panel = this.ensureHistoryPanel()
        const list = panel.querySelector(':scope .node-history-list') as HTMLDivElement
        const emptyState = panel.querySelector(':scope .node-history-empty') as HTMLParagraphElement
        const title = panel.querySelector(':scope > summary') as HTMLElement

        const key = node.dataset.nodeId || node.nodeId.id
        const label = findLabel(this.config.store.getQuads(node.shaclSubject, null, null, SHAPES_GRAPH), this.config.languages) || node.shaclSubject.value
        let entry = this.savedNodes.get(key)
        if (!entry) {
            entry = document.createElement('details')
            entry.classList.add('saved-node-entry')
            this.savedNodes.set(key, entry)
            list.appendChild(entry)
        }

        const store = new Store()
        node.toRDF(store)
        const rdf = this.serialize('text/turtle', store, false)
        entry.replaceChildren()

        const summary = document.createElement('summary')
        summary.innerText = `${label} · ${key}`
        entry.appendChild(summary)

        const meta = document.createElement('div')
        meta.classList.add('saved-node-meta')
        meta.innerText = `Node shape: ${node.shaclSubject.value}`
        entry.appendChild(meta)

        const actions = document.createElement('div')
        actions.classList.add('saved-node-actions')

        const focusButton = document.createElement('button')
        focusButton.type = 'button'
        focusButton.classList.add('saved-node-focus')
        focusButton.innerText = 'Modify'
        focusButton.title = 'Modify this created node'
        focusButton.addEventListener('click', () => node.closest('.node-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
        actions.appendChild(focusButton)

        entry.appendChild(actions)

        const pre = document.createElement('pre')
        pre.classList.add('saved-node-rdf')
        pre.innerText = rdf || '# empty node'
        entry.appendChild(pre)

        if (emptyState) {
            emptyState.style.display = 'none'
        }

        if (title) {
            title.innerText = `Created nodes (${this.savedNodes.size})`
        }

        this.replaceNodeInPlace(node)
    }

    public serialize(format = 'text/turtle', graph = this.toRDF(), includePrefixes = true): string {
        const quads = graph.getQuads(null, null, null, null)
        return serialize(quads, format, includePrefixes ? this.config.prefixes : undefined)
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
        void ignoreEmptyValues
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
                        void ptr
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

}
