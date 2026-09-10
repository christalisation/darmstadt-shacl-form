// Shared RML shapes graph, used by both the static rml.stories.ts and the
// interaction stories under stories/rml/interaction/. Not a .stories.ts file
// itself, so Storybook's stories glob does not index it.
//
// Same three files, same order, as rml/index.html's `shapeFiles` array.
import coreAuthoringShapes from '../../rml/core-authoring.ttl?raw'
import ioShapes from '../../rml/io.ttl?raw'
import authoringOverlayShapes from '../../rml/authoring-overlay.ttl?raw'

export const rmlShapesGraph = [coreAuthoringShapes, ioShapes, authoringOverlayShapes].join('\n\n')
