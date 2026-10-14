import type { Meta } from '@storybook/web-components-vite'
import { shaclCoreTestDefs } from '../../../test-defs/shacl-core'
import { assertExportsMatch, buildShaclStoryObj, renderShaclForm, toExportName, type ShaclCoreStoryArgs } from '../_shared'

const meta: Meta<ShaclCoreStoryArgs> = {
    title: 'SHACL Core/C4-authoring-guidance',
    render: renderShaclForm,
    tags: ['autodocs'],
    parameters: { fullDemoPage: true },
}
export default meta

const defs = shaclCoreTestDefs.filter(def => def.category === 'C4')
const byId = Object.fromEntries(defs.map(def => [toExportName(def.id), buildShaclStoryObj(def)]))

export const core_misc_message_001 = byId['core_misc_message_001']

assertExportsMatch(defs, ['core_misc_message_001'])
