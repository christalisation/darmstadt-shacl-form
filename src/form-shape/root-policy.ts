import { FormShapeClassifier } from './classifier'
import { FormNodeShape } from './model'

export class FormRootPolicy {
    constructor(private readonly classifier = new FormShapeClassifier()) {}

    isFallbackRootCandidate(shape: FormNodeShape): boolean {
        return this.classifier.classify(shape).role === 'STRUCTURAL'
    }
}
