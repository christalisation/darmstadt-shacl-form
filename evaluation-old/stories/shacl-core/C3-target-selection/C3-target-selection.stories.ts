import type { Meta } from '@storybook/web-components-vite'
import { shaclCoreTestDefs } from '../../../test-defs/shacl-core'
import { assertExportsMatch, buildShaclStoryObj, renderShaclForm, toExportName, type ShaclCoreStoryArgs } from '../_shared'

const meta: Meta<ShaclCoreStoryArgs> = {
    title: 'SHACL Core/C3-target-selection',
    render: renderShaclForm,
    tags: ['autodocs'],
    parameters: { fullDemoPage: true },
}
export default meta

const defs = shaclCoreTestDefs.filter(def => def.category === 'C3')
const byId = Object.fromEntries(defs.map(def => [toExportName(def.id), buildShaclStoryObj(def)]))

export const core_targets_targetClass_001 = byId['core_targets_targetClass_001']

assertExportsMatch(defs, ['core_targets_targetClass_001'])
