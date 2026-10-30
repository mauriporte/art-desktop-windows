import { createRoot } from 'react-dom/client'
import './index.css'
import Notch from './Notch.jsx'
import Panel from './Panel.jsx'
import Dock from './Dock.jsx'
import SpotifyWidget, { SpotifySlide } from './SpotifyWidget.jsx'
import { GrabSelect, GrabEdit, GrabPin, GrabAsk } from './Grab.jsx'
import Overlay from './Overlay.jsx'
import { query } from './slider.js'
import { loadHouse } from './house.js'

// one page, three window kinds (electron/main.cjs passes ?view=)
const WIDGETS = { spotify: SpotifyWidget }
const View = query.get('view') === 'widget' ? WIDGETS[query.get('type')] ?? (() => null) : { panel: Panel, dock: Dock, spotify: SpotifySlide, 'grab-select': GrabSelect, 'grab-edit': GrabEdit, 'grab-pin': GrabPin, 'grab-ask': GrabAsk, overlay: Overlay }[query.get('view')] ?? Notch
loadHouse().then(() => createRoot(document.getElementById('root')).render(<View />))
