# A.R.T. Desktop for Windows

A see-through companion for Windows 11 in the A.R.T. look (near-black, orange accents, flip clock): a drop-down
**notch** at the top of every screen, a Mac-style **dock** per screen, a **side panel** and a **media slide-in**, wired
to Home Assistant and to your other devices through [Joint Remote](https://github.com/mauriporte). It's the Windows
sibling of [art-linux-desktop](https://github.com/mauriporte/art-linux-desktop).

Every piece hides off its screen edge. A tiny, faint orange dot marks where it lives; touch that edge (or corner) with
the mouse and it slides out.

## What's in it

**Notch** (top centre of each screen). One strip of icon tabs: hover one for its name, drag tabs to reorder them,
and scroll with the arrows or the mouse wheel. Pin it to keep it open; the gear sets transparency and language (EN/ES).
- **Today**: flip clock, date, weather (Open-Meteo, no account; tap the city to change it).
- **Controls**: volume, Wi-Fi (USB adapters show up when plugged in), Bluetooth, airplane mode, night light, cast,
  project, a taskbar on/off switch, LAN details, and a LAN/VPN traffic switch for PCs with both.
- **Remote**: TVs and phones through Home Assistant or Joint Remote (keys, typing, send a link), plus IR remotes.
- **Screens**: live device screens from [ha-adb-control](https://github.com/mauriporte) / ws-scrcpy, and VNC.
- **Home Assistant tiles**: your own tabs of switches, lights, sensors, selects, buttons and cameras (house.json),
  and any HA dashboard view embedded as a tab.
- **Dashboards**: big tiles that open your main HA dashboards inside the notch.
- **Torrents**: qBittorrent speeds and every active download's progress (HA's qBittorrent integration).
- **Ideas**: a browser for notes in an Obsidian folder: a mind map of the collections, a searchable list, and a map of
  every note that names a place (looked up once on OpenStreetMap, then cached).
- **Clipboard**: the last 30 things you copied (kept in memory only; private copies from password managers are skipped).
- **Power**: lock, sleep, sign out, restart, shut down (the last three ask for a second press).
- **Claude**: Claude Code's permission requests (Allow / Deny) and your sessions, through Claude Code hooks.
- Every grid of tiles can be rearranged by dragging.

**Header tools**: a **screen grabber** (drag an area, click a window or take the whole screen; annotate with arrow,
box, text, blur and highlight; copy, save or pin it on top), **Circle to Ask** (draw round anything on screen and
ask about it: a local Ollama vision model, Claude through the Claude Code CLI, or Gemini through Home Assistant),
a tray button, and a mic for your Home Assistant voice assistant.

**Dock** (one per screen, any edge). Your taskbar's pinned apps plus its own pins ("Keep in dock"), running apps, stacks
of recent files (Downloads, Documents, Pictures, network drives, any folder; each shows as a grid or a list), the Recycle Bin, Search, All desktops (Windows' Task View), an administrator terminal and the taskbar switch (those last four drag like the apps).
Magnify wave on hover, drag icons to reorder, right-click for windows, run as administrator, file location and
dock settings (edge, icon pack, distance from the edge).

**Side panel** (top-right corner of the right-most screen): Music (what plays on this PC), Weather and Remote. Pinned it's frosted glass;
unpinned it floats.

**Media slide-in** (top-left corner): what's playing outside this PC, on your paired devices (Joint Remote) or in Home
Assistant, with the real play/pause state, cover art and timers. It and the panel's Music are controlled separately.

**Joint Remote receiver**: your phones and tablets can control this PC (now playing, media and arrow keys, volume,
typing, links). It announces itself on the local network; pairing shows a 6-digit code as a Windows notification.

## Install

Needs Windows 10/11 and [Node.js](https://nodejs.org) 20 or newer.

1. Download or clone this repository.
2. Double-click **`install.cmd`**. It installs the packages, builds the app, adds it to the Startup folder and starts it.
3. Edit `%USERPROFILE%\.config\art-desktop\house.json` (created from `config/house.example.json`) with what your
   house has. Anything you leave out simply doesn't show.
4. For Home Assistant, create `%USERPROFILE%\.config\art-desktop\ha.json`:
   ```json
   { "url": "http://homeassistant.local:8123", "token": "<a long-lived access token>", "music": "media_player.spotify" }
   ```
   Create the token in Home Assistant under your profile → Security → Long-lived access tokens. It stays on this PC.

To update: pull the latest version and run `install.cmd` again. To remove it: `uninstall.cmd` (it also brings the
taskbar back), then delete the folder.

## Settings files (`%USERPROFILE%\.config\art-desktop`)

| File | What |
| --- | --- |
| `house.json` | Your house: city, HA tile tabs, views, dashboards, torrents, ideas folder, ADB Control, VNC, voice assistant, Spanish names for your own labels (`"es"`) |
| `ha.json` | Home Assistant address and token (never commit it anywhere) |
| `remotes.json` | Devices for the Remote tab |
| `dock.json`, `stacks.json` | Dock edges, order, pins, icon pack, stacks |
| `icon-packs/<name>/` | Icon packs (PNG/SVG named after the app, or a `map.json`); Mac Dark ships with the app and is the default |

## Optional

- **Wallpaper across screens**: `wallpaper\compose-span.py` cuts a picture to your screen layout and
  `wallpaper\set-span.ps1` sets it spanned over every screen, with the lock screen set to the main screen's part.
- **Circle to Ask**: Ollama with a vision model (e.g. `ollama pull qwen3.5:4b`), and/or the Claude Code CLI signed in,
  and/or Home Assistant's Google Generative AI integration (AI Task).
- **Claude tab**: add the hooks from `electron/claude-hook.cjs` to Claude Code's settings (see the comments there).

## Development

`npm run build` builds the page into `dist/`; `node_modules\electron\dist\electron.exe .` runs it.
`--open=notch|panel|dock --tab=<name>` starts a window already open, for checking layouts.

## Credits

The dock's default icon pack, **Mac Dark** (`icon-packs/Mac Dark`), puts every app's own symbol on the same dark tile:
brand logos from [Simple Icons](https://simpleicons.org) (CC0; the logos stay their owners' trademarks) and the other
symbols from [Phosphor Icons](https://phosphoricons.com) (MIT). Details in `icon-packs/Mac Dark/LICENSE.txt`. Add your
own apps to it by dropping an SVG or PNG in the folder and naming it in its `map.json`, or make a pack of your own next
to it (right-click the dock → Icon pack).

## License

MIT
