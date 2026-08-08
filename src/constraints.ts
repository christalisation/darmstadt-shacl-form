import { BlankNode, Literal, NamedNode, Quad } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from "./node"
import { ShaclProperty, createPropertyInstance } from "./property"
import { Config } from './config'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE, SHACL_PREDICATE_CLASS, SHACL_PREDICATE_TARGET_CLASS, SHACL_PREDICATE_NODE_KIND, SHACL_OBJECT_IRI, SHACL_PREDICATE_PROPERTY } from './constants'
import { findLabel, removePrefixes } from './util'

export function createAlternativePathConstraint(property: ShaclProperty, value?: Term, linked = false): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.classList.add('alternative-path-constraint')
    if (property.template.dataPaths.length) {
        wrapper.dataset.path = property.template.dataPaths[0]
    }

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

    const pathChoices = property.template.pathChoices
    for (let i = 0; i < pathChoices.length; i++) {
        const choice = pathChoices[i]
        const option = document.createElement('option')
        option.value = i.toString()
        option.innerText = choice.label
        select.appendChild(option)
    }

    select.addEventListener('change', ev => {
        ev.stopPropagation()
        if (select.value === '') {
            return
        }

        const selectedPath = pathChoices[parseInt(select.value)].predicate
        const effectiveTemplate = property.template.createTemplateForAlternativePath(selectedPath)
        const instance = createPropertyInstance(effectiveTemplate, value, true, linked)
        wrapper.replaceWith(instance)
        instance.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
    })

    wrapper.appendChild(select)
    return wrapper
}

export function createShaclOrConstraint(options: Term[], context: ShaclNode | ShaclProperty, config: Config): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.classList.add('shacl-or-constraint')

    const nodeOptions: ShaclProperty[][] = []
    const propertyOptions: Quad[][] = []
    const selectOptions: { label: string, value: string }[] = []

    if (context instanceof ShaclNode) {
        let optionsAreReferencedProperties = false
        if (options.length) {
            optionsAreReferencedProperties = config.store.countQuads(options[0], SHACL_PREDICATE_PROPERTY, null, null) > 0
        }
        for (let i = 0; i < options.length; i++) {
            if (optionsAreReferencedProperties) {
                const quads = config.store.getObjects(options[i] , SHACL_PREDICATE_PROPERTY, null)
                const list: ShaclProperty[] = []
                let combinedText = ''
                for (const subject of quads) {
                    const property = new ShaclProperty(subject as NamedNode | BlankNode, context, config)
                    list.push(property)
                    combinedText += (combinedText.length > 1 ? ' / ' : '') + property.template.label
                }
                nodeOptions.push(list)
                selectOptions.push({ label: combinedText, value: i.toString() })
            } else {
                const property = new ShaclProperty(options[i] as NamedNode | BlankNode, context, config)
                nodeOptions.push([property])
                selectOptions.push({ label: property.template.label, value: i.toString() })
            }
        }
    } else {
        for (let i = 0; i < options.length; i++) {
            const quads = config.store.getQuads(options[i], null, null, null)
            if (quads.length) {
                propertyOptions.push(quads)
                const label = findLabel(quads, config.languages) || (removePrefixes(quads[0].predicate.value, config.prefixes) + ' = ' + removePrefixes(quads[0].object.value, config.prefixes))
                selectOptions.push({ label: label, value: i.toString() })
            }
        }
    }

    const selectContainer = document.createElement('div')
    
    const select = document.createElement('select')
    select.classList.add('editor')
    
    for (const opt of selectOptions) {
        const optionElement = document.createElement('option')
        optionElement.value = opt.value
        optionElement.innerText = opt.label
        select.appendChild(optionElement)
    }

    selectContainer.appendChild(select)
    wrapper.appendChild(selectContainer)

    const contentContainer = document.createElement('div')
    contentContainer.classList.add('shacl-or-content')
    wrapper.appendChild(contentContainer)

    const updateContent = () => {
        contentContainer.replaceChildren()
        
        const index = parseInt(select.value)
        if (isNaN(index)) return

        if (context instanceof ShaclNode) {
            const selectedProps = nodeOptions[index]
            if (selectedProps) {
                for (const prop of selectedProps) {
                    contentContainer.appendChild(prop)
                }
            }
        } else {
            const selectedQuads = propertyOptions[index]
            if (selectedQuads) {
                const newTemplate = context.template.clone().merge(selectedQuads)
                const instance = createPropertyInstance(newTemplate, undefined, true)
                contentContainer.appendChild(instance)
            }
        }
    }

    select.addEventListener('change', (ev) => {
        ev.stopPropagation()
        updateContent()
    })

    if (selectOptions.length > 0) {
        select.value = selectOptions[0].value
        updateContent()
    }

    return wrapper
}

export function resolveShaclOrConstraintOnProperty(subjects: Term[], value: Term, config: Config): Quad[] {
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
