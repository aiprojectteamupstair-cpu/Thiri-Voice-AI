param([Parameter(Mandatory = $true)][string]$Target)

$ErrorActionPreference = 'Stop'
Start-Process -FilePath $Target
