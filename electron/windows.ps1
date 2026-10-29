# Long-running helper for the dock: reads one command per line on stdin, answers one JSON line on stdout.
#   list                  -> [{hwnd, pid, exe, cls, title, min, fg}] app windows (visible, not owned, not tool or cloaked)
#   restore|min|close|front <hwnd>
# Kept running so the dock can poll the window list every couple of seconds without starting PowerShell each time.
$ErrorActionPreference = 'Stop'
Add-Type @'
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class Wins {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder s, ref int n);

  static string Exe(uint pid) {
    IntPtr p = OpenProcess(0x1000, false, pid); if (p == IntPtr.Zero) return "";
    try { var s = new StringBuilder(1024); int n = s.Capacity; return QueryFullProcessImageName(p, 0, s, ref n) ? s.ToString() : ""; }
    finally { CloseHandle(p); }
  }
  static string J(string s) { return "\"" + (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ") + "\""; }

  public static string List() {
    var fg = GetForegroundWindow(); var items = new List<string>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) || GetWindow(h, 4 /* GW_OWNER */) != IntPtr.Zero) return true;
      if ((GetWindowLong(h, -20 /* GWL_EXSTYLE */) & 0x80 /* WS_EX_TOOLWINDOW */) != 0) return true;
      int cloaked; if (DwmGetWindowAttribute(h, 14 /* DWMWA_CLOAKED */, out cloaked, 4) == 0 && cloaked != 0) return true;
      var t = new StringBuilder(512); GetWindowText(h, t, 512); if (t.Length == 0) return true;
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      uint pid; GetWindowThreadProcessId(h, out pid);
      items.Add("{\"hwnd\":" + h.ToInt64() + ",\"pid\":" + pid + ",\"exe\":" + J(Exe(pid)) + ",\"cls\":" + J(c.ToString()) +
        ",\"title\":" + J(t.ToString()) + ",\"min\":" + (IsIconic(h) ? "true" : "false") + ",\"fg\":" + (h == fg ? "true" : "false") + "}");
      return true;
    }, IntPtr.Zero);
    return "[" + string.Join(",", items) + "]";
  }
  // the visible windows' frames, front to back (the screen grabber's click-a-window): DWM's bounds, without the shadow
  [DllImport("dwmapi.dll", EntryPoint = "DwmGetWindowAttribute")] static extern int DwmRect(IntPtr h, int attr, out RECT r, int size);
  public struct RECT { public int L, T, R, B; }
  public static string Rects() {
    var items = new List<string>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) || IsIconic(h)) return true;
      int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      var t = new StringBuilder(512); GetWindowText(h, t, 512); if (t.Length == 0) return true;
      RECT r; if (DwmRect(h, 9 /* DWMWA_EXTENDED_FRAME_BOUNDS */, out r, 16) != 0 || r.R - r.L < 40 || r.B - r.T < 40) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      items.Add("{\"pid\":" + pid + ",\"x\":" + r.L + ",\"y\":" + r.T + ",\"w\":" + (r.R - r.L) + ",\"h\":" + (r.B - r.T) + ",\"title\":" + J(t.ToString()) + "}");
      return true;
    }, IntPtr.Zero);
    return "[" + string.Join(",", items) + "]";
  }
  // bring to front: a tap of ALT lifts Windows' foreground lock for a process that isn't in front itself
  public static void Front(IntPtr h) { if (IsIconic(h)) ShowWindow(h, 9); keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero); SetForegroundWindow(h); }
  public static void Min(IntPtr h) { ShowWindow(h, 6); }
  public static void Close(IntPtr h) { PostMessage(h, 0x10 /* WM_CLOSE */, IntPtr.Zero, IntPtr.Zero); }
  // behind every other window, without activating it (desktop widgets)
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  public static void Bottom(IntPtr h) { SetWindowPos(h, new IntPtr(1) /* HWND_BOTTOM */, 0, 0, 0, 0, 0x0013 /* NOSIZE|NOMOVE|NOACTIVATE */); }
  // Win + a letter (opens Windows' own flyouts: P = Project, K = Cast, A = quick settings)
  // types text into whatever has focus, as Unicode key events (any language, no layout issues)
  [StructLayout(LayoutKind.Sequential)] struct KI { public ushort vk, scan; public uint flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct INP { public uint type; public KI ki; public long pad; }
  [DllImport("user32.dll")] static extern uint SendInput(uint n, INP[] i, int size);
  public static void Type(string s) {
    var l = new List<INP>();
    foreach (char c in s) foreach (uint up in new uint[] { 0, 2 }) { var i = new INP(); i.type = 1; i.ki.scan = c; i.ki.flags = 4 | up; l.Add(i); }
    if (l.Count > 0) SendInput((uint)l.Count, l.ToArray(), Marshal.SizeOf(typeof(INP)));
  }
  public static void Key(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 2, UIntPtr.Zero); }
  public static void WinKey(byte vk) { keybd_event(0x5B, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 2, UIntPtr.Zero); keybd_event(0x5B, 0, 2, UIntPtr.Zero); }

  // power mode overlay (Settings → Power mode): best power efficiency = "energy saver" here
  [DllImport("powrprof.dll")] static extern uint PowerGetActualOverlayScheme(out Guid g);
  [DllImport("powrprof.dll")] static extern uint PowerSetActiveOverlayScheme(Guid g);
  public static readonly Guid Efficiency = new Guid("961cc777-2547-4f9d-8174-7d86181b8a7a");
  public static string PowerMode() { Guid g; PowerGetActualOverlayScheme(out g); return g == Efficiency ? "saver" : g == Guid.Empty ? "balanced" : "performance"; }
  public static void SetSaver(bool on) { PowerSetActiveOverlayScheme(on ? Efficiency : Guid.Empty); }
}

// default output device volume (Core Audio)
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int NotImpl1(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice dev); }
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr p); int UnregisterControlChangeNotify(IntPtr p); int GetChannelCount(out int c);
  int SetMasterVolumeLevel(float db, Guid ctx); int SetMasterVolumeLevelScalar(float v, Guid ctx);
  int GetMasterVolumeLevel(out float db); int GetMasterVolumeLevelScalar(out float v);
  int SetChannelVolumeLevel(uint ch, float db, Guid ctx); int SetChannelVolumeLevelScalar(uint ch, float v, Guid ctx);
  int GetChannelVolumeLevel(uint ch, out float db); int GetChannelVolumeLevelScalar(uint ch, out float v);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid ctx); int GetMute(out bool mute);
}
public static class Audio {
  static IAudioEndpointVolume Ep() {
    var en = (IMMDeviceEnumerator)new MMDeviceEnumerator(); IMMDevice d; en.GetDefaultAudioEndpoint(0, 1, out d);
    var iid = typeof(IAudioEndpointVolume).GUID; object o; d.Activate(ref iid, 23, IntPtr.Zero, out o); return (IAudioEndpointVolume)o;
  }
  public static string Get() { var e = Ep(); float v; bool m; e.GetMasterVolumeLevelScalar(out v); e.GetMute(out m);
    return "{\"vol\":" + v.ToString(System.Globalization.CultureInfo.InvariantCulture) + ",\"mute\":" + (m ? "true" : "false") + "}"; }
  public static void Set(float v) { Ep().SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(1, v)), Guid.Empty); }
  public static void Mute(bool m) { Ep().SetMute(m, Guid.Empty); }
}
'@

# What plays on this PC, from Windows' own media controls (the Spotify app or its web player in a browser): exact song,
# position and cover, without waiting for Home Assistant. Prefers what is playing, Spotify first.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$script:mediaMgr = $null
function MediaSession {
  if (-not $script:mediaMgr) { $script:mediaMgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]) }
  $all = @($script:mediaMgr.GetSessions())
  $isSp = { $_.SourceAppUserModelId -match 'spotify|pjibgcllelbfgfagdaldikeohf' }
  $play = @($all | Where-Object { $_.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing' })
  # something playing (Spotify first), else a paused Spotify, else whatever Windows calls current
  @(($play | Where-Object $isSp), $play, ($all | Where-Object $isSp), $script:mediaMgr.GetCurrentSession()) | ForEach-Object { $_ } | Where-Object { $_ } | Select-Object -First 1
}
function MediaInfo {
  $s = MediaSession
  if (-not $s) { return '{"none":true}' }
  $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $tl = $s.GetTimelineProperties()
  $title = $p.Title; $artist = $p.Artist
  # the Spotify web player puts "Song <bullet> Artists" in the title and leaves the artist empty
  if (-not $artist -and $title -match "^(.*?) $([char]0x2022) (.*)$") { $title = $Matches[1]; $artist = $Matches[2] }
  @{ app = $s.SourceAppUserModelId; raw = $p.Title; playing = ($s.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing'); title = $title; artist = $artist;
     album = $p.AlbumTitle; position = $tl.Position.TotalSeconds; duration = $tl.EndTime.TotalSeconds;
     updatedAt = $tl.LastUpdatedTime.ToUnixTimeMilliseconds(); hasArt = [bool]$p.Thumbnail } | ConvertTo-Json -Compress
}
function MediaArt {
  $s = MediaSession
  if (-not $s) { return '{"none":true}' }
  $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  if (-not $p.Thumbnail) { return '{"none":true}' }
  $st = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  # PowerShell can't see the WinRT stream's members directly; call them through their interfaces
  $size = [Windows.Storage.Streams.IRandomAccessStream].GetProperty('Size').GetValue($st)
  $in = [Windows.Storage.Streams.IRandomAccessStream].GetMethod('GetInputStreamAt').Invoke($st, @([uint64]0))
  $r = New-Object Windows.Storage.Streams.DataReader($in)
  $n = Await ($r.LoadAsync([uint32]$size)) ([uint32])
  $buf = New-Object byte[] $n; $r.ReadBytes($buf)
  $type = 'image/png'
  @{ title = $p.Title; art = "data:$type;base64," + [Convert]::ToBase64String($buf) } | ConvertTo-Json -Compress
}
function MediaControl($what) {
  $s = MediaSession
  if (-not $s) { return '{"none":true}' }
  $op = switch ($what) { 'play' { $s.TryTogglePlayPauseAsync() } 'next' { $s.TrySkipNextAsync() } 'prev' { $s.TrySkipPreviousAsync() } }
  [void](Await $op ([bool])); '{"ok":true}'
}

# Night light lives in a CloudStore blob: byte 18 is 0x15 when on (and two more bytes, 10 00, at 23), 0x13 when off
$NL = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\CloudStore\Store\DefaultAccount\Current\default$windows.data.bluelightreduction.bluelightreductionstate\windows.data.bluelightreduction.bluelightreductionstate'
function NightLight { $d = (Get-ItemProperty $NL -ErrorAction SilentlyContinue).Data; if (-not $d) { return $null }; return $d[18] -eq 0x15 }
function SetNightLight([bool]$on) {
  $d = [System.Collections.Generic.List[byte]](Get-ItemProperty $NL).Data
  if ($on -eq ($d[18] -eq 0x15)) { return }
  if ($on) { $d[18] = 0x15; $d.InsertRange(23, [byte[]](0x10, 0x00)) } else { $d[18] = 0x13; $d.RemoveRange(23, 2) }
  # bump the change stamp (bytes 10-14) so Windows applies it
  for ($i = 10; $i -lt 15; $i++) { if ($d[$i] -ne 0xff) { $d[$i]++; break } }
  Set-ItemProperty $NL -Name Data -Value ([byte[]]$d.ToArray())
}
[Console]::OutputEncoding = [Text.Encoding]::UTF8
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $cmd, $arg = $line.Trim() -split '\s+', 2
  try {
    switch ($cmd) {
      'list' { [Console]::Out.WriteLine([Wins]::List()) }
      'rects' { [Console]::Out.WriteLine([Wins]::Rects()) }
      { $_ -in 'restore', 'front' } { [Wins]::Front([IntPtr][long]$arg); [Console]::Out.WriteLine('{"ok":true}') }
      'min' { [Wins]::Min([IntPtr][long]$arg); [Console]::Out.WriteLine('{"ok":true}') }
      'close' { [Wins]::Close([IntPtr][long]$arg); [Console]::Out.WriteLine('{"ok":true}') }
      'media' { [Console]::Out.WriteLine((MediaInfo)) }
      'mediaart' { [Console]::Out.WriteLine((MediaArt)) }
      'mediactl' { [Console]::Out.WriteLine((MediaControl $arg)) }
      'bottom' { [Wins]::Bottom([IntPtr][long]$arg); [Console]::Out.WriteLine('{"ok":true}') }
      # quick settings for the notch
      'quick' { $a = [Audio]::Get() | ConvertFrom-Json
        [Console]::Out.WriteLine((@{ vol = $a.vol; mute = $a.mute; saver = ([Wins]::PowerMode() -eq 'saver'); night = (NightLight) } | ConvertTo-Json -Compress)) }
      'vol' { [Audio]::Set([float]::Parse($arg, [Globalization.CultureInfo]::InvariantCulture)); [Console]::Out.WriteLine('{"ok":true}') }
      'mute' { [Audio]::Mute($arg -eq '1'); [Console]::Out.WriteLine('{"ok":true}') }
      'saver' { [Wins]::SetSaver($arg -eq '1'); [Console]::Out.WriteLine('{"ok":true}') }
      'night' { SetNightLight ($arg -eq '1'); [Console]::Out.WriteLine('{"ok":true}') }
      'winkey' { [Wins]::WinKey([byte][char]$arg.ToUpper()); [Console]::Out.WriteLine('{"ok":true}') }
      # Win+B focuses the tray's "show hidden icons" arrow; Enter then opens its flyout
      # Joint Remote receiver (receiver.cjs): a virtual key, or a Win+key, or text (base64 UTF-8)
      'key' { [Wins]::Key([byte][int]$arg); [Console]::Out.WriteLine('{"ok":true}') }
      'winvk' { [Wins]::WinKey([byte][int]$arg); [Console]::Out.WriteLine('{"ok":true}') }
      'type' { [Wins]::Type([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($arg))); [Console]::Out.WriteLine('{"ok":true}') }
      'tray' { [Wins]::WinKey(0x42); Start-Sleep -Milliseconds 250; [Wins]::Key(0x0D); [Console]::Out.WriteLine('{"ok":true}') }
      default { [Console]::Out.WriteLine('{"error":"unknown command"}') }
    }
  } catch { [Console]::Out.WriteLine('{"error":' + (ConvertTo-Json "$_") + '}') }
  [Console]::Out.Flush()
}
