import { useEffect, useRef, useState } from 'react'

// An HA dashboard view inside the notch, drawn by HA itself (custom cards, cameras and all). It has its own HA login
// (partition persist:ha: the user signs in once, the session is kept). HA's header and sidebar are hidden and its
// background made see-through so the notch's glass shows behind the cards.
const HIDE_CHROME = `(() => {
  if (localStorage.getItem('dockedSidebar') !== '"always_hidden"') { localStorage.setItem('dockedSidebar', '"always_hidden"'); location.reload(); return }
  const css = ':host{--header-height:0px!important;--primary-background-color:transparent!important;--lovelace-background:transparent!important}' +
    '.header,.toolbar,app-header{display:none!important}#view{padding-top:0!important;min-height:auto!important;background:transparent!important}'
  const tick = () => { try {
    document.documentElement.style.setProperty('--primary-background-color', 'transparent')
    document.body.style.background = 'transparent'
    const main = document.querySelector('home-assistant').shadowRoot.querySelector('home-assistant-main').shadowRoot
    const root = main.querySelector('ha-panel-lovelace').shadowRoot.querySelector('hui-root').shadowRoot
    if (!root.getElementById('art')) { const s = document.createElement('style'); s.id = 'art'; s.textContent = css; root.appendChild(s) }
  } catch (e) {} }
  tick(); setInterval(tick, 1000)
})()`

export default function HaView({ path }) {
  const [url, setUrl] = useState(null)
  const ref = useRef()
  useEffect(() => { window.art?.haUrl().then(setUrl) }, [])
  useEffect(() => {
    const wv = ref.current
    if (!wv) return
    const ready = () => {
      wv.insertCSS('::-webkit-scrollbar{display:none}').catch(() => {})
      wv.executeJavaScript(HIDE_CHROME).catch(() => {})
    }
    wv.addEventListener('dom-ready', ready)
    return () => wv.removeEventListener('dom-ready', ready)
  }, [url])
  if (url === null) return null
  if (!url) return <p className="text-sm text-muted">No Home Assistant address yet (ha.json).</p>
  return <webview ref={ref} src={`${url}/${path}`} partition="persist:ha" className="h-full w-full overflow-hidden rounded-xl"
    style={{ background: 'transparent' }} />
}
