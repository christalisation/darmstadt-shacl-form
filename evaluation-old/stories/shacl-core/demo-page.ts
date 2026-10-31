import { html } from 'lit'
import { ref } from 'lit/directives/ref.js'
import { bindGenericDemoPage } from '../../../demo/generic-page'

export interface ShaclDemoPageArgs {
    shapesContent: string
}

const boundPages = new WeakSet<Element>()

export function renderShaclDemoPage(args: ShaclDemoPageArgs) {
    const bindPage = (element?: Element) => {
        if (element && !boundPages.has(element)) {
            bindGenericDemoPage(element)
            boundPages.add(element)
        }
    }

    return html`
        <div class="demo-page" ${ref(bindPage)}>
            <header>
                <h1>SHACL Form Generator</h1>
                <nav><a href="./">Generic SHACL demo</a></nav>
            </header>
            <main>
                <section class="panel">
                    <h2>Shapes Graph</h2>
                    <input id="shapes-url" type="url" placeholder="Shapes Graph URL">
                    <textarea id="shapes-editor" spellcheck="false" .value=${args.shapesContent}></textarea>
                    <div class="panel-actions">
                        <button id="apply-shapes-btn" type="button">Apply shapes</button>
                        <button id="load-shapes-url-btn" type="button">Load URL</button>
                    </div>
                </section>
                <section id="form-panel" class="panel">
                    <h2>Generated form</h2>
                    <!-- Self-contained W3C fixtures are loaded once; duplicating the same Turtle as data-values duplicates shape triples. -->
                    <shacl-form
                        id="shacl-form"
                        data-shapes=${args.shapesContent}
                        data-collapse=""
                        data-values-namespace="http://example.org/"
                        data-show-node-ids
                    ></shacl-form>
                </section>
                <section class="panel">
                    <h2>Generated Turtle</h2>
                    <pre id="rdf-output"></pre>
                    <div class="panel-actions">
                        <button id="export-btn" type="button">Download .ttl</button>
                    </div>
                </section>
            </main>
        </div>
    `
}
