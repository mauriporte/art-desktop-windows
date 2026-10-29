# Announces this PC on the local network as a Joint Remote receiver (_jointremote._tcp, like Receiver.kt's NSD and
# the Linux desktop's avahi entry), through Windows' own DNS-SD (dnsapi DnsServiceRegister, Windows 10+; nothing to install).
# The announcement lives as long as this process: receiver.cjs keeps it running and kills it on quit.
param([Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)][int]$Port, [Parameter(Mandatory)][string]$Id)
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Announce {
  public delegate void Done(uint status, IntPtr ctx, IntPtr instance);
  [StructLayout(LayoutKind.Sequential)] struct REQ { public uint Version, InterfaceIndex; public IntPtr Instance, Callback, Context, Credentials; public int Unicast; }
  [DllImport("dnsapi.dll", CharSet = CharSet.Unicode)] static extern IntPtr DnsServiceConstructInstance(string service, string host, IntPtr ip4, IntPtr ip6,
    ushort port, ushort priority, ushort weight, uint count, [MarshalAs(UnmanagedType.LPArray, ArraySubType = UnmanagedType.LPWStr)] string[] keys,
    [MarshalAs(UnmanagedType.LPArray, ArraySubType = UnmanagedType.LPWStr)] string[] values);
  [DllImport("dnsapi.dll")] static extern uint DnsServiceRegister(ref REQ req, IntPtr cancel);
  static Done keep; // the callback must outlive the call
  public static uint Start(string name, ushort port, string id) {
    keep = (s, c, i) => { Console.WriteLine("{\"registered\":" + s + "}"); Console.Out.Flush(); };
    var inst = DnsServiceConstructInstance(name + "._jointremote._tcp.local", name + ".local", IntPtr.Zero, IntPtr.Zero, port, 0, 0, 2,
      new[] { "id", "kind" }, new[] { id, "desktop" });
    var r = new REQ { Version = 1, Instance = inst, Callback = Marshal.GetFunctionPointerForDelegate(keep) };
    return DnsServiceRegister(ref r, IntPtr.Zero); // 9506 = DNS_REQUEST_PENDING: registering
  }
}
'@
$r = [Announce]::Start($Name, [uint16]$Port, $Id)
[Console]::Out.WriteLine("{`"start`":$r}"); [Console]::Out.Flush()
while ($true) { Start-Sleep -Seconds 3600 }
