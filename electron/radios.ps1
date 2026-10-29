# Prints the Wi-Fi/Bluetooth radios as JSON. With -Kind/-State, switches that kind first
# (Kind: WiFi, Bluetooth or All; All = airplane mode).
param([string]$Kind, [string]$State)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await($op, [Type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[void][Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime]

$radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
if ($Kind) {
  [void](Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus]))
  foreach ($r in $radios) {
    if ($Kind -eq 'All' -or $r.Kind.ToString() -eq $Kind) {
      [void](Await ($r.SetStateAsync([Windows.Devices.Radios.RadioState]::$State)) ([Windows.Devices.Radios.RadioAccessStatus]))
    }
  }
}
$m = netsh wlan show interfaces | Select-String '^\s+SSID\s+:\s+(.+)$' | Select-Object -First 1
$ssid = if ($m) { $m.Matches[0].Groups[1].Value } else { $null }
# wired networks (LAN): physical adapters that aren't Wi-Fi, with state, speed and IPv4
$lan = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.PhysicalMediaType -notmatch '802\.11|Wireless' -and $_.InterfaceDescription -notmatch 'Wi-?Fi|Wireless|Bluetooth|Loopback|Npcap|Virtual|VPN|TAP-' } | ForEach-Object {
  $ip = (Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
  $net = (Get-NetConnectionProfile -InterfaceIndex $_.ifIndex -ErrorAction SilentlyContinue | Select-Object -First 1).Name  # the network's name in Windows
  @{ name = $_.Name; up = ($_.Status -eq 'Up'); speed = "$($_.LinkSpeed)"; ip = $ip; network = $net }
})
# the connected Wi-Fi adapter's IPv4 and link speed (same details as the LAN tiles)
$wa = Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' -and ($_.PhysicalMediaType -match '802\.11|Wireless' -or $_.InterfaceDescription -match 'Wi-?Fi|Wireless|802\.11') } | Select-Object -First 1
$wifi = if ($wa) { @{ name = $wa.Name; ip = (Get-NetIPAddress -InterfaceIndex $wa.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress; speed = "$($wa.LinkSpeed)" } } else { $null }
# which adapter carries internet traffic now (lowest metric wins)
$route = (Find-NetRoute -RemoteIPAddress 1.1.1.1 -ErrorAction SilentlyContinue | Select-Object -First 1).InterfaceAlias
$airplane =(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\RadioManagement\SystemRadioState' -ErrorAction SilentlyContinue).'(default)' -eq 1
@{ route = $route; wifi = $wifi; lan = $lan; airplane = $airplane; radios = @($radios | ForEach-Object { @{ kind = $_.Kind.ToString(); name = $_.Name; on = ($_.State.ToString() -eq 'On') } }); ssid = $ssid } | ConvertTo-Json -Compress -Depth 3
