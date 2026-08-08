// shacl/path.ts

import type { NamedNode } from "@rdfjs/types";

/**
 * Semantic representation of a SHACL property path.
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

export function isShaclPathPredicate(
  path: ShaclPath
): path is ShaclPathPredicate {
  return path.kind === "predicate";
}

/**
 * Returns the RDF predicate when the path is directly representable
 * by a single predicate.
 */
export function getPredicatePath(
  path: ShaclPath
): NamedNode | undefined {
  return isShaclPathPredicate(path)
    ? path.predicate
    : undefined;
}

/**
 * Returns all alternatives when the alternative path consists only
 * of simple predicate paths.
 */
export function getAlternativePredicatePaths(
  path: ShaclPath
): NamedNode[] | undefined {
  if (path.kind !== "alternative") {
    return undefined;
  }

  const predicates = path.paths.map(getPredicatePath);

  return predicates.every(
    (predicate): predicate is NamedNode =>
      predicate !== undefined
  )
    ? predicates
    : undefined;
}

/**
 * Returns a human-readable representation of the path.
 *
 * Intended for debugging, logging and error messages.
 */
export function pathToString(
  path: ShaclPath
): string {
  switch (path.kind) {
    case "predicate":
      return path.predicate.value;

    case "alternative":
      return path.paths
        .map(pathToString)
        .join(" | ");

    case "sequence":
      return path.paths
        .map(pathToString)
        .join(" / ");

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