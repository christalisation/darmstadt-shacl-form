import { ShaclNode } from './node'
import { ShaclNodeCollection } from './node-collection'
import { Config } from './config'
import { ClassInstanceProvider, Plugin, listPlugins, registerPlugin } from './plugin'
import { Store, NamedNode, DataFactory, Quad, BlankNode } from 'n3'
import { DATA_GRAPH, PREFIX_SHACL, SHAPES_GRAPH } from './constants'
import { Editor, Theme } from './theme'
import { serialize } from './serialize'
import { findLabel } from './util'
import { Validator } from 'shacl-engine'
import { RokitCollapsible } from '@ro-kit/ui-widgets'

export class ShaclForm extends HTMLElement {
    static get observedAttributes() { return Config.dataAttributes() }

    config: Config
    // shape: ShaclNode | null = null
    nodeCollection: ShaclNodeCollection
    form: HTMLFormElement
    initDebounceTimeout: ReturnType<typeof setTimeout> | undefined

    private viewContainer: HTMLElement | undefined
    private breadcrumbContainer: HTMLElement | undefined
    private rootSelectorContainer: HTMLElement | undefined

    constructor(theme: Theme) {
        super()

        this.attachShadow({ mode: 'open' })
        this.form = document.createElement('form')
        this.config = new Config(theme, this.form)
        this.nodeCollection = new ShaclNodeCollection(this.config)
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
                this.nodeCollection.build()
                
                if (this.nodeCollection.rootNodes.length) {
                    // remove all previous css classes to have a defined state
                    this.form.classList.forEach(value => { this.form.classList.remove(value) })
                    this.form.classList.toggle('mode-edit', this.config.editMode)
                    this.form.classList.toggle('mode-view', !this.config.editMode)
                    // let theme add classes to form element
                    this.config.theme.apply(this.form)
                    // adopt stylesheets from theme and plugins
                    const styles: CSSStyleSheet[] = [this.config.theme.stylesheet];
                    const navigationStyleSheet = new CSSStyleSheet();
                    // Multiple root nodes support: add a breadcrumb
                    navigationStyleSheet.replaceSync(`
                        .breadcrumb-container { margin-bottom: 1rem; font-size: 0.9em; }
                        .breadcrumb-container a { color: var(--brand-color, #008877); cursor: pointer; text-decoration: underline; }
                        .breadcrumb-container span.separator { margin: 0 0.5em; }
                    `);
                    styles.push(navigationStyleSheet);

                    for (const plugin of listPlugins()) {
                        if (plugin.stylesheet) {
                            styles.push(plugin.stylesheet)
                        }
                    }
                    this.shadowRoot!.adoptedStyleSheets = styles

                    // Multiple root nodes support: 
                    if (this.nodeCollection.rootNodes.length > 1) {
                        // more than one root node, create the selector UI 
                        this.createNavigationUI()
                        this.showRootSelector()
                    } else {
                        // only one root node, display it directly
                        const rootNode = this.nodeCollection.rootNodes[0]
                        this.form.appendChild(rootNode)
                    }
                    
                    if (this.config.editMode) {
                        // add submit button
                        if (this.config.attributes.submitButton !== null) {
                            const button = this.config.theme.createButton(this.config.attributes.submitButton || 'Submit', true)
                            button.addEventListener('click', (event) => {
                                event.preventDefault()
                                // let browser check form validity first
                                if (this.form.reportValidity()) {
                                    // now validate data graph
                                    this.validate().then(report => {
                                        if (report?.conforms) {
                                            // form and data graph are valid, so fire submit event
                                            this.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
                                        } else {
                                            // focus first invalid element
                                            let invalidEditor = this.form.querySelector(':scope .invalid > .editor')
                                            if (invalidEditor) {
                                                (invalidEditor as HTMLElement).focus()
                                            } else {
                                                this.form.querySelector(':scope .invalid')?.scrollIntoView()
                                            }
                                        }
                                    })
                                }
                            })
                            this.form.appendChild(button)
                        }
                        // delete bound values from data graph, otherwise validation would be confused
                        if (this.config.attributes.valuesSubject) {
                            this.removeFromDataGraph(DataFactory.namedNode(this.config.attributes.valuesSubject))
                        }
                        await this.validate(true)
                    }
                } else if (this.config.store.countQuads(null, null, null, SHAPES_GRAPH) > 0) {
                    // raise error only when shapes graph is not empty
                    throw new Error('shacl root node shape not found')
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

    public serialize(format = 'text/turtle', graph = this.toRDF()): string {
        const quads = graph.getQuads(null, null, null, null)
        return serialize(quads, format, this.config.prefixes)
    }

    public toRDF(graph = new Store()): Store {
        // this.shape?.toRDF(graph)
        this.nodeCollection?.toRDF(graph)
        return graph
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

    /* Returns the validation report */
    public async validate(ignoreEmptyValues = false): Promise<any> {
        for (const elem of this.form.querySelectorAll(':scope .validation-error')) {
            elem.remove()
        }
        for (const elem of this.form.querySelectorAll(':scope .property-instance')) {
            elem.classList.remove('invalid')
            if (((elem.querySelector(':scope > .editor')) as Editor)?.value) {
                elem.classList.add('valid')
            } else {
                elem.classList.remove('valid')
            }
        }

        this.config.store.deleteGraph(this.config.valuesGraphId || '')
        // if (this.shape) {
        //     this.shape.toRDF(this.config.store)
        //     // add node target for validation. this is required in case of missing sh:targetClass in root shape
        //     this.config.store.add(new Quad(this.shape.shaclSubject, DataFactory.namedNode(PREFIX_SHACL + 'targetNode'), this.shape.nodeId, this.config.valuesGraphId))
        if (this.nodeCollection?.rootNodes.length) {
            this.nodeCollection.toRDF(this.config.store)
            // add node target for validation for each root node. this is required in case of missing sh:targetClass in root shape
            for (const rootNode of this.nodeCollection.rootNodes) {
                this.config.store.add(new Quad(rootNode.shaclSubject, DataFactory.namedNode(PREFIX_SHACL + 'targetNode'), rootNode.nodeId, this.config.valuesGraphId))
            }
        }
        try {
            const dataset = this.config.store
            const report = await new Validator(dataset, { details: true, factory: DataFactory }).validate({ dataset })

            for (const result of report.results) {
                if (result.focusNode?.ptrs?.length) {
                    for (const ptr of result.focusNode.ptrs) {
                        const focusNode = ptr._term
                        // result.path can be empty, e.g. if a focus node does not contain a required property node
                        if (result.path?.length) {
                            const path = result.path[0].predicates[0]
                            // try to find most specific editor elements first
                            let invalidElements = this.form.querySelectorAll(`
                                :scope shacl-node[data-node-id='${focusNode.id}'] > shacl-property > .property-instance[data-path='${path.id}'] > .editor,
                                :scope shacl-node[data-node-id='${focusNode.id}'] > shacl-property > .shacl-group > .property-instance[data-path='${path.id}'] > .editor,
                                :scope shacl-node[data-node-id='${focusNode.id}'] > .shacl-group > shacl-property > .property-instance[data-path='${path.id}'] > .editor,
                                :scope shacl-node[data-node-id='${focusNode.id}'] > .shacl-group > shacl-property > .shacl-group > .property-instance[data-path='${path.id}'] > .editor`)
                            if (invalidElements.length === 0) {
                                // if no editors found, select respective node. this will be the case for node shape violations.
                                invalidElements = this.form.querySelectorAll(`
                                    :scope [data-node-id='${focusNode.id}']  > shacl-property > .property-instance[data-path='${path.id}'],
                                    :scope [data-node-id='${focusNode.id}']  > shacl-property > .shacl-group > .property-instance[data-path='${path.id}']`)
                            }

                            for (const invalidElement of invalidElements) {
                                if (invalidElement.classList.contains('editor')) {
                                    // this is a property shape violation
                                    if (!ignoreEmptyValues || (invalidElement as Editor).value) {
                                        let parent: HTMLElement | null = invalidElement.parentElement!
                                        parent.classList.add('invalid')
                                        parent.classList.remove('valid')
                                        parent.appendChild(this.createValidationErrorDisplay(result))
                                        do {
                                            if (parent instanceof RokitCollapsible) {
                                                parent.open = true
                                            }
                                            parent = parent.parentElement
                                        } while (parent)
                                    }
                                } else if (!ignoreEmptyValues) {
                                    // this is a node shape violation
                                    invalidElement.classList.add('invalid')
                                    invalidElement.classList.remove('valid')
                                    invalidElement.appendChild(this.createValidationErrorDisplay(result, 'node'))
                                }
                            }
                        } else if (!ignoreEmptyValues) {
                            this.form.querySelector(`:scope [data-node-id='${focusNode.id}']`)?.prepend(this.createValidationErrorDisplay(result, 'node'))
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

    private createNavigationUI() {
        this.breadcrumbContainer = document.createElement('div');
        this.breadcrumbContainer.className = 'breadcrumb-container';

        this.rootSelectorContainer = document.createElement('div');
        this.rootSelectorContainer.className = 'root-selector-container';

        this.viewContainer = document.createElement('div');
        this.viewContainer.className = 'view-container';

        const select = document.createElement('select');
        select.classList.add('form-select', 'editor'); // Use theme-agnostic classes

        const placeholder = document.createElement('option');
        placeholder.innerText = 'Select a shape to edit...';
        placeholder.value = '';
        select.appendChild(placeholder);

        this.nodeCollection.rootNodes.forEach((node, index) => {
            const option = document.createElement('option');
            const label = findLabel(this.config.store.getQuads(node.shaclSubject, null, null, null), this.config.languages) || node.shaclSubject.value;
            option.innerText = label;
            option.value = index.toString();
            select.appendChild(option);
        });

        select.addEventListener('change', () => {
            const selectedIndex = parseInt(select.value, 10);
            if (!isNaN(selectedIndex)) {
                const selectedNode = this.nodeCollection.rootNodes[selectedIndex];
                this.setActiveNode(selectedNode);
            }
        });

        this.rootSelectorContainer.appendChild(select);
        this.form.appendChild(this.breadcrumbContainer);
        this.form.appendChild(this.rootSelectorContainer);
        this.form.appendChild(this.viewContainer);
    }

    private setActiveNode(node: ShaclNode) {
        this.viewContainer!.replaceChildren(node);
        this.rootSelectorContainer!.style.display = 'none';
        this.updateBreadcrumb(node);
    }

    private showRootSelector() {
        this.viewContainer!.replaceChildren();
        this.breadcrumbContainer!.replaceChildren();
        this.rootSelectorContainer!.style.display = 'block';
    }

    private updateBreadcrumb(node: ShaclNode) {
        this.breadcrumbContainer!.replaceChildren();
        const homeLink = document.createElement('a');
        homeLink.innerText = 'Select Shape';
        homeLink.onclick = (e) => { e.preventDefault(); this.showRootSelector(); };
        this.breadcrumbContainer!.appendChild(homeLink);

        const separator = document.createElement('span');
        separator.className = 'separator';
        separator.innerText = '›';
        this.breadcrumbContainer!.appendChild(separator);

        const activeNodeLabel = document.createElement('span');
        const label = findLabel(this.config.store.getQuads(node.shaclSubject, null, null, null), this.config.languages) || node.shaclSubject.value;
        activeNodeLabel.innerText = label;
        this.breadcrumbContainer!.appendChild(activeNodeLabel);
    }

    // private findRootShaclShapeSubject(): NamedNode | undefined 
    // is now moved into class ShaclNodeCollection.

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
