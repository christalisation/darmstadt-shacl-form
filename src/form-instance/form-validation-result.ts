export interface FormValidationError {
  message: string;
  constraintKind?: string;
  valueIndex?: number;
}

export interface FormValidationResult {
  valid: boolean;
  errors: FormValidationError[];
}

export function validFormResult(): FormValidationResult {
  return {
    valid: true,
    errors: []
  };
}
