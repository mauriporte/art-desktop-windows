import { useEffect, useState } from 'react'

// WMO weather codes → short label + lucide icon name
export function describe(code) {
  if (code === 0) return ['Clear', 'Sun']
  if (code <= 2) return ['Partly cloudy', 'CloudSun']
  if (code === 3) return ['Cloudy', 'Cloud']
  if (code <= 48) return ['Fog', 'CloudFog']
  if (code <= 67 || (code >= 80 && code <= 82)) return ['Rain', 'CloudRain']
  if (code <= 77 || code === 85 || code === 86) return ['Snow', 'CloudSnow']
  return ['Storm', 'CloudLightning']
}

// fetched by the app's main process (Node): the page's own network stack failed to reach Open-Meteo here (29/10)
async function fetchWeather(city) {
  const r = await window.art?.weather(city)
  if (!r || r.error) throw new Error(r?.error ?? 'Not running in the app')
  return r.value
}

export function useWeather(city) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let live = true, retry
    // a failed fetch (network not up yet, a dropped connection) tries again in 30 s instead of waiting 15 min
    const load = () => fetchWeather(city).then((d) => { if (live) { setData(d); setError(null) } })
      .catch((e) => { if (live) { setError(e.message); clearTimeout(retry); retry = setTimeout(load, 30000) } })
    load()
    const t = setInterval(load, 15 * 60 * 1000)
    return () => { live = false; clearInterval(t); clearTimeout(retry) }
  }, [city])
  return { data, error }
}
