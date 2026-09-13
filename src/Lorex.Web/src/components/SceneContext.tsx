import { useId } from 'react'
import { Link } from 'react-router-dom'
import { LoreReference } from './LoreReference'
import type { Chronology } from '../chronology/types'
import { sceneWhen } from '../stories/format'
import type { SceneBeatReference } from '../stories/structure'
import type { Scene } from '../stories/types'

/*
 * What a scene refers to, drawn the same way wherever a scene is shown - its card on the Scenes view and its page on the
 * Manuscript view - so the two cannot drift apart. All of it is read-only here: the scene form edits the date, the point
 * of view and the lore, and the beats own their links to the scene. `testId` names the surface, so each keeps its own
 * test ids.
 */

type Surface = 'scene' | 'manuscript'

/** Where the scene happens in the world and whose eyes it is seen through, or nothing when it has neither. */
export function SceneStamp({
  universeId,
  chronology,
  scene,
  testId,
}: {
  universeId: string
  chronology: Chronology
  scene: Scene
  testId: Surface
}) {
  const when = sceneWhen(chronology, scene.chronology)
  if (!when && !scene.pov) return null

  return (
    <div className="scene__stamp">
      {when ? (
        <span className="scene__when" data-testid={`${testId}-when`}>
          {when.text}
          {when.placed ? null : <span className="scene__unplaced"> · no era yet</span>}
        </span>
      ) : null}
      {scene.pov ? (
        <span className="scene__pov" data-testid={`${testId}-pov`}>
          <span className="scene__label">Point of view</span>
          <LoreReference universeId={universeId} reference={scene.pov} portrait />
        </span>
      ) : null}
    </div>
  )
}

/** The lore the scene links, each a way to the entry's own page - or named and unlinked while it is in the Trash. */
export function SceneLore({
  universeId,
  scene,
  testId,
}: {
  universeId: string
  scene: Scene
  testId: Surface
}) {
  const labelId = useId()
  if (scene.entities.length === 0) return null

  return (
    <div className="scene__refs">
      <span className="scene__label" id={labelId}>
        Lore
      </span>
      <ul className="scene__lore" aria-labelledby={labelId} data-testid={`${testId}-lore`}>
        {scene.entities.map((reference) => (
          <li key={reference.entityId}>
            <LoreReference universeId={universeId} reference={reference} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The plot beats that point at the scene, arc by arc, each a way to that beat on the story's Plot view. */
export function SceneBeats({
  universeId,
  storyId,
  beats,
  testId,
}: {
  universeId: string
  storyId: string
  beats: SceneBeatReference[]
  testId: Surface
}) {
  const labelId = useId()
  if (beats.length === 0) return null

  return (
    <div className="scene__refs">
      <span className="scene__label" id={labelId}>
        Plot
      </span>
      <ul className="scene__lore" aria-labelledby={labelId} data-testid={`${testId}-plot`}>
        {beats.map((beat) => (
          <li key={beat.beatId}>
            <Link
              className="lorechip plotchip"
              to={`/app/universes/${universeId}/stories/${storyId}/plot#beat-${beat.beatId}`}
              aria-label={`${beat.arcTitle}: ${beat.beatTitle}`}
              data-testid={`${testId}-plot-beat`}
            >
              <span className="lorechip__name">
                {beat.arcTitle}
                <span className="plotchip__arrow"> → </span>
                {beat.beatTitle}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
