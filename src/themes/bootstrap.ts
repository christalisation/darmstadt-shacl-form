import { DefaultTheme } from './default'
import { Term } from '@rdfjs/types'
import { ShaclPropertyTemplate } from '../runtime/property-template'
import { Editor } from '../theme'
import bootstrap from 'bootstrap/dist/css/bootstrap.min.css?raw'
import css from './bootstrap.css?raw'

export class BootstrapTheme extends DefaultTheme {
    constructor() {
        super(bootstrap + '\n' + css)
    }

    apply(root: HTMLFormElement): void {
        super.apply(root)
        root.dataset.bsTheme = 'light'
    }

    createDefaultTemplate(label: string, value: Term | null, required: boolean, editor: Editor, template?: ShaclPropertyTemplate | undefined): HTMLElement {
        const result = super.createDefaultTemplate(label, value, required, editor, template)
        if (editor.type !== 'checkbox') {
            result.classList.add('form-floating')
            if (editor.tagName === 'SELECT') {
                editor.classList.add('form-select')
            } else {
                editor.classList.add('form-control')
            }
        }
        const labelElem = result.querySelector('label')
        labelElem?.classList.add('form-label')
        if (labelElem?.title) {
            result.dataset.description = labelElem.title
            labelElem.removeAttribute('title')
        }
        
        result.prepend(editor)
        return result
    }

    createButton(label: string, primary: boolean): HTMLElement {
        const button = super.createButton(label, primary)
        button.classList.add('btn', primary ? 'btn-primary' : 'btn-outline-secondary')
        return button
    }

    createRootSelector(options: { label: string; value: string }[]): { container: HTMLElement; selector: HTMLSelectElement } {
        const { container, selector } = super.createRootSelector(options);
        selector.classList.add('form-select');
        return { container, selector };
    }

    createBreadcrumb(items: { label: string; action: () => void }[], activeItemLabel: string): HTMLElement {
        const nav = document.createElement('nav');
        nav.setAttribute('aria-label', 'breadcrumb');

        const ol = document.createElement('ol');
        ol.classList.add('breadcrumb');

        for (const item of items) {
            const li = document.createElement('li');
            li.classList.add('breadcrumb-item');

            const a = document.createElement('a');
            a.href = '#';
            a.innerText = item.label;
            a.onclick = (e) => { e.preventDefault(); item.action(); };
            li.appendChild(a);
            ol.appendChild(li);
        }

        const activeLi = document.createElement('li');
        activeLi.classList.add('breadcrumb-item', 'active');
        activeLi.setAttribute('aria-current', 'page');
        activeLi.innerText = activeItemLabel;
        ol.appendChild(activeLi);

        nav.appendChild(ol);
        return nav;
    }
}
