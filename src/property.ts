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
import { DATA_GRAPH, PREFIX_SHACL, RDF_PREDICATE_TYPE } from './constants'
import { RokitButton, RokitCollapsible, RokitSelect } from '@ro-kit/ui-widgets'
import { FormPropertyShape } from './form-shape'
import { UNAVAILABLE_ALTERNATIVE_BRANCH_MESSAGE } from './ui-messages'

type AlternativePathAddAction =
    | { kind: 'createAlternativePath', path: string }
    | { kind: 'linkAlternativePath', path: string, value: Term }

type AlternativePathBranchOption = {
    path: string
    template?: ShaclPropertyTemplate
}

type AddPropertyInstanceOptions = {
    forceReference?: boolean
}

export class ShaclProperty extends HTMLElement {
    template: ShaclPropertyTemplate
    addButton: RokitSelect | undefined
    container: HTMLElement

    constructor(shaclSubject: BlankNode | NamedNode, parent: ShaclNode, config: Config, valueSubject?: NamedNode | BlankNode, formShape?: FormPropertyShape) {
        super()
        this.template = formShape
            ? ShaclPropertyTemplate.fromFormPropertyShape(formShape, parent, config)
            : new ShaclPropertyTemplate(config.store.getQuads(shaclSubject, null, null, null), parent, config)
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

    addPropertyInstance(value?: Term, selectedPath?: string, options: AddPropertyInstanceOptions = {}): HTMLElement {
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
            const effectiveTemplate = selectedPath ? this.template.createTemplateForAlternativePath(selectedPath) : this.template
            if (!effectiveTemplate) {
                instance = createUnavailableAlternativePathInstance(this.template.getPathLabel(selectedPath!), selectedPath!)
                if (this.template.config.editMode) {
                    appendRemoveButton(instance, this.template.getPathLabel(selectedPath!), true)
                }
                if (this.addButton) {
                    this.container.insertBefore(instance, this.addButton)
                } else {
                    this.container.appendChild(instance)
                }
                return instance
            }
            // check if value is part of the data graph. if not, create a linked resource
            let linked = false
            if (value && !(value instanceof Literal)) {
                const clazz = this.getRdfClassToLinkOrCreate(effectiveTemplate)
                if (clazz && this.template.config.store.countQuads(value, RDF_PREDICATE_TYPE, clazz, DATA_GRAPH) === 0) {
                    // value is not in data graph, so must be a link in the shapes graph
                    linked = true
                }
            }
            const renderAsReference = linked || this.template.parent.linked || Boolean(options.forceReference)
            if (this.template.pathAlternatives?.length && !selectedPath) {
                instance = createAlternativePathConstraint(this, value, renderAsReference)
            } else {
                instance = createPropertyInstance(effectiveTemplate, value, undefined, renderAsReference)
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
        if (instanceCount === 0 && !this.template.extendedShapes.length && !this.canUseAlternativePathAddMenu()) {
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
        for (const instance of this.querySelectorAll(':scope > .property-instance, :scope > .shacl-or-constraint, :scope > .collapsible > .property-instance, :scope > .collapsible > .shacl-or-constraint')) {
            const pathNode = DataFactory.namedNode((instance as HTMLElement).dataset.path!)
            const nestedNodes = instance.querySelectorAll<ShaclNode>(':scope > shacl-node, :scope > .shacl-or-content > .property-instance > shacl-node')

            if (nestedNodes.length) {
                for (const nestedNode of nestedNodes) {
                    if (!nestedNode.hasSerializableValue()) {
                        continue
                    }
                    const shapeSubject = nestedNode.toRDF(graph, undefined, serializedNodes)
                    graph.addQuad(subject, pathNode, shapeSubject, this.template.config.valuesGraphId)
                }
            } else {
                for (const editor of instance.querySelectorAll<Editor>(':scope > .editor, :scope > .shacl-or-content > .property-instance > .editor')) {
                    const value = toRDF(editor)
                    if (value) {
                        graph.addQuad(subject, pathNode, value, this.template.config.valuesGraphId)
                    }
                }
            }
        }
    }

    hasSerializableValue(): boolean {
        for (const instance of this.querySelectorAll(':scope > .property-instance, :scope > .shacl-or-constraint, :scope > .collapsible > .property-instance, :scope > .collapsible > .shacl-or-constraint')) {
            const nestedNodes = instance.querySelectorAll<ShaclNode>(':scope > shacl-node, :scope > .shacl-or-content > .property-instance > shacl-node')

            if (nestedNodes.length) {
                for (const nestedNode of nestedNodes) {
                    if (nestedNode.hasSerializableValue()) {
                        return true
                    }
                }
            } else {
                for (const editor of instance.querySelectorAll<Editor>(':scope > .editor, :scope > .shacl-or-content > .property-instance > .editor')) {
                    if (toRDF(editor)) {
                        return true
                    }
                }
            }
        }
        return false
    }

    getRdfClassToLinkOrCreate(template = this.template) {
        if (template.class && template.node) {
            return template.class
        }
        else {
            for (const node of template.extendedShapes) {
                // if this property has no sh:class but sh:node, then use the node shape's sh:targetClass to find protiential instances
                const targetClasses = template.config.shapeGraph.getFormNodeShape(node)?.targetClasses || []
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
            const targetClasses = this.template.config.shapeGraph.getFormNodeShape(node)?.targetClasses || []
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

        if (this.canUseAlternativePathAddMenu()) {
            this.refreshAlternativePathAddButtonOptions(addButton)
            addButton.collapsibleWidth = '350px'
            addButton.collapsibleOrientationLeft = ''
            addButton.addEventListener('change', () => {
                this.handleAlternativePathAddAction(addButton.value)
                addButton.value = ''
            })
            return addButton
        }

        const supportsReferences = this.template.extendedShapes.length > 0 || Boolean(this.getRdfClassToLinkOrCreate())
        if (!supportsReferences) {
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
            this.refreshAddButtonOptions(addButton)
            addButton.collapsibleWidth = '350px'
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

    public refreshReusableOptions() {
        if (!this.addButton) {
            return
        }
        if (this.canUseAlternativePathAddMenu()) {
            this.refreshAlternativePathAddButtonOptions(this.addButton)
            return
        }
        const supportsReferences = this.template.extendedShapes.length > 0 || Boolean(this.getRdfClassToLinkOrCreate())
        if (supportsReferences) {
            this.refreshAddButtonOptions(this.addButton)
        }
    }

    private refreshAddButtonOptions(addButton: RokitSelect) {
        // Reload candidates because nodes can be committed after this property was constructed.
        let instances: InputListEntry[] = []
        const clazz = this.getRdfClassToLinkOrCreate()
        if (clazz) {
            instances = findInstancesOf(clazz, this.template)
        }
        const reusableNodes = this.findReusableNodes(this.template)

        const ul = document.createElement('ul')
        ul.classList.add('reuse-menu')
        const newItem = document.createElement('li')
        newItem.innerHTML = '&#xFF0B; Create new ' + this.template.label + '...'
        newItem.dataset.value = 'new'
        newItem.classList.add('large')
        newItem.title = 'Create a new value for this property.'
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
                li.innerText = node.nodeId.id
                li.dataset.value = JSON.stringify(node.nodeId)
                ul.appendChild(li)
            }
        }

        addButton.replaceChildren(ul)
    }

    private canUseAlternativePathAddMenu(): boolean {
        const alternatives = this.template.pathAlternatives
        if (!alternatives?.length) {
            return false
        }
        return true
    }

    private refreshAlternativePathAddButtonOptions(addButton: RokitSelect) {
        const ul = document.createElement('ul')
        ul.classList.add('reuse-menu')

        const branches = this.getAlternativePathBranchOptions()
        branches.forEach(({ path, template }, index) => {
            if (index > 0) {
                ul.appendChild(createMenuDivider())
            }

            const header = document.createElement('li')
            header.classList.add('header')
            header.innerText = this.template.getPathLabel(path)
            ul.appendChild(header)

            if (!template) {
                const unavailableItem = document.createElement('li')
                unavailableItem.classList.add('disabled', 'unavailable')
                unavailableItem.setAttribute('aria-disabled', 'true')
                unavailableItem.innerText = UNAVAILABLE_ALTERNATIVE_BRANCH_MESSAGE
                unavailableItem.title = `${this.template.getPathLabel(path)} is declared by sh:alternativePath, but the loaded shapes do not provide a branch-specific PropertyShape that can be projected into an editor.`
                ul.appendChild(unavailableItem)
                return
            }

            const createItem = document.createElement('li')
            createItem.dataset.value = encodeAlternativePathAddAction({ kind: 'createAlternativePath', path })
            createItem.dataset.path = path
            createItem.classList.add('large')

            if (this.isNodeValuedTemplate(template)) {
                const nodeLabel = this.getNodeAuthoringLabel(template)
                createItem.innerHTML = '&#xFF0B; Create new ' + nodeLabel + '...'
                createItem.title = `Create a new ${nodeLabel} value using ${template.label}.`
            } else {
                createItem.innerHTML = '&#xFF0B; Add ' + template.label + ' value'
                createItem.title = `Add a value using ${template.label}.`
            }
            ul.appendChild(createItem)

            if (!this.isNodeValuedTemplate(template)) {
                return
            }

            const instances = this.findLinkableInstances(template)
            const reusableNodes = this.findReusableNodes(template)

            if (instances.length) {
                ul.appendChild(createMenuDivider())
                const linkHeader = document.createElement('li')
                linkHeader.classList.add('header')
                linkHeader.innerText = 'Or link existing:'
                ul.appendChild(linkHeader)
                for (const instance of instances) {
                    const value = normalizeInputListTerm(instance.value)
                    const li = document.createElement('li')
                    li.innerText = instance.label ? instance.label : value.value
                    li.dataset.value = encodeAlternativePathAddAction({ kind: 'linkAlternativePath', path, value })
                    li.dataset.path = path
                    ul.appendChild(li)
                }
            }

            if (reusableNodes.length) {
                ul.appendChild(createMenuDivider())
                const reuseHeader = document.createElement('li')
                reuseHeader.classList.add('header')
                reuseHeader.innerText = 'Or reuse from this form:'
                ul.appendChild(reuseHeader)
                for (const node of reusableNodes) {
                    const li = document.createElement('li')
                    li.innerText = node.nodeId.id
                    li.dataset.value = encodeAlternativePathAddAction({ kind: 'linkAlternativePath', path, value: node.nodeId })
                    li.dataset.path = path
                    ul.appendChild(li)
                }
            }
        })

        addButton.replaceChildren(ul)
    }

    private getAlternativePathBranchOptions(): AlternativePathBranchOption[] {
        return (this.template.pathAlternatives || [])
            .map(path => ({
                path,
                template: this.template.createTemplateForAlternativePath(path),
            }))
    }

    private handleAlternativePathAddAction(value: string): void {
        const action = parseAlternativePathAddAction(value)
        if (!action) {
            return
        }

        const term = action.kind === 'linkAlternativePath'
            ? parseTerm(JSON.stringify(action.value))
            : undefined
        const instance = this.addPropertyInstance(term, action.path, { forceReference: action.kind === 'linkAlternativePath' })
        instance.classList.add('fadeIn')
        this.updateControls()
        setTimeout(() => {
            focusFirstInputElement(instance)
            instance.classList.remove('fadeIn')
        }, 200)
    }

    private isNodeValuedTemplate(template: ShaclPropertyTemplate): boolean {
        return Boolean(
            template.extendedShapes.length ||
            template.valueNodeShapes.length ||
            this.getCandidateReferenceClasses(template).length
        )
    }

    private getNodeAuthoringLabel(template: ShaclPropertyTemplate): string {
        if (template.extendedShapes.length === 1) {
            const label = template.config.shapeGraph.getFormNodeShape(template.extendedShapes[0])?.label
            if (label) {
                return label
            }
        }
        if (template.node) {
            const label = template.config.shapeGraph.getFormNodeShape(template.node)?.label
            if (label) {
                return label
            }
        }
        return template.label
    }

    private findLinkableInstances(template: ShaclPropertyTemplate): InputListEntry[] {
        const entries = new Map<string, InputListEntry>()
        for (const clazz of this.getCandidateReferenceClasses(template)) {
            for (const instance of findInstancesOf(clazz, template)) {
                const term = normalizeInputListTerm(instance.value)
                entries.set(`${term.termType}:${term.value}`, instance)
            }
        }
        return Array.from(entries.values())
    }

    private getCandidateReferenceClasses(template: ShaclPropertyTemplate): NamedNode[] {
        const classes = new Map<string, NamedNode>()
        const directClass = this.getRdfClassToLinkOrCreate(template)
        if (directClass) {
            classes.set(directClass.value, directClass)
        }
        for (const shape of this.getReferenceShapeTerms(template)) {
            const targetClasses = template.config.shapeGraph.getFormNodeShape(shape)?.targetClasses || []
            for (const targetClass of targetClasses) {
                classes.set(targetClass.value, targetClass as NamedNode)
            }
        }
        return Array.from(classes.values())
    }

    private getReferenceShapeTerms(template: ShaclPropertyTemplate): Array<NamedNode | BlankNode> {
        const shapes = new Map<string, NamedNode | BlankNode>()
        for (const shape of template.valueNodeShapes) {
            shapes.set(termKey(shape), shape)
        }
        return Array.from(shapes.values())
    }

    private findReusableNodes(template = this.template): ShaclNode[] {
        const nodes = new Map<string, ShaclNode>()
        for (const clazz of this.getCandidateReferenceClasses(template)) {
            for (const node of this.template.parent.nodeCollection.findNodesByClass(clazz)) {
                nodes.set(node.nodeId.id, node)
            }
        }
        for (const shape of this.getReferenceShapeTerms(template)) {
            for (const node of this.template.parent.nodeCollection.findNodesByShape(shape)) {
                nodes.set(node.nodeId.id, node)
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

}

function createMenuDivider(): HTMLLIElement {
    const divider = document.createElement('li')
    divider.classList.add('divider')
    return divider
}

function encodeAlternativePathAddAction(action: AlternativePathAddAction): string {
    return JSON.stringify(action)
}

function parseAlternativePathAddAction(value: string): AlternativePathAddAction | undefined {
    if (!value) {
        return undefined
    }
    try {
        const action = JSON.parse(value) as AlternativePathAddAction
        if (
            (action.kind === 'createAlternativePath' && action.path) ||
            (action.kind === 'linkAlternativePath' && action.path && action.value)
        ) {
            return action
        }
    } catch (_) {
        // This is a legacy add-menu value such as "new"; ignore it here.
    }
    return undefined
}

function normalizeInputListTerm(value: Term | string): Term {
    return typeof value === 'string' ? DataFactory.namedNode(value) : value
}

function termKey(term: Term): string {
    return `${term.termType}:${term.value}`
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
    if (linked && value && !(value instanceof Literal)) {
        instance = createReferenceInstance(template, value)
        if (template.config.editMode) {
            appendRemoveButton(instance, template.label, forceRemovable)
        }
        instance.dataset.path = template.path
        return instance
    }

    if (template.shaclOr?.length || template.shaclXone?.length) {
        const options = template.shaclOr?.length ? template.shaclOr : template.shaclXone as Term[]
        instance = createShaclOrConstraint(options, { template }, template.config)
    } else if (template.extendedShapes.length) {
        // This is a nested node property:
        // creates a container, a label, and then the ShaclNode without its own H1 title.

        // Create the main container for the property instance
        instance = document.createElement('div');
        instance.classList.add('property-instance', 'nested-property-instance');

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

function createUnavailableAlternativePathInstance(label: string, path: string): HTMLElement {
    const instance = document.createElement('div')
    instance.classList.add('property-instance', 'unavailable-alternative-path')
    instance.dataset.path = path

    const labelElem = document.createElement('label')
    labelElem.innerText = label
    instance.appendChild(labelElem)

    const message = document.createElement('span')
    message.classList.add('unavailable-message')
    message.innerText = UNAVAILABLE_ALTERNATIVE_BRANCH_MESSAGE
    instance.appendChild(message)

    return instance
}

function createReferenceInstance(template: ShaclPropertyTemplate, value: Term): HTMLElement {
    const instance = template.config.theme.createViewer(template.label, value, template)
    instance.classList.add('property-instance', 'linked')

    const editor = document.createElement('input') as Editor
    editor.type = 'hidden'
    editor.value = value.value
    editor.classList.add('editor', 'reference-editor')
    if (template.class) {
        editor.dataset.class = template.class.value
    }
    if (template.nodeKind) {
        editor.dataset.nodeKind = template.nodeKind.value
    } else if (value.termType === 'NamedNode') {
        editor.dataset.nodeKind = PREFIX_SHACL + 'IRI'
    }
    instance.appendChild(editor)

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
