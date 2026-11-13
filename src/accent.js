import { useEffect, useState } from 'react'

// the A.R.T. accent: this device's override, else the shared one (master overlay on .30), else index.css's orange.
// Every window sets --color-accent on <html>; Tailwind's accent classes and var(--color-accent) styles follow it.
export const FALLBACK = '#E8650A'
export const applyAccent = (a) => a?.accent && document.documentElement.style.setProperty('--color-accent', a.accent)
// for canvas and Leaflet, which can't read CSS variables
export const accentNow = () => getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || FALLBACK
export function startAccent() { window.art?.accent?.get().then(applyAccent); window.art?.accent?.on(applyAccent) }
// { accent, shared, local } for the picker; null until main answers
export function useAccent() {
  const [a, setA] = useState(null)
  useEffect(() => { window.art?.accent?.get().then(setA); window.art?.accent?.on(setA) }, [])
  return a
}
