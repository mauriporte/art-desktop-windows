# Hides or shows the Windows taskbar on every screen (Shell_TrayWnd + Shell_SecondaryTrayWnd), or reports it.
# Reversible: "Show" brings it back, and Explorer shows it again whenever it restarts.
param([ValidateSet('Hide', 'Show', 'Status')][string]$Action = 'Status')
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public static class Taskbar {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  public static List<IntPtr> All() {
    var l = new List<IntPtr>();
    foreach (var cls in new[] { "Shell_TrayWnd", "Shell_SecondaryTrayWnd" }) {
      IntPtr h = IntPtr.Zero;
      while ((h = FindWindowEx(IntPtr.Zero, h, cls, null)) != IntPtr.Zero) l.Add(h);
    }
    return l;
  }
  public static void Set(bool show) { foreach (var h in All()) ShowWindow(h, show ? 5 : 0); }
  public static bool Visible() { foreach (var h in All()) if (IsWindowVisible(h)) return true; return false; }
}
'@
if ($Action -eq 'Hide') { [Taskbar]::Set($false) } elseif ($Action -eq 'Show') { [Taskbar]::Set($true) }
@{ visible = [Taskbar]::Visible() } | ConvertTo-Json -Compress
