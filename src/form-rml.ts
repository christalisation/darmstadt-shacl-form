import { ShaclForm as FormBase } from "./form"
import { RMLTheme } from "./themes/rml-theme" // Ton nouveau fichier

export * from './exports'

export class RMLForm extends FormBase {
    constructor() {
        super(new RMLTheme())
    }
}

window.customElements.define('shacl-form', RMLForm) // On garde le même nom de balise HTML