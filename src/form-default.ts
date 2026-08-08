import { ShaclForm } from "./form";
import "./styles.css";

export * from "./exports";

if (!customElements.get("shacl-form")) {
  customElements.define("shacl-form", ShaclForm);
}
