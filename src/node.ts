import { BlankNode, DataFactory, NamedNode, Store } from 'n3'
import { Term } from '@rdfjs/types'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE, OWL_PREDICATE_IMPORTS, SHACL_PREDICATE_PROPERTY } from './constants'
import { ShaclProperty } from './property'
import { createShaclGroup } from './group'
import { v4 as uuidv4 } from 'uuid'
import { createShaclOrConstraint, resolveShaclOrConstraintOnNode } from './constraints'
import { Config } from './config'
import { ShaclNodeCollection } from './node-collection'

export class ShaclNode extends HTMLElement {
    parent: ShaclNode | undefined
    parentPropertyLabel?: string; // label of the parent property,
    shaclSubject: NamedNode
    nodeId: NamedNode | BlankNode
    targetClass: NamedNode | undefined
    owlImports: NamedNode[] = []
    config: Config // taken from the ShaclNodeCollection
    linked: boolean
    nodeCollection: ShaclNodeCollection

    constructor(shaclSubject: NamedNode, nodeCollection: ShaclNodeCollection, valueSubject: NamedNode | BlankNode | undefined, parent?: ShaclNode, nodeKind?: NamedNode, label?: string, linked?: boolean) {
        super()

        this.parent = parent
        this.parentPropertyLabel = label
        this.nodeCollection = nodeCollection
        this.config = this.nodeCollection.config
        this.shaclSubject = shaclSubject
        this.linked = linked || false
        let nodeId: NamedNode | BlankNode | undefined = valueSubject
        if (!nodeId) {
            // if no value subject given, create new node id with a type depending on own nodeKind or given parent property nodeKind
            if (!nodeKind) {
                const spec = this.config.store.getObjects(shaclSubject, `${PREFIX_SHACL}nodeKind`, null)
                if (spec.length) {
                    nodeKind = spec[0] as NamedNode
                }
            }
            // if nodeKind is not set, but a value namespace is configured or if nodeKind is sh:IRI, then create a NamedNode
            if ((nodeKind === undefined && this.config.attributes.valuesNamespace) || nodeKind?.value === `${PREFIX_SHACL}IRI`) {
                // no requirements on node type, so create a NamedNode and use configured value namespace
                nodeId = DataFactory.namedNode(this.config.attributes.valuesNamespace + uuidv4())
            } else {
                // otherwise create a BlankNode
                nodeId = DataFactory.blankNode(uuidv4())
            }
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
                const div = document.createElement('div')
                div.innerText = `id: ${this.nodeId.id}`
                div.classList.add('node-id-display')
                this.appendChild(div)
            }

            // first initialize owl:imports, this is needed before adding properties to properly resolve class instances etc.
            for (const owlImport of this.config.store.getQuads(shaclSubject, OWL_PREDICATE_IMPORTS, null, null)) {
                this.owlImports.push(owlImport.object as NamedNode)
            }
            const formShape = this.config.shapeGraph.getFormNodeShape(shaclSubject)
            this.targetClass = formShape?.targetClasses[0] as NamedNode | undefined

            if (formShape) {
                for (const propertyShape of formShape.properties) {
                    this.addPropertyInstance(propertyShape.id, valueSubject)
                }
                for (const alternative of formShape.logicalAlternatives) {
                    this.tryResolveOptions(alternative.shapes, valueSubject)
                }
            } else {
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
        if (this.targetClass) {
            graph.addQuad(subject, RDF_PREDICATE_TYPE, this.targetClass, this.config.valuesGraphId)
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

    addPropertyInstance(shaclSubject: Term, valueSubject: NamedNode | BlankNode | undefined) {
        let parentElement: HTMLElement = this
        // check if property belongs to a group
        const groupRef = this.config.store.getQuads(shaclSubject as Term, `${PREFIX_SHACL}group`, null, null)
        if (groupRef.length > 0) {
            const groupSubject = groupRef[0].object.value
            if (this.config.groups.indexOf(groupSubject) > -1) {
                // check if group element already exists, otherwise create it
                let group = this.querySelector(`:scope > .shacl-group[data-subject='${groupSubject}']`) as HTMLElement
                if (!group) {
                    group = createShaclGroup(groupSubject, this.config)
                    this.appendChild(group)
                }
                parentElement = group
            } else {
                console.warn('ignoring unknown group reference', groupRef[0], 'existing groups:', this.config.groups)
            }
        }
        const property = new ShaclProperty(shaclSubject as NamedNode | BlankNode, this, this.config, valueSubject)
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

        const optionsReferenceProperties = options.every(option => this.config.store.countQuads(option, SHACL_PREDICATE_PROPERTY, null, null) > 0)
        if (optionsReferenceProperties) {
            return options.every(option => {
                const propertySubjects = this.config.store.getObjects(option, SHACL_PREDICATE_PROPERTY, null)
                return propertySubjects.length > 0 && propertySubjects.every(propertySubject => this.hasRenderablePropertyShape(propertySubject))
            })
        }

        return options.every(option => this.hasRenderablePropertyShape(option))
    }

    private hasRenderablePropertyShape(subject: Term): boolean {
        return this.config.store.countQuads(subject, `${PREFIX_SHACL}path`, null, null) > 0
    }
}

window.customElements.define('shacl-node', ShaclNode)
