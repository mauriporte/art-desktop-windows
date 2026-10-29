# Moves internet traffic between the LAN and a Wi-Fi adapter (e.g. a VPN network) without disabling either:
# Windows uses the adapter with the lowest interface metric. Needs administrator rights (the notch starts it through
# the Windows admin prompt every time; nothing is installed).
#   -Via vpn : Wi-Fi metric 10, LAN 50          -Via lan : back to before (Wi-Fi 500, LAN automatic)
param([Parameter(Mandatory)][ValidateSet('vpn', 'lan')][string]$Via,
      [Parameter(Mandatory)][string]$Wifi, [Parameter(Mandatory)][string]$Lan)
$ErrorActionPreference = 'Stop'
if ($Via -eq 'vpn') {
  Set-NetIPInterface -InterfaceAlias $Wifi -AddressFamily IPv4 -AutomaticMetric Disabled -InterfaceMetric 10
  Set-NetIPInterface -InterfaceAlias $Lan -AddressFamily IPv4 -AutomaticMetric Disabled -InterfaceMetric 50
} else {
  Set-NetIPInterface -InterfaceAlias $Wifi -AddressFamily IPv4 -AutomaticMetric Disabled -InterfaceMetric 500
  Set-NetIPInterface -InterfaceAlias $Lan -AddressFamily IPv4 -AutomaticMetric Enabled
}
