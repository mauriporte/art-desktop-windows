import { useEffect, useState } from 'react'
import { load, save } from './slider.js'
import { house } from './house.js'

// EN / ES for every window (notch, panel, docks): texts are written in English and looked up here for Spanish.
// The choice is kept per viewer; every open window follows a change at once (the storage event).
const ES = {
  // notch tabs and header
  Today: 'Hoy', Controls: 'Controles', Remote: 'Mando', Screens: 'Pantallas', Buttons: 'Botones', Look: 'Aspecto',
  Glass: 'Cristal', Solid: 'Sólido', Language: 'Idioma', 'Talk to {a}': 'Hablar con {a}',
  'Unpin (auto-hide again)': 'Desanclar (se oculta solo)', 'Pin open': 'Anclar abierto',
  // controls
  'Reading radios…': 'Leyendo radios…', 'Radios unavailable': 'Radios no disponibles', Airplane: 'Modo avión',
  'Energy saver': 'Ahorro de energía', 'Night light': 'Luz nocturna', Cast: 'Transmitir', 'Wireless display': 'Pantalla inalámbrica',
  Project: 'Proyectar', 'Screen mode': 'Modo de pantalla', 'More…': 'Más…', 'Windows quick settings': 'Ajustes rápidos de Windows',
  Mute: 'Silenciar', Unmute: 'Activar sonido', On: 'Encendido', Off: 'Apagado', 'All radios off': 'Todas las radios apagadas',
  'Best efficiency': 'Máxima eficiencia', 'No adapter (USB)': 'Sin adaptador (USB)', 'No adapter': 'Sin adaptador',
  'Not connected': 'No conectado', Disconnected: 'Desconectado', Connected: 'Conectado', Traffic: 'Tráfico',
  'Via LAN': 'Por LAN', 'Via VPN': 'Por VPN', 'Are you changing the traffic to the VPN?': '¿Cambias el tráfico a la VPN?',
  'Are you switching back to Local IP?': '¿Vuelves a la IP local?', Yes: 'Sí', No: 'No', 'Windows will ask for permission.': 'Windows pedirá permiso.',
  Cancelled: 'Cancelado', 'Switching…': 'Cambiando…',
  // today / weather
  'Change city': 'Cambiar ciudad', Clear: 'Despejado', 'Partly cloudy': 'Parcialmente nublado', Cloudy: 'Nublado', Fog: 'Niebla',
  Rain: 'Lluvia', Snow: 'Nieve', Storm: 'Tormenta', 'City not found': 'Ciudad no encontrada',
  // remote
  OK: 'OK', Pair: 'Emparejar', 'Pair with Joint Remote on': 'Emparejar con Joint Remote en',
  'Press Pair: a 6-digit code appears on the device. Type it here.': 'Pulsa Emparejar: aparece un código de 6 cifras en el dispositivo. Escríbelo aquí.',
  'Loading devices…': 'Cargando dispositivos…', '6-digit code': 'Código de 6 cifras', 'Paste & send link': 'Pegar y enviar enlace',
  'Paste & open on the TV': 'Pegar y abrir en la TV', 'Type for': 'Escribir en', 'Enter sends': 'Intro envía', 'not reachable': 'no responde',
  'Code shown on': 'Código en pantalla de', 'Pairing failed: press Pair for a new code': 'Falló el emparejamiento: pulsa Emparejar para otro código',
  'Paired with': 'Emparejado con', 'Link copied on': 'Enlace copiado en', 'Opening on': 'Abriendo en', 'Typed on': 'Escrito en',
  'first (Joint Remote)': 'primero (Joint Remote)', 'Play or pause': 'Reproducir o pausar', 'Volume up': 'Subir volumen', Next: 'Siguiente',
  'Volume down, hold to mute': 'Bajar volumen, mantén para silenciar', Type: 'Escribir', Back: 'Atrás', Previous: 'Anterior', Home: 'Inicio',
  'No remotes set up yet. They come from': 'Aún no hay mandos. Salen de', 'the TV and IR remotes also need the Home Assistant token in':
    'la TV y los mandos IR también necesitan el token de Home Assistant en',
  // screens
  'Reload devices': 'Recargar dispositivos', 'Open bigger in its own window': 'Abrir más grande en su propia ventana',
  'ADB Control not reachable': 'ADB Control no responde', 'No device is connected to ADB Control.': 'No hay dispositivos conectados a ADB Control.',
  "Nothing is streaming. Turn a device's Video on in HA's Stream Control.": 'No se está transmitiendo nada. Activa el Vídeo de un dispositivo en Stream Control de HA.',
  'Connect another VNC': 'Conectar otro VNC', 'Add / update': 'Añadir / actualizar', 'Remove (by name)': 'Quitar (por nombre)',
  'Name (same name = update)': 'Nombre (mismo nombre = actualizar)', 'IP or computer name': 'IP o nombre del equipo', 'Port (5900)': 'Puerto (5900)',
  'VNC password (optional)': 'Contraseña VNC (opcional)', 'Resolution (e.g. 1920x1080)': 'Resolución (p. ej. 1920x1080)',
  'Enter at least the name': 'Pon al menos el nombre', 'and the IP': 'y la IP', 'is off': 'está apagado',
  'The screen will come back here as soon as it is on.': 'La pantalla volverá a aparecer aquí en cuanto se encienda.',
  // HA tiles
  // (the names of the house's own tiles and collections are translated in house.json "es")
  Cameras: 'Cámaras', Capture: 'Capturar', Unavailable: 'No disponible',
  'Press again to confirm': 'Pulsa otra vez para confirmar', Last: 'Último', Confirm: 'Confirmar', 'Capture of': 'Captura de',
  // voice assistant talk card ({a} = its name, house.json jarvis.name)
  'Default microphone': 'Micrófono predeterminado', 'Write to {a}…': 'Escribe a {a}…', 'Connecting…': 'Conectando…',
  'Listening…': 'Te escucho…', Microphone: 'Micrófono', 'Thinking…': 'Pensando…', "I didn't hear you": 'No te he oído', Stop: 'Parar',
  Gain: 'Ganancia', '{a} unavailable': '{a} no disponible',
  // panel
  Music: 'Música', Weather: 'Tiempo', 'Nothing playing': 'No suena nada', 'No music player set (ha.json "music").': 'No hay reproductor configurado (ha.json "music").',
  // Claude tab
  'Show the full command': 'Ver el comando completo', 'Hide the full command': 'Ocultar el comando', Allow: 'Permitir', Deny: 'Denegar',
  'Open the full command first': 'Abre primero el comando completo', 'No Claude Code sessions have reported in yet.': 'Aún no ha avisado ninguna sesión de Claude Code.',
  'Reply to': 'Responder a', Dictate: 'Dictar', Send: 'Enviar', 'Sending…': 'Enviando…', Sent: 'Enviado', 'Not sent': 'No enviado',
  Working: 'Trabajando', 'Waiting for you': 'Esperándote', Done: 'Terminado', Idle: 'En espera',
  // dock
  'Open in Explorer': 'Abrir en el Explorador', Empty: 'Vacío', 'Recycle Bin': 'Papelera de reciclaje', 'All desktops': 'Todos los escritorios', 'Show as list': 'Ver como lista', 'Show as grid': 'Ver como cuadrícula', 'Terminal (Admin)': 'Terminal (Administrador)',
  'Taskbar hidden (click to show it)': 'Barra de tareas oculta (pulsa para mostrarla)', 'Hide the Windows taskbar': 'Ocultar la barra de tareas de Windows',
  Downloads: 'Descargas', Documents: 'Documentos', Pictures: 'Imágenes', Network: 'Red',
  // controls, torrents, dashboards, lights (29/10)
  Taskbar: 'Barra de tareas', Hidden: 'Oculta', Shown: 'Visible', 'No network': 'Sin red',
  Download: 'Bajada', Upload: 'Subida', 'Slow mode': 'Modo lento', Active: 'Activos', 'Nothing is downloading.': 'No se está descargando nada.', ETA: 'Quedan',
  downloading: 'Descargando', forcedDL: 'Descargando (forzado)', stalledDL: 'Atascado', queuedDL: 'En cola', metaDL: 'Buscando metadatos', uploading: 'Compartiendo', forcedUP: 'Compartiendo (forzado)', pausedDL: 'En pausa', stoppedDL: 'Detenido', checkingDL: 'Comprobando',
  'Tray icons (shows the taskbar for a moment)': 'Iconos de la bandeja (muestra la barra un momento)', More: 'Más',
  'Dashboard (Ctrl+Alt+H)': 'Panel (Ctrl+Alt+H)', Edit: 'Editar', 'Done editing': 'Listo', 'Clickable again': 'Volver a poder pulsar', 'Click-through (clicks reach the windows behind)': 'Atravesable (los clics llegan a las ventanas de detrás)', notes: 'notas', Alarm: 'Alarma', 'No picture': 'Sin imagen', 'Nothing pending.': 'Nada pendiente.', Dismiss: 'Descartar', 'Mark as read': 'Marcar como leída', unread: 'sin leer', on: 'activos', online: 'en línea', Online: 'En línea', Offline: 'Sin conexión', 'Open pull requests': 'Pull requests abiertos', Open: 'Abierto', Repositories: 'Repositorios', Private: 'Privado', Public: 'Público', unsaved: 'sin guardar', 'not pushed': 'sin subir', 'Up to date': 'Al día', changed: 'cambiado hace', Asked: 'Pedido a', 'Lock editing': 'Bloquear la edición', 'Unlock editing': 'Desbloquear la edición', 'Pin (stays open behind your windows)': 'Fijar (se queda abierto detrás de tus ventanas)', 'Unpin (closes when you click outside)': 'Soltar (se cierra al pulsar fuera)', pending: 'pendientes', Calendar: 'Calendario', Tomorrow: 'Mañana', 'All day': 'Todo el día', 'Nothing in the next two weeks.': 'Nada en las próximas dos semanas.', running: 'en marcha', Running: 'En marcha', Stopped: 'Detenido', 'Tap again to confirm': 'Pulsa otra vez para confirmar', disarmed: 'Desarmada', armed_away: 'Armada (fuera)', armed_home: 'Armada (en casa)', armed_night: 'Armada (noche)', triggered: 'Disparada', 'Drag to resize': 'Arrastra para cambiar el tamaño', Name: 'Nombre', Size: 'Tamaño', Cancel: 'Cancelar', 'Add a tile': 'Añadir un mosaico',
  'Search a light, switch, scene, sensor…': 'Busca una luz, interruptor, escena, sensor…',
  'No tiles yet: press Edit, then + to add your lights, switches and scenes.': 'Aún no hay mosaicos: pulsa Editar y luego + para añadir luces, interruptores y escenas.',
  'Circle to Ask': 'Rodea y pregunta', 'Circle anything to ask about it · Esc: cancel': 'Rodea lo que quieras para preguntar · Esc: cancelar',
  'What is this?': '¿Qué es esto?', Ask: 'Preguntar',
  'Brain Map': 'Mapa mental', Search: 'Buscar', new: 'nuevas', 'in total': 'en total', 'on the map': 'en el mapa', finding: 'buscando', 'more places…': 'lugares más…',
  Clipboard: 'Portapapeles', Power: 'Energía', 'Click an item to copy it again. Kept until the app closes.': 'Pulsa un elemento para copiarlo de nuevo. Se guarda hasta cerrar la app.',
  'Clear all': 'Borrar todo', 'Nothing copied yet.': 'Aún no has copiado nada.', Remove: 'Quitar',
  Lock: 'Bloquear', Sleep: 'Suspender', 'Sign out': 'Cerrar sesión', Restart: 'Reiniciar', 'Shut down': 'Apagar', 'Press again': 'Pulsa otra vez',
  'Screen grab': 'Captura de pantalla', 'Drag: area · Click: window · Enter: whole screen · Esc: cancel': 'Arrastra: zona · Clic: ventana · Enter: pantalla entera · Esc: cancelar',
  Arrow: 'Flecha', Box: 'Recuadro', Text: 'Texto', Blur: 'Difuminar', Highlight: 'Resaltar', Undo: 'Deshacer', Copy: 'Copiar', Save: 'Guardar', Pin: 'Fijar', Close: 'Cerrar', Copied: 'Copiado', Saved: 'Guardado', Torrents: 'Torrents', Dashboards: 'Paneles', Lights: 'Luces', Rooms: 'Estancias', Lamps: 'Lámparas',
  Devices: 'Dispositivos', Multimedia: 'Multimedia', Ideas: 'Ideas', Projects: 'Proyectos', Remotes: 'Remotos', Mail: 'Correo', Chat: 'Chat', Social: 'Social', Map: 'Mapa',
}

let lang = load('lang', 'es')
export const getLang = () => lang
export const locale = () => (lang === 'es' ? 'es-ES' : 'en-GB')
// Spanish: the house's own words first (house.json "es": its tile, camera and collection names), then the app's.
// {a} in a text is the voice assistant's name
export const t = (s) => (lang === 'es' ? house.es?.[s] ?? ES[s] ?? s : s).replace('{a}', house.jarvis?.name ?? 'the assistant')
export function setLang(l) { lang = l; save('lang', l); dispatchEvent(new Event('langchange')) }
addEventListener('storage', (e) => { if (e.key === 'lang' && e.newValue) { lang = e.newValue; dispatchEvent(new Event('langchange')) } })

// light names written together ("LucesSalon") read as words; other names (servers, apps) stay as they are
export const words = (s) => (/^(Luces|Luz)[A-ZÁÉÍÓÚÑ]/.test(s ?? '') ? s.replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2') : s)

// re-renders the calling component (and so its children) when the language changes
export function useLang() {
  const [, bump] = useState(0)
  useEffect(() => { const h = () => bump((x) => x + 1); addEventListener('langchange', h); return () => removeEventListener('langchange', h) }, [])
  return lang
}

// "5 min ago" / "hace 5 min"
export function ago(iso) {
  const s = Math.round((Date.now() - new Date(iso)) / 1000)
  if (!iso || isNaN(s)) return '—'
  const v = s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`
  return lang === 'es' ? `hace ${v}` : `${v} ago`
}
