import { BlankNode, Literal, NamedNode, Quad } from 'n3'
import { Term } from '@rdfjs/types'
import { ShaclNode } from "./node"
import { ShaclProperty, createPropertyInstance } from "./property"
import { Config } from './config'
import { PREFIX_SHACL, RDF_PREDICATE_TYPE, SHACL_PREDICATE_CLASS, SHACL_PREDICATE_TARGET_CLASS, SHACL_PREDICATE_NODE_KIND, SHACL_OBJECT_IRI, SHACL_PREDICATE_PROPERTY } from './constants'
import { findLabel, removePrefixes } from './util'

export function createShaclOrConstraint(options: Term[], context: ShaclNode | ShaclProperty, config: Config): HTMLElement {
    // 1. LE CONTENEUR GLOBAL
    // Wrapper vertical simple qui prend toute la largeur
    const wrapper = document.createElement('div')
    wrapper.classList.add('shacl-or-constraint', 'w-100', 'd-flex', 'flex-column') 
    wrapper.style.gap = '0.5rem'; 
    wrapper.style.marginBottom = '1rem';

    // 2. PRÉPARATION DES DONNÉES
    const nodeOptions: ShaclProperty[][] = []
    const propertyOptions: Quad[][] = []
    
    // Structure simple pour alimenter notre select natif
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

    // 3. CONSTRUCTION MANUELLE DU SÉLECTEUR (Plus de RokitSelect, plus de label inutile)
    const selectContainer = document.createElement('div');
    selectContainer.classList.add('w-100'); 
    
    const select = document.createElement('select');
    select.classList.add('form-select', 'w-100', 'editor'); 
    
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
            const selectedProps = nodeOptions[index]
            if (selectedProps) {
                for (const prop of selectedProps) {
                    // On force l'affichage bloc et la pleine largeur
                    prop.style.display = 'block';
                    prop.classList.add('w-100');
                    contentContainer.appendChild(prop)
                }
            }
        } else {
            const selectedQuads = propertyOptions[index]
            if (selectedQuads) {
                const newTemplate = context.template.clone().merge(selectedQuads)
                const instance = createPropertyInstance(newTemplate, undefined, true)
                // Idem pour les propriétés simples
                instance.style.display = 'block';
                instance.classList.add('w-100');
                contentContainer.appendChild(instance)
            }
        }
    }

    // 6. ÉVÉNEMENT CHANGE
    select.addEventListener('change', (ev) => {
        ev.stopPropagation()
        updateContent()
    })

    // 7. INITIALISATION (Sélection par défaut immédiate)
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