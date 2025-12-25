#!/bin/bash

# Dr. Dangs Fingerprint Service Setup for macOS/Linux
# Uses port 5050 (port 5000 is used by macOS AirPlay)

SERVICE_PORT=5050

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     Dr. Dangs Fingerprint Scanner Service - Setup              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "[INFO] Service will run on port $SERVICE_PORT"
echo ""

# Check if running as root (for Linux)
if [[ "$OSTYPE" == "linux-gnu"* ]] && [ "$EUID" -ne 0 ]; then
    echo "[WARNING] On Linux, you may need to run this as root for USB access"
    echo "          Try: sudo ./setup.sh"
    echo ""
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo ""
    echo "Please install Node.js first:"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "  brew install node"
        echo "  OR download from: https://nodejs.org/"
    else
        echo "  sudo apt install nodejs npm"
        echo "  OR download from: https://nodejs.org/"
    fi
    echo ""
    exit 1
fi

echo "[OK] Node.js found: $(node -v)"
echo ""

# Install dependencies
echo "[INFO] Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install dependencies"
    exit 1
fi
echo "[OK] Dependencies installed"
echo ""

# Generate SSL certificates if OpenSSL is available
if command -v openssl &> /dev/null; then
    echo "[INFO] Generating SSL certificates..."
    node generate-certs.js
    echo ""
fi

# Create launchd plist for macOS (auto-start)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "[INFO] Setting up auto-start for macOS..."

    PLIST_PATH="$HOME/Library/LaunchAgents/com.drdangs.fingerprint.plist"
    SERVICE_PATH="$(pwd)/service.js"

    cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.drdangs.fingerprint</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which node)</string>
        <string>$SERVICE_PATH</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/drdangs-fingerprint.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/drdangs-fingerprint-error.log</string>
</dict>
</plist>
EOF

    # Load the service
    launchctl unload "$PLIST_PATH" 2>/dev/null
    launchctl load "$PLIST_PATH"

    echo "[OK] Service installed and started"
    echo ""
fi

# Create systemd service for Linux
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "[INFO] Setting up auto-start for Linux..."

    SERVICE_PATH="$(pwd)/service.js"
    NODE_PATH="$(which node)"

    sudo tee /etc/systemd/system/drdangs-fingerprint.service > /dev/null << EOF
[Unit]
Description=Dr. Dangs Fingerprint Scanner Service
After=network.target

[Service]
ExecStart=$NODE_PATH $SERVICE_PATH
Restart=always
User=$USER
Environment=NODE_ENV=production
WorkingDirectory=$(pwd)

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable drdangs-fingerprint
    sudo systemctl start drdangs-fingerprint

    echo "[OK] Service installed and started"
    echo ""
fi

# If no auto-start configured, just run the service
if [[ "$OSTYPE" != "darwin"* ]] && [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo "[INFO] Starting service manually..."
    node service.js &
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     Installation Complete!                                     ║"
echo "╠════════════════════════════════════════════════════════════════╣"
echo "║  The fingerprint service is now running.                       ║"
echo "║                                                                ║"
echo "║  You can now open your browser and go to:                      ║"
echo "║  https://auth.drdangscentrallab.com                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
