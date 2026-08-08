import type { Term } from "@rdfjs/types";

import type { FormElementContext } from "./form-element-context";

/**
 * Creates the visual container for sh:group.
 *
 * It preserves the old <details>-based behavior without querying RDF here.
 */
export function createFormElementGroup(
  group: Term,
  context: FormElementContext
): HTMLElement {
  const label =
    context.labelForTerm?.(group) ??
    group.value;

  let container: HTMLElement;

  if (context.collapse !== false && context.collapse !== undefined) {
    const details = document.createElement("details");
    details.classList.add("shacl-group", "mb-3", "card", "p-3");
    details.dataset.subject = group.value;

    const summary = document.createElement("summary");
    summary.innerText = label;
    summary.classList.add("h5", "mb-0", "cursor-pointer");
    details.appendChild(summary);

    details.open = context.collapse === "open";
    container = details;
  } else {
    const div = document.createElement("div");
    div.classList.add("shacl-group");
    div.dataset.subject = group.value;

    const header = document.createElement("h1");
    header.innerText = label;
    div.appendChild(header);

    container = div;
  }

  return container;
}
