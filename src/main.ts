import './style.css'
import { initBlobs, blobPositions } from './blob'
import { initTorus } from './torus'
import { initFrame } from './frame'
import { initTrails } from './trail'

initBlobs()
initTorus()
initFrame()

// pass position getters to trail renderer
initTrails([
  () => blobPositions[0],
  () => blobPositions[1],
  () => blobPositions[2],
])
