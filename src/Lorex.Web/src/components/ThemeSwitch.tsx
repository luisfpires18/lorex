import { useId } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme, type Theme } from '../lib/theme'
import { ActionIcon } from './ActionIcon'

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

/**
 * Lorex's one appearance choice (013), for the portal and the workspace together: two named buttons in the shared
 * segmented track, the chosen one pressed. The words carry it; the icons only help an eye. Inside a menu the buttons
 * keep it open, so the change is seen where it was made.
 */
export function ThemeSwitch({ inMenu = false }: { inMenu?: boolean }) {
  const [theme, setTheme] = useTheme()
  const labelId = useId()

  return (
    <div className="themeswitch">
      <span className="themeswitch__label" id={labelId}>
        Theme
      </span>
      <div className="segmented" role="group" aria-labelledby={labelId}>
        {OPTIONS.map(({ value, label, icon }) => (
          <button
            key={value}
            type="button"
            className="segmented__option themeswitch__option"
            aria-pressed={theme === value}
            onClick={() => setTheme(value)}
            data-keep-open={inMenu ? '' : undefined}
            data-testid={`theme-${value}`}
          >
            <ActionIcon icon={icon} />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
