param([Parameter(Mandatory = $true)][string]$Name)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ThiriWindow {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);
}
'@

$handle = [ThiriWindow]::GetForegroundWindow()
if ($handle -eq [IntPtr]::Zero) { throw 'There is no active window.' }
$window = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
$elements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$matches = @()
foreach ($element in $elements) {
    $label = $element.Current.Name
    if ($label -and $label.Equals($Name, [System.StringComparison]::OrdinalIgnoreCase)) {
        $matches += $element
    }
}
if ($matches.Count -eq 0) {
    foreach ($element in $elements) {
        $label = $element.Current.Name
        if ($label -and $label.IndexOf($Name, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            $matches += $element
        }
    }
}
if ($matches.Count -eq 0) { throw "Could not find '$Name' in the active window." }

$target = $matches[0]
$pattern = $null
if ($target.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
    $pattern.Invoke()
} else {
    $bounds = $target.Current.BoundingRectangle
    if ($bounds.IsEmpty -or $bounds.Width -le 0 -or $bounds.Height -le 0) { throw "'$Name' is not clickable." }
    $x = [int]($bounds.Left + $bounds.Width / 2)
    $y = [int]($bounds.Top + $bounds.Height / 2)
    [ThiriWindow]::SetCursorPos($x, $y) | Out-Null
    [ThiriWindow]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    [ThiriWindow]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}
