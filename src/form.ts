import { ShaclNode } from './node'
import { ShaclNodeCollection } from './node-collection'
import { Config } from './config'
import { ClassInstanceProvider, Plugin, listPlugins, registerPlugin } from './plugin'
import { Store, NamedNode, DataFactory, Quad, BlankNode } from 'n3'
import { DATA_GRAPH, PREFIX_SHACL, REFERENCE_GRAPH, SHAPES_GRAPH } from './constants'
import { Editor, Theme } from './theme'
import { serialize } from './serialize'
import { findLabel, removePrefixes } from './util'
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
    private commitRootButtonContainer: HTMLElement | undefined
    private activeRootNode: ShaclNode | undefined

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
                    this.dispatchChange(report)
                }).catch(e => { console.warn(e) })
            }
        })
        this.form.addEventListener('focus-node', (ev: Event) => {
            const customEvent = ev as CustomEvent;
            ev.stopPropagation();
            if (customEvent.detail.node) {
                this.setActiveNode(customEvent.detail.node);
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
                this.activeRootNode = undefined
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
                        .commit-root-container { display: flex; justify-content: flex-end; margin: 0.25rem 0 0.75rem; }
                        .commit-root-button { align-self: flex-end; }
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
                        this.activeRootNode = rootNode
                        this.form.appendChild(rootNode)
                        this.updateCommitRootButton(rootNode)
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
                                            this.focusFirstInvalidElement()
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
        for (const rootNode of this.getSerializableRootNodes()) {
            rootNode.toRDF(graph)
        }
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
    public async validate(ignoreEmptyValues = false, includeEmptyActiveRootNode = false): Promise<any> {
        for (const elem of this.form.querySelectorAll(':scope .validation-error')) {
            elem.remove()
        }
        for (const elem of this.form.querySelectorAll(':scope .validation-summary')) {
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

        this.clearGeneratedValuesGraph()
        // if (this.shape) {
        //     this.shape.toRDF(this.config.store)
        //     // add node target for validation. this is required in case of missing sh:targetClass in root shape
        //     this.config.store.add(new Quad(this.shape.shaclSubject, DataFactory.namedNode(PREFIX_SHACL + 'targetNode'), this.shape.nodeId, this.config.valuesGraphId))
        const rootNodes = this.getSerializableRootNodes(includeEmptyActiveRootNode)
        if (rootNodes.length) {
            for (const rootNode of rootNodes) {
                rootNode.toRDF(this.config.store)
            }
            // add node target for validation for each root node. this is required in case of missing sh:targetClass in root shape
            for (const rootNode of rootNodes) {
                this.config.store.add(new Quad(rootNode.shaclSubject, DataFactory.namedNode(PREFIX_SHACL + 'targetNode'), rootNode.nodeId, this.config.valuesGraphId))
            }
        }
        try {
            const dataset = this.createValidationDataset()
            const report = await new Validator(dataset, { details: true, factory: DataFactory }).validate({ dataset })
            const unmappedResults: any[] = []

            for (const result of this.flattenValidationResults(report.results)) {
                let mappedInline = false
                if (result.focusNode?.ptrs?.length) {
                    for (const ptr of result.focusNode.ptrs) {
                        const focusNode = ptr._term
                        // result.path can be empty, e.g. if a focus node does not contain a required property node
                        if (result.path?.length) {
                            const paths = this.getValidationPathPredicates(result)
                            // try to find most specific editor elements first
                            let invalidElements = this.findInvalidElementsForPaths(focusNode.id, paths)

                            for (const invalidElement of invalidElements) {
                                if (invalidElement.classList.contains('editor')) {
                                    // this is a property shape violation
                                    if (!ignoreEmptyValues || (invalidElement as Editor).value) {
                                        let parent: HTMLElement | null = invalidElement.parentElement!
                                        parent.classList.add('invalid')
                                        parent.classList.remove('valid')
                                            parent.appendChild(this.createValidationErrorDisplay(result))
                                            mappedInline = true
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
                                    mappedInline = true
                                }
                            }
                        } else if (!ignoreEmptyValues) {
                            const nodeElement = this.form.querySelector(`:scope [data-node-id='${focusNode.id}']`)
                            nodeElement?.prepend(this.createValidationErrorDisplay(result, 'node'))
                            mappedInline = Boolean(nodeElement)
                        }
                    }
                }
                if (!mappedInline && !ignoreEmptyValues) {
                    unmappedResults.push(result)
                }
            }
            if (unmappedResults.length) {
                this.form.prepend(this.createValidationSummary(unmappedResults))
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
            messageElement.title = this.getValidationMessages(validatonResult).join('\n')
        }
        if (!messageElement.title) {
            messageElement.title = 'Validation failed'
        }
        return messageElement
    }

    private createValidationSummary(results: any[]): HTMLElement {
        const summary = document.createElement('div')
        summary.classList.add('validation-summary')

        const heading = document.createElement('strong')
        heading.innerText = 'Validation issues'
        summary.appendChild(heading)

        const list = document.createElement('ul')
        for (const result of this.uniqueValidationResults(results)) {
            const item = document.createElement('li')
            const details = [
                this.formatValidationFocusNodes(result),
                this.formatValidationPath(result),
                this.getValidationMessages(result).join('; ') || 'Validation failed',
            ].filter(Boolean)
            item.innerText = details.join(' - ')
            list.appendChild(item)
        }
        summary.appendChild(list)
        return summary
    }

    private uniqueValidationResults(results: any[]): any[] {
        return [...new Map(results.map(result => [
            [
                this.formatValidationFocusNodes(result),
                this.formatValidationPath(result),
                this.getValidationMessages(result).join('\n'),
            ].join('|'),
            result,
        ])).values()]
    }

    private formatValidationFocusNodes(result: any): string | undefined {
        const focusNodes = result.focusNode?.ptrs
            ?.map((ptr: any) => ptr._term?.value || ptr._term?.id)
            ?.filter(Boolean)
            ?.map((value: string) => removePrefixes(value, this.config.prefixes))
        return focusNodes?.length ? `Focus: ${[...new Set(focusNodes)].join(', ')}` : undefined
    }

    private formatValidationPath(result: any): string | undefined {
        const paths = this.getValidationPathPredicates(result)
            .map(path => removePrefixes(path.id, this.config.prefixes))
        return paths.length ? `Path: ${[...new Set(paths)].join(', ')}` : undefined
    }

    private createNavigationUI() {
        const options = this.nodeCollection.rootNodes.map((node, index) => {
            const label = findLabel(this.config.store.getQuads(node.shaclSubject, null, null, null), this.config.languages) || node.shaclSubject.value;
            return { label, value: index.toString() };
        });

        const { container, selector } = this.config.theme.createRootSelector(options);
        this.rootSelectorContainer = container;

        selector.addEventListener('change', () => {
            const selectedIndex = parseInt(selector.value, 10);
            if (!isNaN(selectedIndex)) {
                const selectedNode = this.nodeCollection.rootNodes[selectedIndex];
                this.setActiveNode(selectedNode);
            }
        });

        this.viewContainer = document.createElement('div');
        this.viewContainer.className = 'view-container';
        this.form.appendChild(this.rootSelectorContainer);
        this.form.appendChild(this.viewContainer);
    }

    private setActiveNode(node: ShaclNode) {
        this.activeRootNode = this.getTopLevelNode(node);
        if (this.viewContainer) {
            this.viewContainer.replaceChildren(node);
        } else {
            const displayNode = this.activeRootNode;
            const visibleNode = this.form.querySelector(':scope > shacl-node');
            if (visibleNode && visibleNode !== displayNode) {
                visibleNode.replaceWith(displayNode);
            } else if (!visibleNode) {
                this.form.appendChild(displayNode);
            }
        }
        if (this.rootSelectorContainer) {
            this.rootSelectorContainer.style.display = 'none';
        }
        this.updateBreadcrumb(node);
        this.updateCommitRootButton(node);
        this.refreshReusablePropertyOptions();
    }

    private showRootSelector() {
        this.activeRootNode = undefined;
        this.viewContainer!.replaceChildren();
        if (this.breadcrumbContainer) {
            this.breadcrumbContainer.remove();
            this.breadcrumbContainer = undefined;
        }
        this.removeCommitRootButton();
        if (this.rootSelectorContainer) {
            this.rootSelectorContainer.style.display = 'block';
            // Reset selector
            const selector = this.rootSelectorContainer.querySelector('select, mdui-select');
            if (selector) {
                (selector as HTMLSelectElement).value = '';
            }
        }
    }

    private updateBreadcrumb(node: ShaclNode) {
        if (this.breadcrumbContainer) {
            this.breadcrumbContainer.remove();
        }

        const path: { label: string, node: ShaclNode }[] = [];
        let current: ShaclNode | undefined = node;
        while (current) {
            let label = '';
            if (current.parent) {
                // nested node, use the label from the parent property
                label = current.parentPropertyLabel || 'Nested Section';
            } else {
                 // root node, find its sh:name or rdfs:label
                 label = findLabel(this.config.store.getQuads(current.shaclSubject, null, null, null), this.config.languages) || current.shaclSubject.value;
            }
            path.unshift({ label, node: current });
            current = current.parent;
        }

        const breadcrumbItems: { label: string, action: () => void }[] = [];
        // add root selector link only if there are multiple root shapes
        if (this.nodeCollection.rootNodes.length > 1) {
            breadcrumbItems.push({
                label: 'Select Shape',
                action: () => this.showRootSelector()
            });
        }

        // add intermediate path items (all except the last one, which is the active item)
        for (let i = 0; i < path.length - 1; i++) {
            const item = path[i];
            breadcrumbItems.push({ label: item.label, action: () => this.setActiveNode(item.node) });
        }

        const activeItemLabel = path.length > 0 ? path[path.length - 1].label : 'Unknown';
        this.breadcrumbContainer = this.config.theme.createBreadcrumb(breadcrumbItems, activeItemLabel);
        this.form.prepend(this.breadcrumbContainer);
    }

    private updateCommitRootButton(node: ShaclNode) {
        this.removeCommitRootButton();
        if (!this.config.editMode || this.config.attributes.valuesSubject) {
            return;
        }

        const rootNode = this.getTopLevelNode(node);
        const label = findLabel(this.config.store.getQuads(rootNode.shaclSubject, null, null, null), this.config.languages) || 'node';
        const button = this.config.theme.createButton(`Add ${label}`, true);
        button.classList.add('commit-root-button');
        button.addEventListener('click', (event) => {
            event.preventDefault();
            this.commitActiveRootNode().catch(error => console.warn(error));
        });

        const container = document.createElement('div');
        container.className = 'commit-root-container';
        container.appendChild(button);
        this.commitRootButtonContainer = container;

        if (this.breadcrumbContainer) {
            this.breadcrumbContainer.after(container);
        } else {
            this.form.prepend(container);
        }
    }

    private removeCommitRootButton() {
        if (this.commitRootButtonContainer) {
            this.commitRootButtonContainer.remove();
            this.commitRootButtonContainer = undefined;
        }
    }

    private async commitActiveRootNode() {
        const rootNode = this.activeRootNode;
        if (!rootNode || this.config.attributes.valuesSubject) {
            return;
        }
        if (!this.form.reportValidity()) {
            return;
        }

        const report = await this.validate(false, true);
        if (!report?.conforms) {
            this.focusFirstInvalidElement();
            return;
        }

        this.nodeCollection.commitRootNode(rootNode);
        this.refreshReusablePropertyOptions();
        const replacement = this.nodeCollection.replaceRootNode(rootNode);
        this.setActiveNode(replacement);
        const updatedReport = await this.validate(true);
        this.dispatchChange(updatedReport);
    }

    private getSerializableRootNodes(includeEmptyActiveRootNode = false): ShaclNode[] {
        return this.nodeCollection.getSerializableRootNodes(this.activeRootNode, includeEmptyActiveRootNode)
    }

    private getTopLevelNode(node: ShaclNode): ShaclNode {
        let current = node
        while (current.parent) {
            current = current.parent
        }
        return current
    }

    private clearGeneratedValuesGraph() {
        const graph = this.config.valuesGraphId || DataFactory.defaultGraph()
        this.config.store.removeQuads(this.config.store.getQuads(null, null, null, graph))
    }

    private createValidationDataset(): Store {
        const dataset = new Store()
        dataset.addQuads(this.config.store.getQuads(null, null, null, null).filter(quad => !quad.graph.equals(REFERENCE_GRAPH)))
        return dataset
    }

    private dispatchChange(report: any) {
        this.dispatchEvent(new CustomEvent('change', { bubbles: true, cancelable: false, composed: true, detail: { 'valid': report?.conforms, 'report': report } }))
    }

    private focusFirstInvalidElement() {
        const invalidEditor = this.form.querySelector(':scope .invalid > .editor')
        if (invalidEditor) {
            (invalidEditor as HTMLElement).focus()
        } else {
            this.form.querySelector(':scope .invalid')?.scrollIntoView()
        }
    }

    private flattenValidationResults(results: any[]): any[] {
        return results.flatMap(result => {
            if (result.results?.length) {
                return this.flattenValidationResults(result.results)
            }
            return [result]
        })
    }

    private getValidationPathPredicates(result: any): { id: string }[] {
        return result.path?.flatMap((path: any) => path.predicates || []) || []
    }

    private findInvalidElementsForPaths(focusNodeId: string, paths: { id: string }[]): NodeListOf<Element> | Element[] {
        for (const path of paths) {
            const invalidElements = this.form.querySelectorAll(`
                :scope shacl-node[data-node-id='${focusNodeId}'] > shacl-property > .property-instance[data-path='${path.id}'] > .editor,
                :scope shacl-node[data-node-id='${focusNodeId}'] > shacl-property > .alternative-path-constraint[data-path='${path.id}'] > .editor,
                :scope shacl-node[data-node-id='${focusNodeId}'] > shacl-property > .shacl-group > .property-instance[data-path='${path.id}'] > .editor,
                :scope shacl-node[data-node-id='${focusNodeId}'] > shacl-property > .shacl-group > .alternative-path-constraint[data-path='${path.id}'] > .editor,
                :scope shacl-node[data-node-id='${focusNodeId}'] > .shacl-group > shacl-property > .property-instance[data-path='${path.id}'] > .editor,
                :scope shacl-node[data-node-id='${focusNodeId}'] > .shacl-group > shacl-property > .alternative-path-constraint[data-path='${path.id}'] > .editor,
                :scope shacl-node[data-node-id='${focusNodeId}'] > .shacl-group > shacl-property > .shacl-group > .property-instance[data-path='${path.id}'] > .editor,
                :scope shacl-node[data-node-id='${focusNodeId}'] > .shacl-group > shacl-property > .shacl-group > .alternative-path-constraint[data-path='${path.id}'] > .editor`)
            if (invalidElements.length > 0) {
                return invalidElements
            }
        }

        for (const path of paths) {
            const invalidElements = this.form.querySelectorAll(`
                :scope [data-node-id='${focusNodeId}'] > shacl-property > .property-instance[data-path='${path.id}'],
                :scope [data-node-id='${focusNodeId}'] > shacl-property > .alternative-path-constraint[data-path='${path.id}'],
                :scope [data-node-id='${focusNodeId}'] > shacl-property > .shacl-group > .property-instance[data-path='${path.id}'],
                :scope [data-node-id='${focusNodeId}'] > shacl-property > .shacl-group > .alternative-path-constraint[data-path='${path.id}']`)
            if (invalidElements.length > 0) {
                return invalidElements
            }
        }

        return []
    }

    private getValidationMessages(result: any): string[] {
        const messages: string[] = []
        for (const message of result.message || []) {
            if (message.value?.trim()) {
                messages.push(message.value.trim())
            }
        }
        for (const nestedResult of result.results || []) {
            messages.push(...this.getValidationMessages(nestedResult))
        }

        const constraint = result.constraintComponent?.value || result.sourceConstraintComponent?.value
        if (messages.length === 0 && constraint) {
            messages.push(removePrefixes(constraint, this.config.prefixes))
        }
        return [...new Set(messages)]
    }

    private refreshReusablePropertyOptions() {
        for (const property of this.form.querySelectorAll('shacl-property')) {
            (property as HTMLElement & { refreshReusableOptions?: () => void }).refreshReusableOptions?.()
        }
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
