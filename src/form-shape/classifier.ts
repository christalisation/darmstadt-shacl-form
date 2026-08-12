import { FormNodeShape, FormNodeShapeRole, FormValueConstraints } from './model'

export interface FormShapeClassification {
    role: FormNodeShapeRole
    canRenderStandaloneForm: boolean
    canConstrainValue: boolean
}

export class FormShapeClassifier {
    classify(shape: FormNodeShape): FormShapeClassification {
        if (shape.properties.length > 0) {
            return {
                role: 'STRUCTURAL',
                canRenderStandaloneForm: true,
                canConstrainValue: true,
            }
        }

        if (this.hasValueConstraints(shape.valueConstraints)) {
            return {
                role: 'VALUE_ONLY',
                canRenderStandaloneForm: false,
                canConstrainValue: true,
            }
        }

        return {
            role: 'NON_RENDERABLE',
            canRenderStandaloneForm: false,
            canConstrainValue: false,
        }
    }

    private hasValueConstraints(constraints: FormValueConstraints): boolean {
        return Boolean(
            constraints.datatype ||
            constraints.nodeKind ||
            constraints.class ||
            constraints.minLength !== undefined ||
            constraints.maxLength !== undefined ||
            constraints.minInclusive !== undefined ||
            constraints.maxInclusive !== undefined ||
            constraints.minExclusive !== undefined ||
            constraints.maxExclusive !== undefined ||
            constraints.pattern !== undefined ||
            constraints.shaclIn?.length ||
            constraints.languageIn?.length ||
            constraints.hasValue
        )
    }
}
