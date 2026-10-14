// Shared RML shapes graph, kept outside Storybook's story-file glob.
import coreAuthoringShapes from '../../../rml/core-authoring.ttl?raw'
import ioShapes from '../../../rml/io.ttl?raw'
import authoringOverlayShapes from '../../../rml/authoring-overlay.ttl?raw'

export const rmlShapesGraph = [coreAuthoringShapes, ioShapes, authoringOverlayShapes].join('\n\n')
