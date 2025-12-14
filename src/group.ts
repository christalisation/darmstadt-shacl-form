import { PREFIX_RDFS } from './constants'
import { Config } from './config'
import { findObjectValueByPredicate } from './util'

export function createShaclGroup(groupSubject: string, config: Config): HTMLElement {
    let name = groupSubject
    const quads = config.store.getQuads(groupSubject, null, null, null)
    const label = findObjectValueByPredicate(quads, "label", PREFIX_RDFS, config.languages)
    if (label) {
        name = label
    }

    let group: HTMLElement
    if (config.attributes.collapse !== null) {
    // Use standard HTML <details>
    group = document.createElement('details')
    group.classList.add('mb-3', 'card', 'p-3'); // Bootstrap card styling
    
    const summary = document.createElement('summary')
    summary.innerText = name
    summary.classList.add('h5', 'mb-0', 'cursor-pointer') // Style of the title
    
    group.appendChild(summary)
    
    if (config.attributes.collapse === 'open') {
        (group as HTMLDetailsElement).open = true
    }
    } else {
        group = document.createElement('div')
        const header = document.createElement('h1')
        header.innerText = name
        group.appendChild(header)
    }

    group.dataset['subject'] = groupSubject
    group.classList.add('shacl-group')
    const order = findObjectValueByPredicate(quads, "order")
    if (order) {
        group.style.order = order
    }
    return group
}
