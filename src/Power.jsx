import { useState } from 'react'
import { Lock, Moon, LogOut, RotateCcw, Power as PowerIcon } from 'lucide-react'
import Sortable from './Sortable.jsx'
import { t } from './i18n.js'

// lock, sleep, sign out, restart, shut down; the last three need a second press within 4 s
const ITEMS = [['lock', Lock, 'Lock'], ['sleep', Moon, 'Sleep'], ['signout', LogOut, 'Sign out', true], ['restart', RotateCcw, 'Restart', true], ['shutdown', PowerIcon, 'Shut down', true]]

export default function Power() {
  const [armed, setArmed] = useState(null)
  const press = (id, confirm) => {
    if (confirm && armed !== id) { setArmed(id); setTimeout(() => setArmed((a) => (a === id ? null : a)), 4000); return }
    setArmed(null); window.art?.power(id)
  }
  return (
    <Sortable name="power" className="grid grid-cols-3 gap-2">
      {ITEMS.map(([id, Icon, label, confirm]) => (
        <button key={id} onClick={() => press(id, confirm)}
          className={`flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl p-3 transition ${armed === id ? 'bg-accent text-ink' : 'bg-card/80 hover:ring-1 hover:ring-accent'}`}>
          <Icon size={26} className={armed === id ? '' : 'text-accent'} />
          <span className="text-sm font-semibold">{armed === id ? t('Press again') : t(label)}</span>
        </button>
      ))}
    </Sortable>
  )
}
