#!/bin/bash
# Generate app icons for Dr. Dangs Fingerprint Service
# Run this script after creating icon.png (1024x1024)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for source icon
if [ ! -f "icon.png" ]; then
    echo "Error: icon.png not found!"
    echo "Please create a 1024x1024 PNG icon first."
    exit 1
fi

echo "Generating icons from icon.png..."

# Create iconset directory for macOS
ICONSET="icon.iconset"
mkdir -p "$ICONSET"

# Generate all required sizes for macOS
sips -z 16 16     icon.png --out "$ICONSET/icon_16x16.png"
sips -z 32 32     icon.png --out "$ICONSET/icon_16x16@2x.png"
sips -z 32 32     icon.png --out "$ICONSET/icon_32x32.png"
sips -z 64 64     icon.png --out "$ICONSET/icon_32x32@2x.png"
sips -z 128 128   icon.png --out "$ICONSET/icon_128x128.png"
sips -z 256 256   icon.png --out "$ICONSET/icon_128x128@2x.png"
sips -z 256 256   icon.png --out "$ICONSET/icon_256x256.png"
sips -z 512 512   icon.png --out "$ICONSET/icon_256x256@2x.png"
sips -z 512 512   icon.png --out "$ICONSET/icon_512x512.png"
sips -z 1024 1024 icon.png --out "$ICONSET/icon_512x512@2x.png"

# Create .icns file
iconutil -c icns "$ICONSET"
echo "Created icon.icns"

# Clean up iconset
rm -rf "$ICONSET"

# Create tray icon (16x16)
sips -z 16 16 icon.png --out tray-icon.png
echo "Created tray-icon.png"

# Create tray icon for retina (32x32)
sips -z 32 32 icon.png --out tray-icon@2x.png
echo "Created tray-icon@2x.png"

echo ""
echo "✅ Icons generated successfully!"
echo ""
echo "Files created:"
echo "  - icon.icns (macOS app icon)"
echo "  - tray-icon.png (menu bar icon)"
echo "  - tray-icon@2x.png (retina menu bar icon)"
echo ""
echo "For Windows, you'll need to convert icon.png to icon.ico"
echo "Use: https://convertio.co/png-ico/ or similar online tool"
