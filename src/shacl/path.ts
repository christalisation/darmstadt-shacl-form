import type { NamedNode } from "@rdfjs/types";

/**
 * Semantic representation of a SHACL Core property path.
 *
 * RDF syntax uses IRIs, blank nodes and RDF lists. This ADT normalizes
 * those RDF structures into explicit path variants.
 */
export type ShaclPath =
  | ShaclPathPredicate
  | ShaclPathSequence
  | ShaclPathAlternative
  | ShaclPathInverse
  | ShaclPathZeroOrMore
  | ShaclPathOneOrMore
  | ShaclPathZeroOrOne;

export interface ShaclPathPredicate {
  kind: "predicate";
  predicate: NamedNode;
}

export interface ShaclPathSequence {
  kind: "sequence";
  paths: ShaclPath[];
}

export interface ShaclPathAlternative {
  kind: "alternative";
  paths: ShaclPath[];
}

export interface ShaclPathInverse {
  kind: "inverse";
  path: ShaclPath;
}

export interface ShaclPathZeroOrMore {
  kind: "zeroOrMore";
  path: ShaclPath;
}

export interface ShaclPathOneOrMore {
  kind: "oneOrMore";
  path: ShaclPath;
}

export interface ShaclPathZeroOrOne {
  kind: "zeroOrOne";
  path: ShaclPath;
}

export function isPredicatePath(path: ShaclPath): path is ShaclPathPredicate {
  return path.kind === "predicate";
}

/**
 * Returns the RDF predicate when the path is directly represented by one IRI.
 */
export function getPredicatePath(path: ShaclPath): NamedNode | undefined {
  return isPredicatePath(path) ? path.predicate : undefined;
}

/**
 * Returns all predicate alternatives if every branch is a simple predicate path.
 */
export function getAlternativePredicatePaths(
  path: ShaclPath
): NamedNode[] | undefined {
  if (path.kind !== "alternative") {
    return undefined;
  }

  const predicates = path.paths.map(getPredicatePath);

  return predicates.every(
    (predicate): predicate is NamedNode => predicate !== undefined
  )
    ? predicates
    : undefined;
}

/**
 * Human-readable representation for logs and diagnostics.
 */
export function pathToString(path: ShaclPath): string {
  switch (path.kind) {
    case "predicate":
      return path.predicate.value;
    case "alternative":
      return path.paths.map(pathToString).join(" | ");
    case "sequence":
      return path.paths.map(pathToString).join(" / ");
    case "inverse":
      return `^${pathToString(path.path)}`;
    case "zeroOrMore":
      return `${pathToString(path.path)}*`;
    case "oneOrMore":
      return `${pathToString(path.path)}+`;
    case "zeroOrOne":
      return `${pathToString(path.path)}?`;
  }
}
