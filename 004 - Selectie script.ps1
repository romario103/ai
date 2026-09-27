# Bepaal automatisch de map waarin dit script zelf staat
$doelmap = $PSScriptRoot
$githubUrl = "https://github.com/romario103/ai/upload/main"

$itemsToSelect = @(
    "helpers"
    "html"
    "scripts"
    "000 - ===== Source control ====="
    "002 - Open Selectie en GitHub.cmd"
    "004 - Selectie script.ps1"
    "009 - ====== Perchance ======"
    "010 - Download enkele.cmd"
    "020 - Download batch.cmd"
    "030 - Download server.cmd"
    "100 - ====================="
    "prompts.txt"
)

# C#-code laden om de Verkenner te kunnen verplaatsen en de schermgrootte te bepalen
$wmCode = @"
using System;
using System.Runtime.InteropServices;
public class WindowManager {
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
}
"@
Add-Type -TypeDefinition $wmCode

# Schermresolutie ophalen
$screenWidth = [WindowManager]::GetSystemMetrics(0)
$screenHeight = [WindowManager]::GetSystemMetrics(1)
$halfWidth = [int]($screenWidth / 2)
$usableHeight = $screenHeight - 40 # Ruimte vrijhouden voor de Windows taakbalk

# 1. Open de GitHub-pagina in de standaardbrowser (opent automatisch links/centraal)
Start-Process $githubUrl

# 2. Open de map in Windows Verkenner
explorer.exe $doelmap
Start-Sleep -Milliseconds 600 # Wacht tot Verkenner is geladen

# 3. Koppel aan het Verkenner-venster, verplaats deze naar RECHTS, en maak de selectie
$shell = New-Object -ComObject Shell.Application
$window = $shell.Windows() | Where-Object { $_.Document.Folder.Self.Path -eq $doelmap } | Select-Object -First 1

if ($window) {
    # Verkenner gegarandeerd aan de RECHTERKANT plaatsen (vanaf de helft tot het einde van het scherm)
    $explorerHwnd = [IntPtr]$window.HWND
    [WindowManager]::MoveWindow($explorerHwnd, $halfWidth, 0, $halfWidth, $usableHeight, $true)

    # Wis de huidige selectie in de map
    $window.Document.SelectItem($window.Document.Folder.Self, 4)
    
    # Loop door de lijst en selecteer elk bestand/map
    foreach ($itemRaw in $itemsToSelect) {
        $itemName = $itemRaw.Trim().TrimEnd('\')
        $item = $window.Document.Folder.ParseName($itemName)
        if ($item) { 
            $window.Document.SelectItem($item, 1) 
        }
    }
}
