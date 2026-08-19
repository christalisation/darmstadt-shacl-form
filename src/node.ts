import { BlankNode, DataFactory, NamedNode, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE, OWL_PREDICATE_IMPORTS, SHACL_PREDICATE_PROPERTY } from './constants'
import { ShaclProperty } from './property'
import { createShaclGroup } from './group'
import { createShaclOrConstraint, resolveShaclOrConstraintOnNode } from './constraints'
import { Config } from './config'
import { ShaclNodeCollection } from './node-collection'
import { FormPropertyShape } from './form-shape'

export class ShaclNode extends HTMLElement {
    parent: ShaclNode | undefined
    parentPropertyLabel?: string; // label of the parent property,
    shaclSubject: NamedNode | BlankNode
    nodeId: NamedNode | BlankNode
    targetClass: NamedNode | undefined
    targetClasses: NamedNode[] = []
    owlImports: NamedNode[] = []
    config: Config // taken from the ShaclNodeCollection
    linked: boolean
    nodeCollection: ShaclNodeCollection

    constructor(shaclSubject: NamedNode | BlankNode, nodeCollection: ShaclNodeCollection, valueSubject: NamedNode | BlankNode | undefined, parent?: ShaclNode, nodeKind?: NamedNode, label?: string, linked?: boolean) {
        super()

        this.parent = parent
        this.parentPropertyLabel = label
        this.nodeCollection = nodeCollection
        this.config = this.nodeCollection.config
        this.shaclSubject = shaclSubject
        this.linked = linked || false
        const formShape = this.config.shapeGraph.getFormNodeShape(shaclSubject)
        let nodeId: NamedNode | BlankNode | undefined = valueSubject
        if (!nodeId) {
            // if no value subject given, create a stable readable id based on
            // the shape. User-provided valuesSubject still wins before this.
            if (!nodeKind) {
                nodeKind = formShape?.valueConstraints.nodeKind as NamedNode | undefined
            }
            nodeId = this.nodeCollection.createNodeId(shaclSubject, nodeKind)
        }
        this.nodeId = nodeId

        // check if the form already contains the node/value pair to prevent recursion
        const renderedNodeKey = JSON.stringify([shaclSubject.id, this.nodeId.id])
        if (this.config.renderedNodes.has(renderedNodeKey)) {
            // node/value pair is already rendered in the form, so just display a reference
            label = label || "Link"
            const labelElem = document.createElement('label')
            labelElem.innerText = label
            labelElem.classList.add('linked')
            this.appendChild(labelElem)

            const anchor = document.createElement('a')
            let refId = this.nodeId.id
            anchor.innerText = refId
            anchor.classList.add('ref-link')
            anchor.onclick = () => {
                // if anchor is clicked, scroll referenced shacl node into view
                this.config.form.querySelector(`shacl-node[data-node-id='${refId}']`)?.scrollIntoView()
            }
            this.appendChild(anchor)
            this.style.flexDirection = 'row'
        } else {
            this.config.renderedNodes.add(renderedNodeKey)
            this.dataset.nodeId = this.nodeId.id
            if (this.config.attributes.showNodeIds !== null) {
                this.appendChild(this.createNodeIdDisplay())
            }

            // first initialize owl:imports, this is needed before adding properties to properly resolve class instances etc.
            for (const owlImport of this.config.store.getQuads(shaclSubject, OWL_PREDICATE_IMPORTS, null, null)) {
                this.owlImports.push(owlImport.object as NamedNode)
            }
            this.targetClasses = formShape?.targetClasses as NamedNode[] || []
            this.targetClass = this.targetClasses[0]

            if (formShape) {
                for (const propertyShape of formShape.properties) {
                    this.addPropertyInstance(propertyShape, valueSubject)
                }
                for (const alternative of formShape.logicalAlternatives) {
                    this.tryResolveOptions(alternative.shapes, valueSubject)
                }
            } else {
                // TODO: temporary legacy fallback for shapes that cannot yet be
                // compiled into FormNodeShape. The normal rendering path above
                // is authoritative for form structure.
                const renderablePropertyShapes = new Set(this.config.shapeGraph.getRenderablePropertyShapes(shaclSubject).map(shape => shape.id))
                // now parse other node quads
                for (const quad of this.config.store.getQuads(shaclSubject, null, null, null)) {
                    switch (quad.predicate.id) {
                        case SHACL_PREDICATE_PROPERTY.id:
                            if (renderablePropertyShapes.has(quad.object.id)) {
                                this.addPropertyInstance(quad.object, valueSubject)
                            }
                            break;
                        case `${PREFIX_SHACL}targetClass`:
                            this.targetClass = quad.object as NamedNode
                            this.targetClasses = [this.targetClass]
                            break;
                        case `${PREFIX_SHACL}or`:
                            this.tryResolve(quad.object, valueSubject)
                            break;
                        case `${PREFIX_SHACL}xone`:
                            this.tryResolve(quad.object, valueSubject)
                            break;
                    }
                }
            }

            // a top-level title only for root nodes
            if (label && !parent) {
                const header = document.createElement('h1')
                header.innerText = label
                this.prepend(header)
            }
        }
        this.nodeCollection.registerNode(this)  // add this node to the ShaclNodeCollection
    }

    toRDF(graph: Store, subject?: NamedNode | BlankNode, serializedNodes = new Set<string>()): (NamedNode | BlankNode) {
        if (!subject) {
            subject = this.nodeId
        }
        const serializationKey = JSON.stringify([this.shaclSubject.id, subject.id])
        if (serializedNodes.has(serializationKey)) {
            return subject
        }
        if (this.linked) {
            const originalNode = this.nodeCollection.findNodeById(subject)
            if (originalNode && originalNode !== this) {
                originalNode.toRDF(graph, subject, serializedNodes)
            }
            return subject
        }

        serializedNodes.add(serializationKey)
        // Output triples for the concrete node once; linked references delegate to the original node above.
        for (const shape of this.querySelectorAll(':scope > shacl-node, :scope > .shacl-group > shacl-node, :scope > shacl-property, :scope > .shacl-group > shacl-property')) {
            (shape as ShaclNode | ShaclProperty).toRDF(graph, subject, serializedNodes)
        }
        const targetClasses = this.getRdfTypeClasses()
        for (const targetClass of targetClasses) {
            graph.addQuad(subject, RDF_PREDICATE_TYPE, targetClass, this.config.valuesGraphId)
        }
        // if this is the root shacl node, check if we should add one of the rdf:type or dcterms:conformsTo predicates
        if (this.config.attributes.generateNodeShapeReference && !this.parent) {
            graph.addQuad(subject, DataFactory.namedNode(this.config.attributes.generateNodeShapeReference), this.shaclSubject, this.config.valuesGraphId)
        }
        return subject
    }

    hasSerializableValue(): boolean {
        if (this.linked) {
            return true
        }
        for (const shape of this.querySelectorAll(':scope > shacl-node, :scope > .shacl-group > shacl-node, :scope > shacl-property, :scope > .shacl-group > shacl-property')) {
            if ((shape as ShaclNode | ShaclProperty).hasSerializableValue()) {
                return true
            }
        }
        return false
    }

    addPropertyInstance(shaclSubject: Term | FormPropertyShape, valueSubject: NamedNode | BlankNode | undefined) {
        const formPropertyShape = this.isFormPropertyShape(shaclSubject) ? shaclSubject : this.config.shapeGraph.getFormPropertyShape(shaclSubject)
        const propertySubject = formPropertyShape?.id || shaclSubject as Term
        let parentElement: HTMLElement = this
        // check if property belongs to a group
        const groupSubject = formPropertyShape?.group?.value || this.config.store.getQuads(propertySubject, `${PREFIX_SHACL}group`, null, null)[0]?.object.value
        if (groupSubject) {
            if (this.config.groups.indexOf(groupSubject) > -1) {
                // check if group element already exists, otherwise create it
                let group = this.querySelector(`:scope > .shacl-group[data-subject='${groupSubject}']`) as HTMLElement
                if (!group) {
                    group = createShaclGroup(groupSubject, this.config)
                    this.appendChild(group)
                }
                parentElement = group
            } else {
                console.warn('ignoring unknown group reference', groupSubject, 'existing groups:', this.config.groups)
            }
        }
        const property = new ShaclProperty(propertySubject as NamedNode | BlankNode, this, this.config, valueSubject, formPropertyShape)
        // do not add empty properties (i.e. properties with no instances). This can be the case e.g. in viewer mode when there is no data for the respective property.
        if (property.childElementCount > 0) {
            parentElement.appendChild(property)
        }
    }

    tryResolve(subject: Term, valueSubject: NamedNode | BlankNode | undefined) {
        const list = this.config.lists[subject.value]
        if (list?.length) {
            this.tryResolveOptions(list, valueSubject)
        }
        else {
            console.error('list for sh:or/sh:xone not found:', subject, 'existing lists:', this.config.lists)
        }
    }

    tryResolveOptions(options: Term[], valueSubject: NamedNode | BlankNode | undefined) {
        let resolved = false
        if (valueSubject) {
            const resolvedPropertySubjects = resolveShaclOrConstraintOnNode(options, valueSubject, this.config)
            if (resolvedPropertySubjects.length) {
                for (const propertySubject of resolvedPropertySubjects) {
                    this.addPropertyInstance(propertySubject, valueSubject)
                }
                resolved = true
            }
        }
        if (!resolved && this.hasRenderableConstraintOptions(options)) {
            this.appendChild(createShaclOrConstraint(options, this, this.config))
        }
    }

    private hasRenderableConstraintOptions(options: Term[]): boolean {
        if (!options.length) {
            return false
        }

        const optionsReferenceProperties = options.every(option => {
            const formShape = this.config.shapeGraph.getFormNodeShape(option)
            return Boolean(formShape?.properties.length) ||
                this.config.store.countQuads(option, SHACL_PREDICATE_PROPERTY, null, null) > 0
        })
        if (optionsReferenceProperties) {
            return options.every(option => {
                const formShape = this.config.shapeGraph.getFormNodeShape(option)
                if (formShape) {
                    return formShape.properties.length > 0
                }
                const propertySubjects = this.config.store.getObjects(option, SHACL_PREDICATE_PROPERTY, null)
                return propertySubjects.length > 0 && propertySubjects.every(propertySubject => this.hasRenderablePropertyShape(propertySubject))
            })
        }

        return options.every(option => this.hasRenderablePropertyShape(option))
    }

    private hasRenderablePropertyShape(subject: Term): boolean {
        return Boolean(this.config.shapeGraph.getFormPropertyShape(subject)) ||
            this.config.store.countQuads(subject, `${PREFIX_SHACL}path`, null, null) > 0
    }

    private isFormPropertyShape(value: Term | FormPropertyShape): value is FormPropertyShape {
        return typeof (value as FormPropertyShape).label === 'string' &&
            Array.isArray((value as FormPropertyShape).sourceShapes)
    }

    private createNodeIdDisplay(): HTMLElement {
        const wrapper = document.createElement('div')
        wrapper.classList.add('node-id-display')

        if (this.nodeId.termType === 'BlankNode') {
            wrapper.appendChild(this.createNodeIdLabel('Blank node:'))
            wrapper.appendChild(this.createNodeIdValue(this.nodeId.id))
            return wrapper
        }

        if (!this.config.editMode || this.linked) {
            wrapper.appendChild(this.createNodeIdLabel('IRI:'))
            wrapper.appendChild(this.createNodeIdValue(this.nodeId.id))
            return wrapper
        }

        const label = document.createElement('label')
        label.classList.add('node-id-label')
        label.innerText = 'IRI:'
        const input = document.createElement('input')
        input.classList.add('node-id-editor')
        input.setAttribute('aria-label', 'RDF node IRI')
        input.value = this.nodeId.value
        input.addEventListener('change', () => {
            const value = input.value.trim()
            const currentValue = this.nodeId.value
            if (!this.isValidIri(value)) {
                input.setCustomValidity('Enter a valid absolute IRI.')
                input.reportValidity()
                input.value = currentValue
                return
            }
            const nodeId = DataFactory.namedNode(value)
            if (!this.nodeCollection.updateNodeId(this, nodeId)) {
                input.setCustomValidity('This IRI is already used in the form or loaded graph.')
                input.reportValidity()
                input.value = currentValue
                return
            }
            input.setCustomValidity('')
            input.value = this.nodeId.value
        })
        wrapper.appendChild(label)
        wrapper.appendChild(input)
        return wrapper
    }

    private createNodeIdLabel(text: string): HTMLElement {
        const label = document.createElement('span')
        label.classList.add('node-id-label')
        label.innerText = text
        return label
    }

    private createNodeIdValue(text: string): HTMLElement {
        const value = document.createElement('span')
        value.classList.add('node-id-value')
        value.innerText = text
        return value
    }

    private getRdfTypeClasses(): NamedNode[] {
        const targetClasses = this.targetClasses.length ? [...this.targetClasses] : (this.targetClass ? [this.targetClass] : [])
        const formShape = this.config.shapeGraph.getFormNodeShape(this.shaclSubject)
        for (const composedShape of formShape?.composedNodeShapes || []) {
            for (const targetClass of this.config.shapeGraph.getFormNodeShape(composedShape)?.targetClasses || []) {
                targetClasses.push(DataFactory.namedNode(targetClass.value))
            }
        }
        return [...new Map(targetClasses.map(targetClass => [targetClass.value, targetClass])).values()]
    }

    private isValidIri(value: string): boolean {
        if (!value || /\s/.test(value)) {
            return false
        }
        try {
            new URL(value)
            return true
        } catch {
            return false
        }
    }
}

window.customElements.define('shacl-node', ShaclNode)
