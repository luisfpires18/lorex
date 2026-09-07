import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { UniverseForm } from '../components/UniverseForm'
import { deleteUniverse, setUniverseArchived, updateUniverse } from '../universes/api'
import type { WorkspaceContext } from './UniverseWorkspace'

export default function UniverseSettings() {
  const { universe, refresh } = useOutletContext<WorkspaceContext>()
  const navigate = useNavigate()

  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggleArchived() {
    setBusy(true)
    setError(null)
    try {
      refresh(await setUniverseArchived(universe.id, !universe.isArchived))
    } catch (problem: unknown) {
      setError(problem instanceof Error ? problem.message : 'That could not be changed.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await deleteUniverse(universe.id)
      await navigate('/app', { replace: true })
    } catch (problem: unknown) {
      setError(problem instanceof Error ? problem.message : 'That could not be deleted.')
      setBusy(false)
    }
  }

  return (
    <article className="settings">
      <h2 className="settings__title">Settings</h2>

      <section className="settings__section">
        <h3 className="settings__heading">Details</h3>
        {saved ? (
          <p className="settings__saved" role="status" data-testid="settings-saved">
            Saved.
          </p>
        ) : null}
        <UniverseForm
          key={universe.updatedAt}
          initial={{
            name: universe.name,
            description: universe.description,
            accentColor: universe.accentColor,
          }}
          submitLabel="Save changes"
          busyLabel="Saving"
          onSubmit={async (input) => {
            const updated = await updateUniverse(universe.id, input)
            refresh(updated)
            setSaved(true)
          }}
        />
      </section>

      <section className="settings__section">
        <h3 className="settings__heading">{universe.isArchived ? 'Restore' : 'Archive'}</h3>
        <p className="settings__note">
          {universe.isArchived
            ? 'This universe is archived. Restoring puts it back in your active list.'
            : 'Archiving keeps everything and takes the universe out of your active list.'}
        </p>
        <button
          className="button button--quiet"
          type="button"
          onClick={toggleArchived}
          disabled={busy}
          data-testid="toggle-archive"
        >
          {universe.isArchived ? 'Restore universe' : 'Archive universe'}
        </button>
      </section>

      {universe.isArchived ? (
        <section className="settings__section settings__section--danger">
          <h3 className="settings__heading">Delete</h3>
          <p className="settings__note">
            Deleting removes this universe and everything in it. There is no undo.
          </p>
          {confirmingDelete ? (
            <div className="settings__confirm">
              <p className="settings__note">
                Delete <strong>{universe.name}</strong> permanently?
              </p>
              <div className="form__actions">
                <button
                  className="button button--danger"
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  data-testid="confirm-delete"
                >
                  Delete permanently
                </button>
                <button
                  className="button button--quiet"
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button
              className="button button--quiet"
              type="button"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete universe
            </button>
          )}
        </section>
      ) : null}

      {error ? (
        <p className="form__message" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  )
}
