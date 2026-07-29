import { ShaclForm as FormBase } from "./form"
import { RMLTheme } from "./themes/rml-theme"

export * from './exports'

export class RMLForm extends FormBase {
    constructor() {
        super(new RMLTheme())
    }
}

window.customElements.define('shacl-form', RMLForm)