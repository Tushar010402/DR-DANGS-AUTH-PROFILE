# Building Dr. Dangs Fingerprint Service App

Complete guide for building a signed and notarized macOS app.

## Your Apple Developer Info

| Item | Value |
|------|-------|
| **Developer Name** | Tushar Agrawal |
| **Team ID** | CS33T79968 |
| **Certificate** | Apple Development: Tushar Agrawal (82236W3MQY) |
| **UID** | 6GAKUBHSHU |

## Prerequisites

1. **Node.js 18+** - https://nodejs.org
2. **Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```
3. **Apple Developer Account** (Already configured)

## Quick Start

### Step 1: Create App Icon

Create a 1024x1024 PNG icon and save it as `assets/icon.png`, then run:

```bash
cd electron-app/assets
./generate-icons.sh
```

Or create your icon manually:
- `icon.png` (1024x1024) - Source icon
- `icon.icns` - macOS app icon (use iconutil)
- `tray-icon.png` (16x16) - Menu bar icon
- `icon.ico` (256x256) - Windows icon

### Step 2: Install Dependencies

```bash
cd electron-app
npm install
```

### Step 3: Test Locally

```bash
npm start
```

The app should open and show the dashboard. Check:
- Menu bar icon appears
- Service runs on port 5050
- http://localhost:5050/health returns OK

### Step 4: Create App-Specific Password (for notarization)

1. Go to https://appleid.apple.com
2. Sign in with your Apple ID
3. Go to **Sign-In and Security** → **App-Specific Passwords**
4. Click **Generate an app-specific password**
5. Name it "Electron Notarization"
6. Save the password (format: xxxx-xxxx-xxxx-xxxx)

### Step 5: Set Environment Variables

```bash
export APPLE_ID="your-apple-id@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="CS33T79968"
```

Or add to your `~/.zshrc` or `~/.bash_profile`:

```bash
echo 'export APPLE_ID="your-apple-id@email.com"' >> ~/.zshrc
echo 'export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"' >> ~/.zshrc
echo 'export APPLE_TEAM_ID="CS33T79968"' >> ~/.zshrc
source ~/.zshrc
```

### Step 6: Build Signed App

```bash
# Build signed and notarized DMG
npm run build:mac
```

This will:
1. Build the app for both Intel and Apple Silicon (universal)
2. Sign with your certificate
3. Submit to Apple for notarization
4. Staple the notarization ticket
5. Create a DMG installer

### Step 7: Find Your Built App

Built files will be in the `dist/` folder:
- `Dr Dangs Fingerprint Service-1.0.0-universal.dmg` - DMG installer
- `Dr Dangs Fingerprint Service-1.0.0-universal-mac.zip` - ZIP archive

## Build Commands

| Command | Description |
|---------|-------------|
| `npm start` | Run in development mode |
| `npm run build:mac` | Build signed macOS app |
| `npm run build:mac:unsigned` | Build unsigned (for testing) |
| `npm run build:win` | Build Windows installer |
| `npm run build:all` | Build for all platforms |

## Troubleshooting

### "No signing identity found"

Your certificate might not be in Keychain. Check:
```bash
security find-identity -v -p codesigning
```

You should see:
```
1) C60E1DD8246B74B70786190515509AC98187FF84 "Apple Development: Tushar Agrawal (82236W3MQY)"
```

### "Notarization failed"

1. Check your App-Specific Password is correct
2. Ensure APPLE_ID email matches your developer account
3. Check entitlements.mac.plist has correct permissions

### "Unable to notarize - hardened runtime not enabled"

Make sure `hardenedRuntime: true` is set in package.json.

### USB Permission Issues

For USB access on macOS, users may need to grant permission:
1. Open System Preferences → Security & Privacy → Privacy
2. Look for "USB" or "Accessibility"
3. Allow the app

## Distributing the App

### Upload to Your Server

```bash
scp dist/*.dmg user@your-server:/var/www/downloads/
```

### Update Download Page

Update your website to link to the new DMG file.

## Certificate Notes

### Development vs Distribution

Your current certificate is **Apple Development** which is for testing on your devices.

For public distribution outside the App Store, you need a **Developer ID Application** certificate:

1. Go to https://developer.apple.com/account
2. Certificates, IDs & Profiles
3. Create new certificate → Developer ID Application
4. Download and install in Keychain

Then update package.json:
```json
"identity": "Developer ID Application: Tushar Agrawal (CS33T79968)"
```

### Getting Developer ID Certificate

1. In Xcode: Preferences → Accounts → Manage Certificates
2. Click + → Developer ID Application
3. Or via developer.apple.com portal

## File Structure

```
electron-app/
├── main.js              # Electron main process
├── preload.js           # Preload script
├── server.js            # HTTP server
├── fingerprint.js       # Scanner module
├── index.html           # Dashboard UI
├── package.json         # App config with signing
├── entitlements.mac.plist
├── BUILD.md             # This file
└── assets/
    ├── icon.png         # Source icon (1024x1024)
    ├── icon.icns        # macOS icon
    ├── icon.ico         # Windows icon
    ├── tray-icon.png    # Menu bar icon
    └── generate-icons.sh
```

## Version Updates

To release a new version:

1. Update version in `package.json`:
   ```json
   "version": "1.1.0"
   ```

2. Rebuild:
   ```bash
   npm run build:mac
   ```

3. Upload new DMG to server

## Support

For issues with the Electron app:
- Check console logs in Terminal
- Use `npm start` to run in dev mode with logs
- Check http://localhost:5050/health for service status
