import type { Meta } from '@storybook/web-components-vite'
import { shaclCoreTestDefs } from '../../../test-defs/shacl-core'
import { assertExportsMatch, buildShaclStoryObj, renderShaclForm, toExportName, type ShaclCoreStoryArgs } from '../_shared'

const meta: Meta<ShaclCoreStoryArgs> = {
    title: 'SHACL Core/C2-structural-paths',
    render: renderShaclForm,
    tags: ['autodocs'],
}
export default meta

const defs = shaclCoreTestDefs.filter(def => def.category === 'C2')
const byId = Object.fromEntries(defs.map(def => [toExportName(def.id), buildShaclStoryObj(def)]))

export const core_node_and_001 = byId['core_node_and_001']
export const core_path_path_alternative_001 = byId['core_path_path_alternative_001']

assertExportsMatch(defs, ['core_node_and_001', 'core_path_path_alternative_001'])
