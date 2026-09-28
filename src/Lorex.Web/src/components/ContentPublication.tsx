import { useEffect, useId, useState } from 'react'
import { ChevronDown, Globe, Lock } from 'lucide-react'
import { ActionMenu } from './ActionMenu'
import { getContentPublication, publishContent, unpublishContent } from '../publishing/api'
import { Visibility, type ContentKind, type ContentPublicationState } from '../publishing/types'

/** What each kind lists publicly and what it keeps private - said before publishing, never discovered after. */
const WORDS = {
  entry: {
    noun: 'entry',
    listed: 'Its name, type, summary and thumbnail are listed.',
    kept: 'Its article, fields, relationships and history are not published.',
    isPublic: 'This lore entry is available in your public universe.',
    willPublish: 'Publishing this lore entry makes it available in your public universe.',
    selectedHidden:
      'This entry is selected for publication, but it will remain hidden until the universe is public.',
    willSelect:
      'Your universe is private. Publishing selects this entry: it will remain hidden until the universe is public.',
  },
  story: {
    noun: 'story',
    listed: 'Its title is listed.',
    kept: 'Its premise, chapters, scenes, manuscript, plot and notes are not published.',
    isPublic: 'This story is selected for your public universe.',
    willPublish: 'Publishing this story selects it for your public universe.',
    selectedHidden:
      'This story is selected for publication, but remains hidden while the universe is private.',
    willSelect:
      'Your universe is private. Publishing selects this story: it remains hidden while the universe is private.',
  },
} as const

type Shown = 'private' | 'public' | 'selected'

function shownOf(state: ContentPublicationState): Shown {
  if (state.visibility !== Visibility.Public) return 'private'
  return state.universeIsPublic ? 'public' : 'selected'
}

const LABELS: Record<Shown, string> = {
  private: 'Private',
  public: 'Public',
  selected: 'Selected',
}

/**
 * One lore entry's or story's publication (ADR 0036, Task 010): its state as a pill, which opens what that state
 * means and the one thing to do about it.
 *
 * The state is always a word - Private, Public, or Selected when the item is chosen but its universe is private -
 * never a colour alone, and the universe's part is always said, so the author never has to work out whether anyone
 * can see it. Opening it is the confirmation: what gets listed, what stays private and the explicit verb, on the
 * `ActionMenu` disclosure, so keyboard, focus and Escape behave as every other menu does. Publishing never touches a
 * form, so it cannot leave one dirty; a refusal leaves everything as it was and says so.
 *
 * `placement` says where the panel hangs: `bar` under the end of the bar it sits in, `line` under the start of the
 * line of facts it sits in. Either way it is bounded by that row, so it never leaves a phone's screen.
 */
export function ContentPublication({
  universeId,
  kind,
  id,
  name,
  placement,
}: {
  universeId: string
  kind: ContentKind
  id: string
  name: string
  placement: 'bar' | 'line'
}) {
  const noteId = useId()
  const [state, setState] = useState<ContentPublicationState | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const words = WORDS[kind]

  useEffect(() => {
    const controller = new AbortController()
    getContentPublication(universeId, kind, id, controller.signal)
      .then((loaded) => {
        setState(loaded)
        setFailed(null)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed('Publication status unavailable.')
      })
    return () => {
      controller.abort()
    }
  }, [universeId, kind, id])

  if (!state) {
    return failed ? (
      <span className="contentpub__error" role="alert" data-testid={`${kind}-publication-error`}>
        {failed}
      </span>
    ) : null
  }

  const shown = shownOf(state)
  const isSelected = state.visibility === Visibility.Public

  async function change(publish: boolean) {
    setBusy(true)
    setFailed(null)
    setAnnouncement('')
    try {
      const next = publish
        ? await publishContent(universeId, kind, id)
        : await unpublishContent(universeId, kind, id)
      setState(next)
      setAnnouncement(
        !publish
          ? `Made private. It is no longer listed in your public universe.`
          : next.universeIsPublic
            ? `Published. It is listed in your public universe.`
            : `Selected for publication. It stays hidden while the universe is private.`,
      )
    } catch {
      // Nothing changed: the state shown is still the stored one.
      setFailed(`It could not be ${publish ? 'published' : 'made private'}. Try again.`)
    } finally {
      setBusy(false)
    }
  }

  const heading =
    shown === 'public' ? 'Public' : shown === 'selected' ? 'Selected for publication' : 'Private'

  const explanation =
    shown === 'public'
      ? [words.isPublic, words.listed, words.kept]
      : shown === 'selected'
        ? [words.selectedHidden, words.kept]
        : [
            `Only you can see this ${words.noun}.`,
            state.universeIsPublic ? words.willPublish : words.willSelect,
            words.listed,
            words.kept,
          ]

  return (
    <div className={`contentpub contentpub--${placement}`}>
      <ActionMenu
        className="contentpub__menu"
        label={`Publication: ${LABELS[shown]}`}
        triggerClassName={`contentpub__trigger contentpub__trigger--${shown}`}
        trigger={
          <>
            {isSelected ? (
              <Globe
                className="contentpub__icon"
                aria-hidden="true"
                focusable="false"
                strokeWidth={1.75}
              />
            ) : (
              <Lock
                className="contentpub__icon"
                aria-hidden="true"
                focusable="false"
                strokeWidth={1.75}
              />
            )}
            <span data-testid={`${kind}-publication-state`}>{LABELS[shown]}</span>
            <ChevronDown
              className="contentpub__chevron"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
          </>
        }
        panelClassName="contentpub__panel"
        triggerTestId={`${kind}-publication`}
        panelTestId={`${kind}-publication-panel`}
      >
        <div className="actionmenu__context contentpub__context" id={noteId}>
          <p className="contentpub__heading">{heading}</p>
          {explanation.map((line) => (
            <p className="contentpub__note" key={line}>
              {line}
            </p>
          ))}
        </div>
        {isSelected ? (
          <button
            className="actionmenu__item"
            type="button"
            disabled={busy}
            aria-describedby={noteId}
            onClick={() => void change(false)}
            data-testid={`unpublish-${kind}`}
          >
            <Lock
              className="button__icon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            Make private
          </button>
        ) : (
          <button
            className="actionmenu__item"
            type="button"
            disabled={busy}
            aria-describedby={noteId}
            onClick={() => void change(true)}
            data-testid={`publish-${kind}`}
          >
            <Globe
              className="button__icon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            Publish {words.noun}
          </button>
        )}
      </ActionMenu>
      {failed ? (
        <span className="contentpub__error" role="alert" data-testid={`${kind}-publication-error`}>
          {failed}
        </span>
      ) : null}
      <span className="visually-hidden" role="status" data-testid={`${kind}-publication-announcer`}>
        {announcement ? (
          <>
            <bdi>{name}</bdi>: {announcement}
          </>
        ) : null}
      </span>
    </div>
  )
}
