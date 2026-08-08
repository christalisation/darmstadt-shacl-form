import type { ShaclDataValidationResult } from "../rdf-binding/shacl-data-validator";

/**
 * Maps authoritative SHACL validation results back to rendered fields.
 */
export class FormValidationPresenter {
  constructor(private readonly root: HTMLElement) {}

  clear(): void {
    for (const error of Array.from(this.root.querySelectorAll(
      ".validation-error.authoritative"
    ))) {
      error.remove();
    }

    for (const element of Array.from(
      this.root.querySelectorAll(".invalid")
    )) {
      element.classList.remove("invalid");
    }
  }

  present(result: ShaclDataValidationResult): void {
    this.clear();

    for (const violation of result.violations) {
      if (!violation.focusNode) continue;

      const node = this.root.querySelector<HTMLElement>(
        `[data-node-id="${this.escape(violation.focusNode.value)}"]`
      );

      if (!node) continue;

      let targets: HTMLElement[] = [];

      for (const predicate of violation.pathPredicates) {
        targets.push(
          ...Array.from(
            node.querySelectorAll<HTMLElement>(
              `[data-path="${this.escape(predicate.value)}"]`
            )
          )
        );
      }

      if (!targets.length) {
        targets = [node];
      }

      for (const target of targets) {
        target.classList.add("invalid");

        const error = document.createElement("span");
        error.classList.add(
          "validation-error",
          "authoritative"
        );
        error.title = violation.message || "Validation failed";
        target.appendChild(error);
      }
    }
  }

  focusFirstInvalid(): void {
    const editor = this.root.querySelector<HTMLElement>(
      ".invalid .editor"
    );

    if (editor) {
      editor.focus();
      return;
    }

    this.root.querySelector<HTMLElement>(".invalid")?.scrollIntoView();
  }

  private escape(value: string): string {
    if (typeof CSS !== "undefined" && CSS.escape) {
      return CSS.escape(value);
    }

    return value.replace(/["\\]/g, "\\$&");
  }
}
