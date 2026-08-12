import { describe, expect, it } from 'vitest'
import { FormPipeline } from '../src/form-pipeline'
import { FormConfig } from '../src/config'

describe('FormPipeline', () => {
    it('does not treat targetObjectsOf helper shapes as root forms', async () => {
        const config = new FormConfig()
        config.skipShapeValidation = true
        config.shapes = `
            @prefix ex: <http://example.org/> .
            @prefix sh: <http://www.w3.org/ns/shacl#> .

            ex:RootShape
                a sh:NodeShape ;
                sh:targetClass ex:Root ;
                sh:property [
                    sh:path ex:name ;
                ] .

            ex:ChildValueShape
                a sh:NodeShape ;
                sh:targetObjectsOf ex:child ;
                sh:nodeKind sh:Literal .
        `

        const built = await new FormPipeline(config).build()

        expect(built.runtime.roots).toHaveLength(1)
        expect(
            built.runtime.roots[0].template.sourceShape.value,
        ).toBe('http://example.org/RootShape')
    })

    it('does not create required nested nodes before the user chooses one', async () => {
        const config = new FormConfig()
        config.skipShapeValidation = true
        config.shapes = `
            @prefix ex: <http://example.org/> .
            @prefix sh: <http://www.w3.org/ns/shacl#> .

            ex:RootShape
                a sh:NodeShape ;
                sh:targetClass ex:Root ;
                sh:property [
                    sh:path ex:child ;
                    sh:minCount 1 ;
                    sh:maxCount 1 ;
                    sh:node ex:ChildShape ;
                ] .

            ex:ChildShape
                a sh:NodeShape ;
                sh:property [
                    sh:path ex:name ;
                ] .
        `

        const built = await new FormPipeline(config).build()
        const root = built.runtime.roots[0]
        const childProperty = root.properties[0]

        expect(childProperty.template.required).toBe(true)
        expect(childProperty.template.valueType.kind).toBe('nestedNode')
        expect(childProperty.values).toHaveLength(0)
    })
})
