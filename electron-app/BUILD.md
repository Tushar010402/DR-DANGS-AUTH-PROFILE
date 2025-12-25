# Building Dr. Dangs Fingerprint Service App

## Prerequisites

1. **Node.js 18+** - https://nodejs.org
2. **Apple Developer Account** - For signing and notarization
3. **Xcode Command Line Tools** - `xcode-select --install`

## Setup

### 1. Install Dependencies

```bash
cd electron-app
npm install
```

### 2. Create App Icons

Create icons in the `assets` folder:
- `icon.png` - 1024x1024 PNG for the app
- `icon.icns` - macOS icon (use `iconutil` or online converter)
- `icon.ico` - Windows icon
- `tray-icon.png` - 16x16 or 32x32 for menu bar

### 3. Configure Signing (macOS)

#### Set Environment Variables

```bash
# Your Apple Developer Team ID (find in developer.apple.com)
export APPLE_TEAM_ID="YOUR_TEAM_ID"

# App-specific password from appleid.apple.com
export APPLE_ID="your@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
```

#### Update package.json

Replace `YOUR_TEAM_ID` in package.json with your actual Team ID.

### 4. Build the App

#### For macOS (signed & notarized):

```bash
# Development build (not signed)
npm run start

# Production build (signed & notarized)
npm run build:mac
```

#### For Windows:

```bash
npm run build:win
```

#### For both:

```bash
npm run build:all
```

### 5. Output

Built apps will be in the `dist` folder:
- `Dr Dangs Fingerprint Service-1.0.0.dmg` (macOS)
- `Dr Dangs Fingerprint Service Setup 1.0.0.exe` (Windows)

## Signing Process (macOS)

electron-builder will automatically:
1. Sign with your Developer ID certificate
2. Submit to Apple for notarization
3. Staple the notarization ticket

Make sure you have:
- Developer ID Application certificate in Keychain
- Developer ID Installer certificate (for pkg)

## Troubleshooting

### "Developer cannot be verified"
- App is not signed. Run the build with proper certificates.

### Notarization fails
- Check Apple ID and app-specific password
- Ensure hardened runtime is enabled
- Check entitlements file

### Port 5050 already in use
- Another instance may be running
- Check Activity Monitor and quit any existing instances

## Distribution

Upload the DMG/EXE to your server:
```bash
scp dist/*.dmg user@server:/var/www/DR-DANGS-AUTH-PROFILE/public/downloads/
```

Then update the web app download links to point to the new files.
