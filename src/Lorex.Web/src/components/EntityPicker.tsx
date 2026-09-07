import { useEffect, useId, useRef, useState } from 'react'
import { listEntities } from '../lore/api'
import type { EntitySummary } from '../lore/types'

const MAX_RESULTS = 8

interface EntityPickerProps {
  label: string
  universeId: string
  /** The entity currently chosen, so the field can show its name rather than an id. */
  value: { id: string; name: string } | null
  onChange: (choice: { id: string; name: string } | null) => void
  /** Left out of the results. Normally the entry being edited. */
  excludeId?: string
  placeholder?: string
  error?: string
}

/**
 * Search-as-you-type over one universe. The API does the searching, so nothing is
 * preloaded and a large world costs the same as a small one.
 */
export function EntityPicker({
  label,
  universeId,
  value,
  onChange,
  excludeId,
  placeholder = 'Search this universe',
  error,
}: EntityPickerProps) {
  const inputId = useId()
  const listId = useId()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EntitySummary[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [isSearching, setIsSearching] = useState(false)

  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const controller = new AbortController()

    // Typing settles before the API is asked, so a fast typist makes one call, not ten.
    const timer = setTimeout(() => {
      setIsSearching(true)
      listEntities(
        universeId,
        { search: query, entityTypeId: null, canonStatus: null, tag: null, page: 1 },
        controller.signal,
      )
        .then((page) => {
          setResults(page.items.filter((item) => item.id !== excludeId).slice(0, MAX_RESULTS))
          setActive(0)
        })
        .catch(() => {
          /* An aborted or failed search simply leaves the previous results in place. */
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearching(false)
        })
    }, 200)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [universeId, query, excludeId, isOpen])

  // A click outside closes the list without choosing anything.
  useEffect(() => {
    if (!isOpen) return

    function onPointerDown(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setIsOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [isOpen])

  function choose(item: EntitySummary) {
    onChange({ id: item.id, name: item.name })
    setIsOpen(false)
    setQuery('')
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => {
        if (results.length === 0) return 0
        return (current + step + results.length) % results.length
      })
    } else if (event.key === 'Enter') {
      if (isOpen && results[active]) {
        event.preventDefault()
        choose(results[active])
      }
    } else if (event.key === 'Escape') {
      if (isOpen) {
        event.preventDefault()
        setIsOpen(false)
      }
    }
  }

  return (
    <div className="field picker" ref={wrapper}>
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>

      {value ? (
        <p className="picker__chosen">
          <span className="picker__chosenname">{value.name}</span>
          <button
            className="button button--quiet"
            type="button"
            onClick={() => {
              onChange(null)
              setIsOpen(true)
            }}
            data-testid="picker-clear"
          >
            Change
          </button>
        </p>
      ) : (
        <>
          <input
            id={inputId}
            className="field__input"
            type="text"
            role="combobox"
            autoComplete="off"
            aria-expanded={isOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-invalid={error ? true : undefined}
            aria-activedescendant={
              isOpen && results[active] ? `${listId}-${results[active].id}` : undefined
            }
            placeholder={placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={onKeyDown}
            data-testid="picker-input"
          />

          {isOpen ? (
            <ul className="picker__list" id={listId} role="listbox" aria-label={label}>
              {results.map((item, index) => (
                <li key={item.id}>
                  <button
                    id={`${listId}-${item.id}`}
                    className="picker__option"
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(item)}
                    data-testid={`picker-option-${item.name}`}
                  >
                    <span className="picker__name">{item.name}</span>
                    <span className="picker__kind">{item.entityTypeName}</span>
                  </button>
                </li>
              ))}

              {results.length === 0 ? (
                <li className="picker__none">
                  {isSearching ? 'Looking…' : 'Nothing here by that name.'}
                </li>
              ) : null}
            </ul>
          ) : null}
        </>
      )}

      {error ? <p className="field__error">{error}</p> : null}
    </div>
  )
}
