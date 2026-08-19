import { BlankNode, Literal, NamedNode, Quad } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from "./node"
import { ShaclProperty, createPropertyInstance } from "./property"
import { Config } from './config'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE, SHACL_PREDICATE_CLASS, SHACL_PREDICATE_TARGET_CLASS, SHACL_PREDICATE_NODE_KIND, SHACL_OBJECT_IRI, SHACL_PREDICATE_PROPERTY } from './constants'
import type { ShaclPropertyTemplate } from './property-template'

type LogicalNodeOption =
    | { kind: 'nodeShape'; label: string; shape: Term }
    | { kind: 'anonymousProperties'; label: string; properties: Term[] }
    | { kind: 'propertyShape'; label: string; property: Term }

type LogicalPropertyOption =
    | { kind: 'template'; label: string; template: ShaclPropertyTemplate }
    | { kind: 'emptyNodeShape'; label: string }

export function createAlternativePathConstraint(property: ShaclProperty, value?: Term, linked = false): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.classList.add('alternative-path-constraint')
    wrapper.dataset.path = property.template.path

    const label = document.createElement('label')
    label.innerText = property.template.label
    if (property.template.description) {
        label.setAttribute('title', property.template.description.value)
    }
    if (property.template.minCount && property.template.minCount > 0) {
        label.classList.add('required')
    }
    wrapper.appendChild(label)

    const select = document.createElement('select')
    select.classList.add('editor')
    select.required = property.template.minCount !== undefined && property.template.minCount > 0

    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.innerText = 'Select path'
    select.appendChild(placeholder)

    for (let i = 0; i < (property.template.pathAlternatives?.length || 0); i++) {
        const path = property.template.pathAlternatives![i]
        const option = document.createElement('option')
        option.value = i.toString()
        option.innerText = property.template.getPathLabel(path)
        select.appendChild(option)
    }

    select.addEventListener('change', ev => {
        ev.stopPropagation()
        if (select.value === '') {
            return
        }

        const selectedPath = property.template.pathAlternatives![parseInt(select.value)]
        const effectiveTemplate = property.template.createTemplateForAlternativePath(selectedPath)
        const instance = createPropertyInstance(effectiveTemplate, value, true, linked)
        wrapper.replaceWith(instance)
        instance.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
    })

    wrapper.appendChild(select)
    return wrapper
}

export function createShaclOrConstraint(options: Term[], context: ShaclNode | ShaclProperty | { template: ShaclPropertyTemplate }, config: Config): HTMLElement {
    // 1. LE CONTENEUR GLOBAL
    // Wrapper vertical simple qui prend toute la largeur
    const wrapper = document.createElement('div')
    wrapper.classList.add('shacl-or-constraint', 'w-100', 'd-flex', 'flex-column') 
    wrapper.style.gap = '0.5rem'; 
    wrapper.style.marginBottom = '1rem';

    // 2. PRÉPARATION DES DÉFINITIONS
    const nodeOptions: LogicalNodeOption[] = []
    const propertyOptions: LogicalPropertyOption[] = []
    
    // Structure simple pour alimenter notre select natif
    const selectOptions: { label: string, value: string }[] = []

    if (context instanceof ShaclNode) {
        for (let i = 0; i < options.length; i++) {
            const option = createNodeLogicalOption(options[i], i, config)
            if (option) {
                nodeOptions.push(option)
                selectOptions.push({ label: option.label, value: String(nodeOptions.length - 1) })
            }
        }
    } else {
        for (let i = 0; i < options.length; i++) {
            const option = createPropertyLogicalOption(options[i], i, context.template, config)
            if (option) {
                propertyOptions.push(option)
                selectOptions.push({ label: option.label, value: String(propertyOptions.length - 1) })
            }
        }
    }

    const allBranchesRenderable = context instanceof ShaclNode
        ? nodeOptions.length === options.length
        : propertyOptions.length === options.length

    if (!selectOptions.length || !allBranchesRenderable) {
        return createValidationOnlyLogicalConstraint()
    }

    // 3. CONSTRUCTION MANUELLE DU SÉLECTEUR (Plus de RokitSelect, plus de label inutile)
    const selectContainer = document.createElement('div');
    selectContainer.classList.add('w-100'); 
    
    const select = document.createElement('select');
    select.classList.add('form-select', 'w-100', 'editor'); 

    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.innerText = 'Select alternative'
    select.appendChild(placeholder)
    
    // Remplissage des options
    for (const opt of selectOptions) {
        const optionElement = document.createElement('option');
        optionElement.value = opt.value;
        optionElement.innerText = opt.label;
        select.appendChild(optionElement);
    }

    selectContainer.appendChild(select);
    wrapper.appendChild(selectContainer);

    // 4. CRÉATION DU CONTENEUR DE CONTENU
    const contentContainer = document.createElement('div')
    // Flex vertical pour le contenu aussi, afin d'éviter les superpositions
    contentContainer.classList.add('shacl-or-content', 'w-100', 'd-flex', 'flex-column')
    contentContainer.style.gap = '10px';
    wrapper.appendChild(contentContainer)

    // 5. FONCTION DE MISE À JOUR
    const updateContent = () => {
        contentContainer.replaceChildren()
        
        const index = parseInt(select.value)
        if (isNaN(index)) return

        if (context instanceof ShaclNode) {
            const selectedOption = nodeOptions[index]
            if (selectedOption?.kind === 'nodeShape') {
                const formShape = config.shapeGraph.getFormNodeShape(selectedOption.shape)
                for (const formProperty of formShape?.properties || []) {
                    const prop = new ShaclProperty(formProperty.id as NamedNode | BlankNode, context, config, undefined, formProperty)
                    // On force l'affichage bloc et la pleine largeur
                    prop.style.display = 'block';
                    prop.classList.add('w-100');
                    contentContainer.appendChild(prop)
                }
            } else if (selectedOption?.kind === 'anonymousProperties') {
                for (const propertySubject of selectedOption.properties) {
                    const formProperty = config.shapeGraph.getFormPropertyShape(propertySubject)
                    const prop = new ShaclProperty(propertySubject as NamedNode | BlankNode, context, config, undefined, formProperty)
                    prop.style.display = 'block';
                    prop.classList.add('w-100');
                    contentContainer.appendChild(prop)
                }
            } else if (selectedOption?.kind === 'propertyShape') {
                const formProperty = config.shapeGraph.getFormPropertyShape(selectedOption.property)
                const prop = new ShaclProperty(selectedOption.property as NamedNode | BlankNode, context, config, undefined, formProperty)
                prop.style.display = 'block';
                prop.classList.add('w-100');
                contentContainer.appendChild(prop)
            }
        } else {
            const selectedOption = propertyOptions[index]
            if (selectedOption?.kind === 'template') {
                const instance = createPropertyInstance(selectedOption.template, undefined, true)
                // Idem pour les propriétés simples
                instance.style.display = 'block';
                instance.classList.add('w-100');
                contentContainer.appendChild(instance)
            } else if (selectedOption?.kind === 'emptyNodeShape') {
                contentContainer.appendChild(createEmptyNodeShapeMessage())
            }
        }
    }

    // 6. ÉVÉNEMENT CHANGE
    select.addEventListener('change', (ev) => {
        ev.stopPropagation()
        updateContent()
    })

    return wrapper
}

function createNodeLogicalOption(option: Term, index: number, config: Config): LogicalNodeOption | undefined {
    const nodeShape = config.shapeGraph.getFormNodeShape(option)
    if (nodeShape?.properties.length) {
        return { kind: 'nodeShape', label: nodeShape.label, shape: option }
    }

    const propertyShape = config.shapeGraph.getFormPropertyShape(option)
    if (propertyShape?.path) {
        return { kind: 'propertyShape', label: propertyShape.label, property: option }
    }

    const properties = config.store.getObjects(option, SHACL_PREDICATE_PROPERTY, null)
    if (properties.length) {
        const labels = properties
            .map(property => config.shapeGraph.getFormPropertyShape(property)?.label)
            .filter((label): label is string => Boolean(label))
        return {
            kind: 'anonymousProperties',
            label: labels.length ? labels.join(' / ') : `Alternative ${index + 1}`,
            properties,
        }
    }
}

function createPropertyLogicalOption(option: Term, index: number, parentTemplate: ShaclPropertyTemplate, config: Config): LogicalPropertyOption | undefined {
    const label = labelForPropertyLogicalOption(option, index, parentTemplate, config)
    const directNodeShape = config.shapeGraph.getFormNodeShape(option)
    if (directNodeShape && directNodeShape.properties.length === 0 && !hasFormValueConstraints(directNodeShape)) {
        return { kind: 'emptyNodeShape', label }
    }

    const nodeTargets = config.store.getObjects(option, `${PREFIX_SHACL}node`, null)
    if (nodeTargets.length === 1) {
        const nodeShape = config.shapeGraph.getFormNodeShape(nodeTargets[0])
        if (nodeShape && nodeShape.properties.length === 0 && !hasFormValueConstraints(nodeShape)) {
            return { kind: 'emptyNodeShape', label }
        }
        if (nodeShape) {
            const template = parentTemplate.createTemplateForLogicalOption(nodeTargets[0], label)
            if (template) {
                template.label = label
                return { kind: 'template', label, template }
            }
        }
    }

    const template = parentTemplate.createTemplateForLogicalOption(option, `Alternative ${index + 1}`)
    if (!template) {
        return undefined
    }
    template.label = label
    if (template.extendedShapes.length || hasTemplateValueConstraints(template) || config.shapeGraph.getFormPropertyShape(option)?.path || config.store.countQuads(option, `${PREFIX_SHACL}path`, null, null) > 0) {
        return { kind: 'template', label, template }
    }
}

function labelForPropertyLogicalOption(option: Term, index: number, parentTemplate: ShaclPropertyTemplate, config: Config): string {
    const explicitLabel = config.shapeGraph.getLabel(option)
    if (explicitLabel) {
        return explicitLabel
    }

    const nodeTargets = config.store.getObjects(option, `${PREFIX_SHACL}node`, null)
    if (nodeTargets.length === 1) {
        const nodeLabel = config.shapeGraph.getFormNodeShape(nodeTargets[0])?.label
        if (nodeLabel) {
            return nodeLabel
        }
    }

    const template = parentTemplate.createTemplateForLogicalOption(option, `Alternative ${index + 1}`)
    if (!template) {
        return `Alternative ${index + 1}`
    }

    if (template.pathAlternatives?.length) {
        return template.pathAlternatives.map(path => template.getPathLabel(path)).join(' / ')
    }
    const branchHasPath = config.store.countQuads(option, `${PREFIX_SHACL}path`, null, null) > 0
    if (branchHasPath && template.path && template.label && template.label !== parentTemplate.label && template.label !== 'unknown') {
        return template.label
    }

    return `Alternative ${index + 1}`
}

function hasFormValueConstraints(nodeShape: NonNullable<ReturnType<Config['shapeGraph']['getFormNodeShape']>>): boolean {
    const constraints = nodeShape.valueConstraints
    return Boolean(
        constraints.datatype ||
        constraints.nodeKind ||
        constraints.class ||
        constraints.minLength !== undefined ||
        constraints.maxLength !== undefined ||
        constraints.minInclusive !== undefined ||
        constraints.maxInclusive !== undefined ||
        constraints.minExclusive !== undefined ||
        constraints.maxExclusive !== undefined ||
        constraints.pattern !== undefined ||
        constraints.shaclIn?.length ||
        constraints.languageIn?.length ||
        constraints.hasValue
    )
}

function hasTemplateValueConstraints(template: ShaclPropertyTemplate): boolean {
    return Boolean(
        template.extendedShapes.length ||
        template.datatype ||
        template.nodeKind ||
        template.class ||
        template.minLength !== undefined ||
        template.maxLength !== undefined ||
        template.minInclusive !== undefined ||
        template.maxInclusive !== undefined ||
        template.minExclusive !== undefined ||
        template.maxExclusive !== undefined ||
        template.pattern !== undefined ||
        template.shaclInValues?.length ||
        template.languageIn?.length ||
        template.hasValue
    )
}

function createEmptyNodeShapeMessage(): HTMLElement {
    const message = document.createElement('div')
    message.classList.add('logical-empty-state')
    message.innerText = 'No authoring fields are defined for this shape by the loaded shapes graph.'
    return message
}

function createValidationOnlyLogicalConstraint(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.classList.add('shacl-or-constraint', 'validation-only')
    wrapper.hidden = true
    return wrapper
}

export function resolveShaclOrConstraintOnProperty(subjects: Term[], value: Term, config: Config): Quad[] {
    // TODO: temporary legacy runtime resolver. This inspects branch SHACL
    // quads to decide which already-existing value should be displayed.
    // It should move to RDF binding / Form Data once runtime graph state is
    // no longer owned by the DOM.
    if (value instanceof Literal) {
        const valueType = value.datatype
        for (const subject of subjects) {
            const options = config.store.getQuads(subject, null, null, null)
            for (const quad of options) {
                if (quad.predicate.value === `${PREFIX_SHACL}datatype` && quad.object.equals(valueType)) {
                    return options
                }
            }
        }
    } else {
        const types = config.store.getObjects(value, RDF_PREDICATE_TYPE, null)
        for (const subject of subjects) {
            const options = config.store.getQuads(subject, null, null, null)
            for (const quad of options) {
                if (types.length > 0) {
                    if (quad.predicate.value === `${PREFIX_SHACL}node`) {
                        for (const type of types) {
                            if (config.store.getQuads(quad.object, SHACL_PREDICATE_TARGET_CLASS, type, null).length > 0) {
                                return options
                            }
                        }
                    }
                    if (quad.predicate.equals(SHACL_PREDICATE_CLASS)) {
                        for (const type of types) {
                            if (quad.object.equals(type)) {
                                return options
                            }
                        }
                    }
                } else if (quad.predicate.equals(SHACL_PREDICATE_NODE_KIND) && quad.object.equals(SHACL_OBJECT_IRI)) {
                    return options
                }
            }
        }
    }
    console.error('couldn\'t resolve sh:or/sh:xone on property for value', value)
    return []
}

export function resolveShaclOrConstraintOnNode(subjects: Term[], value: Term, config: Config): Term[] {
    // TODO: temporary legacy runtime resolver. FormLogicalAlternative is now
    // the source of branch structure; this raw query only preserves existing
    // branch matching for previously loaded data.
    for (const subject of subjects) {
        let subjectMatches = false
        const propertySubjects = config.store.getObjects(subject, SHACL_PREDICATE_PROPERTY, null)
        for (const propertySubject of propertySubjects) {
            const paths = config.store.getObjects(propertySubject, `${PREFIX_SHACL}path`, null)
            for (const path of paths) {
                subjectMatches = config.store.countQuads(value, path, null, null) > 0
                if (subjectMatches) {
                    break
                }
            }
        }
        if (subjectMatches) {
            return propertySubjects
        }
    }

    console.error('couldn\'t resolve sh:or/sh:xone on node for value', value)
    return []
}
