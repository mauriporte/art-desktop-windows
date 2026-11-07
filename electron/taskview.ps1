# Mission Control for Windows: opens Task View (Win+Tab), started by main.cjs for as long as the app runs.
#  - wheel click on the desktop (the wallpaper or its icons): that click is swallowed, everywhere else it works as usual
#  - pushing the cursor into the bottom-right corner of the rightmost screen (fires once, re-arms after leaving it)
Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing @'
using System;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class TaskViewHook {
  delegate IntPtr Proc(int code, IntPtr wParam, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
  [StructLayout(LayoutKind.Sequential)] struct MSLL { public POINT pt; public uint data, flags, time; public IntPtr extra; }
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Proc fn, IntPtr mod, uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int code, IntPtr w, IntPtr l);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

  const int WM_MOUSEMOVE = 0x200, WM_MBUTTONDOWN = 0x207, WM_MBUTTONUP = 0x208;
  const int CORNER = 3, REARM = 60; // px: how close to the corner fires it, how far out re-arms it
  static Proc keep; static bool swallowUp, armed = true;

  public static void Run() {
    keep = Hook;
    using (var p = Process.GetCurrentProcess()) using (var m = p.MainModule)
      SetWindowsHookEx(14, keep, GetModuleHandle(m.ModuleName), 0); // WH_MOUSE_LL
    Application.Run();
  }

  static bool OnDesktop(POINT pt) {
    var sb = new StringBuilder(64);
    GetClassName(GetAncestor(WindowFromPoint(pt), 2), sb, 64); // GA_ROOT
    var c = sb.ToString();
    return c == "Progman" || c == "WorkerW";
  }

  static void TaskView() { // Win+Tab
    keybd_event(0x5B, 0, 0, UIntPtr.Zero); keybd_event(0x09, 0, 0, UIntPtr.Zero);
    keybd_event(0x09, 0, 2, UIntPtr.Zero); keybd_event(0x5B, 0, 2, UIntPtr.Zero);
  }

  static IntPtr Hook(int code, IntPtr w, IntPtr l) {
    if (code >= 0) {
      var m = (MSLL)Marshal.PtrToStructure(l, typeof(MSLL));
      int msg = (int)w;
      if (msg == WM_MBUTTONDOWN && OnDesktop(m.pt)) { swallowUp = true; TaskView(); return (IntPtr)1; }
      if (msg == WM_MBUTTONUP && swallowUp) { swallowUp = false; return (IntPtr)1; }
      if (msg == WM_MOUSEMOVE) {
        var s = Screen.AllScreens[0];
        foreach (var x in Screen.AllScreens) if (x.Bounds.Right > s.Bounds.Right) s = x; // the rightmost screen
        int dx = s.Bounds.Right - 1 - m.pt.x, dy = s.Bounds.Bottom - 1 - m.pt.y;
        bool inside = m.pt.x <= s.Bounds.Right - 1 && m.pt.y <= s.Bounds.Bottom - 1 && m.pt.x >= s.Bounds.Left;
        if (armed && inside && dx < CORNER && dy < CORNER) { armed = false; TaskView(); }
        else if (!armed && (dx > REARM || dy > REARM)) armed = true;
      }
    }
    return CallNextHookEx(IntPtr.Zero, code, w, l);
  }
}
'@
[TaskViewHook]::Run()
