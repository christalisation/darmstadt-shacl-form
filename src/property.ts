import { BlankNode, DataFactory, Literal, NamedNode, Quad, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from './node'
import { createAlternativePathConstraint, createShaclOrConstraint, resolveShaclOrConstraintOnProperty } from './constraints'
import { findInstancesOf, focusFirstInputElement } from './util'
import { Config } from './config'
import { ShaclPropertyTemplate } from './property-template'
import { Editor, fieldFactory, InputListEntry } from './theme'
import { toRDF } from './serialize'
import { findPlugin } from './plugin'
import { DATA_GRAPH, RDF_PREDICATE_TYPE, SHACL_PREDICATE_TARGET_CLASS } from './constants'
import { RokitButton, RokitCollapsible, RokitSelect } from '@ro-kit/ui-widgets'

export class ShaclProperty extends HTMLElement {
    template: ShaclPropertyTemplate
    addButton: RokitSelect | undefined
    container: HTMLElement

    constructor(shaclSubject: BlankNode | NamedNode, parent: ShaclNode, config: Config, valueSubject?: NamedNode | BlankNode) {
        super()
        this.template = new ShaclPropertyTemplate(config.store.getQuads(shaclSubject, null, null, null), parent, config)
        this.container = this
        if (this.template.extendedShapes.length && this.template.config.attributes.collapse !== null && (!this.template.maxCount || this.template.maxCount > 1)) {
            // Use standard HTML <details> instead of RokitCollapsible
            const collapsible = document.createElement('details')
            collapsible.classList.add('collapsible', 'mb-3', 'card', 'p-3') // Bootstrap card styling

            const summary = document.createElement('summary')
            summary.innerText = this.template.label
            summary.classList.add('h5', 'mb-0', 'cursor-pointer') // Style of the title

            collapsible.appendChild(summary)

            if (this.template.config.attributes.collapse === 'open') {
                (collapsible as HTMLDetailsElement).open = true
            }
            this.appendChild(collapsible)
            this.container = collapsible
        }

        if (this.template.order !== undefined) {
            this.style.order = `${this.template.order}`
        }
        if (this.template.cssClass) {
            this.classList.add(this.template.cssClass)
        }
        if (config.editMode && !parent.linked) {
            this.addButton = this.createAddButton()
            this.container.appendChild(this.addButton)
        }

        // bind existing values
        if (this.template.path) {
            const paths = this.template.pathAlternatives || [this.template.path]
            let values: Quad[] = []
            if (valueSubject) {
                for (const path of paths) {
                    if (parent.linked) {
                        // for linked resource, get values in all graphs
                        values.push(...config.store.getQuads(valueSubject, path, null, null))
                    } else {
                        // get values only from data graph
                        values.push(...config.store.getQuads(valueSubject, path, null, DATA_GRAPH))
                    }
                }
            }
            let valuesContainHasValue = false
            for (const value of values) {
                // ignore values that do not conform to this property.
                // this might be the case when there are multiple properties with the same sh:path in a NodeShape.
                if (this.isValueValid(value.object)) {
                    this.addPropertyInstance(value.object, value.predicate.value)
                    if (this.template.hasValue && value.object.equals(this.template.hasValue)) {
                        valuesContainHasValue = true
                    }
                }
            }
            if (config.editMode && this.template.hasValue && !valuesContainHasValue && !parent.linked) {
                // sh:hasValue is defined in shapes graph, but does not exist in data graph, so force it
                this.addPropertyInstance(this.template.hasValue)
            }
        }

        if (config.editMode && !parent.linked) {
            this.addEventListener('change', () => { this.updateControls() })
            this.updateControls()
        }

        if (this.container instanceof RokitCollapsible) {
            // in view mode, show collapsible only when we have something to show
            if ((config.editMode && !parent.linked) || this.container.childElementCount > 0) {
                this.appendChild(this.container)
            }
        }
    }

    addPropertyInstance(value?: Term, selectedPath?: string): HTMLElement {
        let instance: HTMLElement
        if (this.template.shaclOr?.length || this.template.shaclXone?.length) {
            const options = this.template.shaclOr?.length ? this.template.shaclOr : this.template.shaclXone as Term[]
            let resolved = false
            if (value) {
                const resolvedOptions = resolveShaclOrConstraintOnProperty(options, value, this.template.config)
                if (resolvedOptions.length) {
                    instance = createPropertyInstance(this.template.clone().merge(resolvedOptions), value, true)
                    resolved = true
                }
            } 
            if (!resolved) {
                instance = createShaclOrConstraint(options, this, this.template.config)
                appendRemoveButton(instance, '')
            }
        } else {
            // check if value is part of the data graph. if not, create a linked resource
            let linked = false
            if (value && !(value instanceof Literal)) {
                const clazz = this.getRdfClassToLinkOrCreate()
                if (clazz && this.template.config.store.countQuads(value, RDF_PREDICATE_TYPE, clazz, DATA_GRAPH) === 0) {
                    // value is not in data graph, so must be a link in the shapes graph
                    linked = true
                }
            }
            if (this.template.pathAlternatives?.length && !selectedPath) {
                instance = createAlternativePathConstraint(this, value, linked || this.template.parent.linked)
            } else {
                const effectiveTemplate = selectedPath && selectedPath !== this.template.path ? this.template.clone() : this.template
                if (selectedPath) {
                    effectiveTemplate.path = selectedPath
                }
                instance = createPropertyInstance(effectiveTemplate, value, undefined, linked || this.template.parent.linked)
            }
        }
        if (this.addButton) {
            this.container.insertBefore(instance!, this.addButton)
        } else {
            this.container.appendChild(instance!)
        }
        return instance!
    }

    updateControls() {
        let instanceCount = this.querySelectorAll(":scope > .property-instance, :scope > .shacl-or-constraint, :scope > .alternative-path-constraint, :scope > shacl-node").length
        if (instanceCount === 0 && (!this.template.extendedShapes.length || (this.template.minCount !== undefined && this.template.minCount > 0))) {
            this.addPropertyInstance()
            instanceCount = this.querySelectorAll(":scope > .property-instance, :scope > .shacl-or-constraint, :scope > .alternative-path-constraint, :scope > shacl-node").length
        }
        let mayRemove: boolean
        if (this.template.minCount !== undefined) {
            mayRemove = instanceCount > this.template.minCount
        } else {
            mayRemove = this.template.extendedShapes.length > 0 || instanceCount > 1
        }

        const mayAdd = this.template.maxCount === undefined || instanceCount < this.template.maxCount
        this.classList.toggle('may-remove', mayRemove)
        this.classList.toggle('may-add', mayAdd)
    }

    toRDF(graph: Store, subject: NamedNode | BlankNode, serializedNodes = new Set<string>()) {
        for (const instance of this.querySelectorAll(':scope > .property-instance, :scope > .collapsible > .property-instance')) {
            const pathNode = DataFactory.namedNode((instance as HTMLElement).dataset.path!)
            const nestedNodes = instance.querySelectorAll<ShaclNode>(':scope > shacl-node')

            if (nestedNodes.length) {
                for (const nestedNode of nestedNodes) {
                    if (!nestedNode.hasSerializableValue()) {
                        continue
                    }
                    const shapeSubject = nestedNode.toRDF(graph, undefined, serializedNodes)
                    graph.addQuad(subject, pathNode, shapeSubject, this.template.config.valuesGraphId)
                }
            } else {
                for (const editor of instance.querySelectorAll<Editor>(':scope > .editor')) {
                    const value = toRDF(editor)
                    if (value) {
                        graph.addQuad(subject, pathNode, value, this.template.config.valuesGraphId)
                    }
                }
            }
        }
    }

    hasSerializableValue(): boolean {
        for (const instance of this.querySelectorAll(':scope > .property-instance, :scope > .collapsible > .property-instance')) {
            const nestedNodes = instance.querySelectorAll<ShaclNode>(':scope > shacl-node')

            if (nestedNodes.length) {
                for (const nestedNode of nestedNodes) {
                    if (nestedNode.hasSerializableValue()) {
                        return true
                    }
                }
            } else {
                for (const editor of instance.querySelectorAll<Editor>(':scope > .editor')) {
                    if (toRDF(editor)) {
                        return true
                    }
                }
            }
        }
        return false
    }

    getRdfClassToLinkOrCreate() {
        if (this.template.class && this.template.node) {
            return this.template.class
        }
        else {
            for (const node of this.template.extendedShapes) {
                // if this property has no sh:class but sh:node, then use the node shape's sh:targetClass to find protiential instances
                const targetClasses = this.template.config.store.getObjects(node, SHACL_PREDICATE_TARGET_CLASS, null)
                if (targetClasses.length > 0) {
                    return targetClasses[0] as NamedNode
                }
            }
        }
        return undefined
    }

    isValueValid(value: Term) {
        if (!this.template.extendedShapes.length) {
            // property has no node shape, so value is valid
            return true
        }
        // property has node shape(s), so check if value conforms to any targetClass
        for (const node of this.template.extendedShapes) {
            const targetClasses = this.template.config.store.getObjects(node, SHACL_PREDICATE_TARGET_CLASS, null)
            for (const targetClass of targetClasses) {
                if (this.template.config.store.countQuads(value, RDF_PREDICATE_TYPE, targetClass, null) > 0) {
                    return true
                }
            }
        }
        return false
    }

    createAddButton() {
        const addButton = new RokitSelect()
        addButton.dense = true
        addButton.label = "+ " + this.template.label
        addButton.title = 'Add ' + this.template.label
        addButton.autoGrowLabelWidth = true
        addButton.classList.add('add-button')

        // load potential value candidates for linking
        let instances: InputListEntry[] = []
        let clazz = this.getRdfClassToLinkOrCreate()
        if (clazz) {
            instances = findInstancesOf(clazz, this.template)
        }
        const reusableNodes = this.findReusableNodes(clazz)
        if (instances.length === 0 && reusableNodes.length === 0) {
            // no class instances found, so create an add button that creates a new instance
            addButton.emptyMessage = ''
            addButton.inputMinWidth = 0
            addButton.addEventListener('click', _ => {
                addButton.blur()
                const instance = this.addPropertyInstance()
                instance.classList.add('fadeIn')
                this.updateControls()
                setTimeout(() => {
                    focusFirstInputElement(instance)
                    instance.classList.remove('fadeIn')
                }, 200)
            })
        } else {
            // some instances found, so create an add button that can create, link or reuse instances
            const ul = document.createElement('ul')
            const newItem = document.createElement('li')
            newItem.innerHTML = '&#xFF0B; Create new ' + this.template.label + '...'
            newItem.dataset.value = 'new'
            newItem.classList.add('large')
            ul.appendChild(newItem)

            if (instances.length) {
                ul.appendChild(createMenuDivider())
                const header = document.createElement('li')
                header.classList.add('header')
                header.innerText = 'Or link existing:'
                ul.appendChild(header)
                for (const instance of instances) {
                    const li = document.createElement('li')
                    const itemValue = (typeof instance.value === 'string') ? instance.value : instance.value.value
                    li.innerText = instance.label ? instance.label : itemValue
                    li.dataset.value = JSON.stringify(instance.value)
                    ul.appendChild(li)
                }
            }

            if (reusableNodes.length) {
                ul.appendChild(createMenuDivider())
                const header = document.createElement('li')
                header.classList.add('header')
                header.innerText = 'Or reuse from this form:'
                ul.appendChild(header)
                for (const node of reusableNodes) {
                    const li = document.createElement('li')
                    li.innerText = this.getReusableNodeLabel(node)
                    li.dataset.value = JSON.stringify(node.nodeId)
                    ul.appendChild(li)
                }
            }
            addButton.appendChild(ul)
            addButton.collapsibleWidth = '250px'
            addButton.collapsibleOrientationLeft = ''
            addButton.addEventListener('change', () => {
                if (addButton.value === 'new') {
                    // user wants to create a new instance
                    this.addPropertyInstance()
                } else {
                    // user wants to link existing instance
                    const value = parseTerm(addButton.value)
                    this.addPropertyInstance(value)
                }
                addButton.value = ''
            })
        }
        return addButton
    }

    private findReusableNodes(clazz?: NamedNode): ShaclNode[] {
        const nodes = new Map<string, ShaclNode>()
        if (clazz) {
            for (const node of this.template.parent.nodeCollection.findNodesByClass(clazz)) {
                nodes.set(node.nodeId.id, node)
            }
        }
        for (const shape of this.template.extendedShapes) {
            if (shape.termType === 'NamedNode') {
                for (const node of this.template.parent.nodeCollection.findNodesByShape(shape)) {
                    nodes.set(node.nodeId.id, node)
                }
            }
        }
        return Array.from(nodes.values()).filter(node => !this.isCurrentPathNode(node))
    }

    private isCurrentPathNode(node: ShaclNode): boolean {
        let current: ShaclNode | undefined = this.template.parent
        while (current) {
            if (current.nodeId.equals(node.nodeId)) {
                return true
            }
            current = current.parent
        }
        return false
    }

    private getReusableNodeLabel(node: ShaclNode): string {
        const shapeLabel = this.template.config.shapeGraph.getLabel(node.shaclSubject) || this.shortNodeId(node)
        const valueLabel = this.findFirstEditorValue(node)
        return valueLabel ? `${shapeLabel}: ${valueLabel}` : `${shapeLabel} (${this.shortNodeId(node)})`
    }

    private findFirstEditorValue(node: ShaclNode): string | undefined {
        for (const editor of node.querySelectorAll<Editor>(':scope shacl-property > .property-instance > .editor')) {
            if (editor.value) {
                return editor.value
            }
        }
        return undefined
    }

    private shortNodeId(node: ShaclNode): string {
        const value = node.nodeId.value
        const lastSegment = value.split(/[\/#]/).filter(Boolean).pop() || value
        return lastSegment.length > 12 ? `${lastSegment.slice(0, 8)}...` : lastSegment
    }
}

function createMenuDivider(): HTMLLIElement {
    const divider = document.createElement('li')
    divider.classList.add('divider')
    return divider
}

function parseTerm(value: string): Term {
    const term = JSON.parse(value)
    switch (term.termType) {
        case 'NamedNode':
            return DataFactory.namedNode(term.value)
        case 'BlankNode':
            return DataFactory.blankNode(term.value)
        default:
            return term as Term
    }
}

export function createPropertyInstance(template: ShaclPropertyTemplate, value?: Term, forceRemovable = false, linked = false): HTMLElement {
    let instance: HTMLElement
    if (template.extendedShapes.length) {
        // This is a nested node property:
        // creates a container, a label, and then the ShaclNode without its own H1 title.

        // Create the main container for the property instance
        instance = document.createElement('div');
        instance.classList.add('property-instance');

        // Create the label for the property
        const labelElem = document.createElement('label');
        labelElem.innerText = template.label;
        if (template.description) {
            labelElem.setAttribute('title', template.description.value);
        }
        if (template.minCount && template.minCount > 0) {
            labelElem.classList.add('required');
        }
        instance.appendChild(labelElem);

        for (const node of template.extendedShapes) {
            // pass the property label to the nested node.
            const shaclNodeElement = new ShaclNode(node, template.parent.nodeCollection, value as NamedNode | BlankNode | undefined, template.parent, template.nodeKind, template.label, linked);
            shaclNodeElement.classList.add('editor'); // Treat the node as the editor
            instance.appendChild(shaclNodeElement);
        }
    } else {
        const plugin = findPlugin(template.path, template.datatype?.value)
        if (plugin) {
            if (template.config.editMode && !linked) {
                instance = plugin.createEditor(template, value)
            } else {
                instance = plugin.createViewer(template, value!)
            }
        } else {
            instance = fieldFactory(template, value || null, template.config.editMode && !linked)
        }
        instance.classList.add('property-instance')
        if (linked) {
            instance.classList.add('linked')
        }
    }
    if (template.config.editMode) {
        appendRemoveButton(instance, template.label, forceRemovable)
    }
    instance.dataset.path = template.path
    return instance
}

function appendRemoveButton(instance: HTMLElement, label: string, forceRemovable = false) {
    const removeButton = new RokitButton()
    removeButton.classList.add('remove-button', 'clear')
    removeButton.title = 'Remove ' + label
    removeButton.dense = true
    removeButton.icon = true
    removeButton.addEventListener('click', _ => {
        instance.classList.remove('fadeIn')
        instance.classList.add('fadeOut')
        setTimeout(() => {
            const parent = instance.parentElement
            instance.remove()
            parent?.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
        }, 200)
    })
    if (forceRemovable) {
        removeButton.classList.add('persistent')
    }
    instance.appendChild(removeButton)
}

window.customElements.define('shacl-property', ShaclProperty)
