import type { Meta } from '@storybook/web-components-vite'
import { shaclCoreTestDefs } from '../../../test-defs/shacl-core'
import { assertExportsMatch, buildShaclStoryObj, renderShaclForm, toExportName, type ShaclCoreStoryArgs } from '../_shared'

const meta: Meta<ShaclCoreStoryArgs> = {
    title: 'SHACL Core/C1-value-constraints',
    render: renderShaclForm,
    tags: ['autodocs'],
}
export default meta

const defs = shaclCoreTestDefs.filter(def => def.category === 'C1')
const byId = Object.fromEntries(defs.map(def => [toExportName(def.id), buildShaclStoryObj(def)]))

export const core_property_datatype_001 = byId['core_property_datatype_001']

assertExportsMatch(defs, ['core_property_datatype_001'])
