Add-Type -AssemblyName System.Drawing

$sourceImagePath = "C:\Users\baslo\.gemini\antigravity\brain\46b10d85-915e-452d-ad09-5db4d8232c1d\media__1777229590477.png"
$projectPath = "c:\Users\baslo\Desktop\My Property Tracking\copy-of-3marh-002"

Write-Host "Loading source image from: $sourceImagePath"
$img = [System.Drawing.Image]::FromFile($sourceImagePath)

# Function to resize and save image
function Save-ResizedImage {
    param (
        [int]$width,
        [int]$height,
        [string]$destinationPath
    )
    $resized = $img.GetThumbnailImage($width, $height, $null, [IntPtr]::Zero)
    $directory = [System.IO.Path]::GetDirectoryName($destinationPath)
    if (-not (Test-Path -Path $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    $resized.Save($destinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $resized.Dispose()
    Write-Host "Saved: $destinationPath"
}

# Web Icons
Save-ResizedImage 192 192 "$projectPath\public\icon-192x192.png"
Save-ResizedImage 512 512 "$projectPath\public\icon-512x512.png"

# Android Icons (mipmap directories)
# mdpi = 48x48
Save-ResizedImage 48 48 "$projectPath\android\app\src\main\res\mipmap-mdpi\ic_launcher.png"
Save-ResizedImage 48 48 "$projectPath\android\app\src\main\res\mipmap-mdpi\ic_launcher_round.png"

# hdpi = 72x72
Save-ResizedImage 72 72 "$projectPath\android\app\src\main\res\mipmap-hdpi\ic_launcher.png"
Save-ResizedImage 72 72 "$projectPath\android\app\src\main\res\mipmap-hdpi\ic_launcher_round.png"

# xhdpi = 96x96
Save-ResizedImage 96 96 "$projectPath\android\app\src\main\res\mipmap-xhdpi\ic_launcher.png"
Save-ResizedImage 96 96 "$projectPath\android\app\src\main\res\mipmap-xhdpi\ic_launcher_round.png"

# xxhdpi = 144x144
Save-ResizedImage 144 144 "$projectPath\android\app\src\main\res\mipmap-xxhdpi\ic_launcher.png"
Save-ResizedImage 144 144 "$projectPath\android\app\src\main\res\mipmap-xxhdpi\ic_launcher_round.png"

# xxxhdpi = 192x192
Save-ResizedImage 192 192 "$projectPath\android\app\src\main\res\mipmap-xxxhdpi\ic_launcher.png"
Save-ResizedImage 192 192 "$projectPath\android\app\src\main\res\mipmap-xxxhdpi\ic_launcher_round.png"

# Splash Screens (drawable directories)
# Default
Save-ResizedImage 480 800 "$projectPath\android\app\src\main\res\drawable\splash.png"

# Port-mdpi
Save-ResizedImage 320 480 "$projectPath\android\app\src\main\res\drawable-port-mdpi\splash.png"

# Port-hdpi
Save-ResizedImage 480 800 "$projectPath\android\app\src\main\res\drawable-port-hdpi\splash.png"

# Port-xhdpi
Save-ResizedImage 720 1280 "$projectPath\android\app\src\main\res\drawable-port-xhdpi\splash.png"

# Port-xxhdpi
Save-ResizedImage 960 1600 "$projectPath\android\app\src\main\res\drawable-port-xxhdpi\splash.png"

# Port-xxxhdpi
Save-ResizedImage 1280 1920 "$projectPath\android\app\src\main\res\drawable-port-xxxhdpi\splash.png"

$img.Dispose()
Write-Host "All icons and splash screens updated successfully."
