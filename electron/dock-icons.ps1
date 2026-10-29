# Saves each shortcut's icon as a 128 px PNG, the way Explorer draws it (IShellItemImageFactory, icon only, no
# shortcut arrow). Works for shortcuts with no file target too (File Explorer, Control Panel...).
param([Parameter(Mandatory)][string]$OutDir, [Parameter(Mandatory, ValueFromRemainingArguments)][string[]]$Links)
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System; using System.Drawing; using System.Runtime.InteropServices;
public static class ShellIcon {
  [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemImageFactory { void GetImage(SIZE size, int flags, out IntPtr phbm); }
  [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx, cy; public SIZE(int x, int y) { cx = x; cy = y; } }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, ref Guid riid, out IShellItemImageFactory ppv);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] struct BITMAP { public int bmType, bmWidth, bmHeight, bmWidthBytes; public ushort bmPlanes, bmBitsPixel; public IntPtr bmBits; }
  [DllImport("gdi32.dll")] static extern int GetObject(IntPtr h, int size, out BITMAP bm);
  public static void Save(string path, string png, int px) {
    Guid iid = typeof(IShellItemImageFactory).GUID; IShellItemImageFactory f;
    SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out f);
    IntPtr hbm; f.GetImage(new SIZE(px, px), 0x4 /* SIIGBF_ICONONLY */, out hbm);
    try {
      // the shell hands back a 32-bit premultiplied DIB section: wrap its pixels directly to keep the alpha channel
      BITMAP bm; GetObject(hbm, Marshal.SizeOf(typeof(BITMAP)), out bm);
      if (bm.bmBitsPixel != 32 || bm.bmBits == IntPtr.Zero) { using (var b = Image.FromHbitmap(hbm)) b.Save(png, System.Drawing.Imaging.ImageFormat.Png); return; }
      using (var view = new Bitmap(bm.bmWidth, bm.bmHeight, bm.bmWidthBytes, System.Drawing.Imaging.PixelFormat.Format32bppPArgb, bm.bmBits))
      using (var copy = new Bitmap(view)) copy.Save(png, System.Drawing.Imaging.ImageFormat.Png);
    } finally { DeleteObject(hbm); }
  }
}
'@
New-Item -ItemType Directory -Force $OutDir | Out-Null
foreach ($l in $Links) {
  try { [ShellIcon]::Save($l, (Join-Path $OutDir ([IO.Path]::GetFileNameWithoutExtension($l) + '.png')), 128) }
  catch { Write-Error "$l : $_" -ErrorAction Continue }
}
