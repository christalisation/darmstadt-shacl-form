export class ShaclSemanticAnalyzer {
    private static shapes: Store | null = null;
    private static promise: Promise<Store> | null = null;

    // Loads the SHACL specification into a Store.
    // static so that its loaded and parsed once
    private static async getShacl(): Promise<Store> {
        if (this.shapes) {
            return this.shapes;
        }
        if (this.promise) {
            return this.promise;
        }

        this.promise = new Promise((resolve, reject) => {
            const spec = new Store();
            const parser = new StreamParser();
            parser.on('data', (quad) => spec.add(quad));
            parser.on('end', () => {
                this.shapes = spec;
                resolve(spec);
            });
            parser.on('error', reject);
            parser.write(shaclShacl);
            parser.end();
        });

        return this.promise;
    }
async analyze(
  shapesGraph: Store
): Promise<ShaclAnalysisResult> {
  const shaclShapes =
    await ShaclSemanticAnalyzer.getShacl();

  const validator = new Validator(
    shaclShapes,
    {
      details: true,
      factory: DataFactory
    }
  );

  const report =
    await validator.validate({
      dataset: shapesGraph
    });

  return this.mapReport(report);
}

private mapReport(report: any): ShaclAnalysisResult {
  return {
    conforms: report.conforms,
    violations: report.results.map((result: any) => ({
      message: result.message
        ?.map((message: any) => message.value)
        .join(", ") ?? "SHACL-SHACL validation error",

      focusNode: result.focusNode?.term,
      constraintComponent:
        result.constraintComponent,
      sourceShape:
        result.shape?.ptr?.term,
      value:
        result.value?.term,

      path: result.path
    }))
  };
}

    private formatResult(result: any): string {
        const message = result.message?.length
            ? result.message.map((message: any) => message.value).join(', ')
            : 'SHACL-SHACL validation error';

        const details = [
            this.formatDetail('focus', this.formatTerm(result.focusNode?.term)),
            this.formatDetail('path', this.formatPath(result.path)),
            this.formatDetail('component', this.formatTerm(result.constraintComponent)),
            this.formatDetail('shape', this.formatTerm(result.shape?.ptr?.term)),
            this.formatDetail('value', this.formatTerm(result.value?.term)),
        ].filter(Boolean);

        return details.length ? `${message} (${details.join('; ')})` : message;
    }

    private formatDetail(label: string, value?: string): string | undefined {
        return value ? `${label}: ${value}` : undefined;
    }

    private formatTerm(term: any): string | undefined {
        if (!term) {
            return undefined;
        }
        if (term.termType === 'Literal') {
            const language = term.language ? `@${term.language}` : '';
            const datatype = term.datatype?.value ? `^^${term.datatype.value}` : '';
            return `"${term.value}"${language || datatype}`;
        }
        if (term.termType === 'BlankNode') {
            return `_:${term.value}`;
        }
        return term.value || term.id;
    }

    private formatPath(path: any[] | undefined): string | undefined {
        if (!path?.length) {
            return undefined;
        }

        return path.map(step => {
            const predicates = step.predicates
                ?.map((predicate: any) => this.formatTerm(predicate))
                .filter(Boolean)
                .join('|');
            return predicates || step.quantifier;
        }).filter(Boolean).join('/');
    }
}