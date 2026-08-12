import { NamedNode } from '@rdfjs/types'

export type PredicatePath = { kind: 'predicate', predicate: NamedNode }
export type AlternativePath = { kind: 'alternative', paths: ShaclPath[] }
export type SequencePath = { kind: 'sequence', paths: ShaclPath[] }
export type InversePath = { kind: 'inverse', path: ShaclPath }
export type QuantifiedPath = {
    kind: 'zeroOrMore' | 'oneOrMore' | 'zeroOrOne',
    path: ShaclPath
}

export type ShaclPath =
    | PredicatePath
    | AlternativePath
    | SequencePath
    | InversePath
    | QuantifiedPath

export function isPredicatePath(path: ShaclPath): path is PredicatePath {
    return path.kind === 'predicate'
}

export function getPredicatePath(path: ShaclPath): NamedNode | undefined {
    return isPredicatePath(path) ? path.predicate : undefined
}

export function getAlternativePredicatePaths(path: ShaclPath): NamedNode[] | undefined {
    if (path.kind !== 'alternative') {
        return undefined
    }

    const predicates = path.paths.map(getPredicatePath)
    return predicates.every((predicate): predicate is NamedNode => predicate !== undefined)
        ? predicates
        : undefined
}

export function pathToString(path: ShaclPath): string {
    switch (path.kind) {
        case 'predicate':
            return path.predicate.value
        case 'alternative':
            return path.paths.map(pathToString).join(' | ')
        case 'sequence':
            return path.paths.map(pathToString).join(' / ')
        case 'inverse':
            return `^${pathToString(path.path)}`
        case 'zeroOrMore':
            return `${pathToString(path.path)}*`
        case 'oneOrMore':
            return `${pathToString(path.path)}+`
        case 'zeroOrOne':
            return `${pathToString(path.path)}?`
    }
}
