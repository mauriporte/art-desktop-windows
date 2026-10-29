# Sets a picture as the desktop wallpaper stretched over all screens ("Span"), through Windows 11's IDesktopWallpaper
# (the old SystemParametersInfo + WallpaperStyle=22 route leaves each screen showing the whole picture shrunk).
param([Parameter(Mandatory)][string]$Path)
Add-Type @'
using System; using System.Runtime.InteropServices;
[ComImport, Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IDesktopWallpaper {
  void SetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID, [MarshalAs(UnmanagedType.LPWStr)] string wallpaper);
  [return: MarshalAs(UnmanagedType.LPWStr)] string GetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID);
  [return: MarshalAs(UnmanagedType.LPWStr)] string GetMonitorDevicePathAt(uint monitorIndex);
  uint GetMonitorDevicePathCount();
  void GetMonitorRECT([MarshalAs(UnmanagedType.LPWStr)] string monitorID, out long r1, out long r2);
  void SetBackgroundColor(uint color); uint GetBackgroundColor();
  void SetPosition(int position); int GetPosition();
}
[ComImport, Guid("C2CF3110-460E-4fc1-B9D0-8A1C0C9CC4BD")] public class DesktopWallpaperClass { }
// the COM cast has to happen in C#: PowerShell can't cast the class to the interface
public static class DW {
  public static void Span(string p) { var w = (IDesktopWallpaper)new DesktopWallpaperClass(); w.SetBackgroundColor(0x050505); w.SetPosition(5 /* DWPOS_SPAN */); w.SetWallpaper(null, p); }
}
'@
[DW]::Span((Resolve-Path $Path).Path)

# the lock screen shows only on the primary screen, so it gets that screen's cut of the same picture
Add-Type -AssemblyName System.Drawing, System.Windows.Forms, System.Runtime.WindowsRuntime
$v = [Windows.Forms.SystemInformation]::VirtualScreen; $p = [Windows.Forms.Screen]::PrimaryScreen.Bounds
$src = [Drawing.Image]::FromFile((Resolve-Path $Path).Path)
$cut = $src.Clone([Drawing.Rectangle]::new($p.X - $v.X, $p.Y - $v.Y, $p.Width, $p.Height), $src.PixelFormat)
$lock = Join-Path (Split-Path (Resolve-Path $Path).Path) 'art-lockscreen.png'
$cut.Save($lock, [Drawing.Imaging.ImageFormat]::Png); $cut.Dispose(); $src.Dispose()
$asTask = [WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
$asAction = [WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.System.UserProfile.LockScreen, Windows.System.UserProfile, ContentType = WindowsRuntime]
$t = $asTask.MakeGenericMethod([Windows.Storage.StorageFile]).Invoke($null, @([Windows.Storage.StorageFile]::GetFileFromPathAsync($lock))); $t.Wait()
$asAction.Invoke($null, @([Windows.System.UserProfile.LockScreen]::SetImageFileAsync($t.Result))).Wait()
