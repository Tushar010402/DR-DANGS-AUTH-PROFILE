#!/bin/bash
# Dr. Dangs Fingerprint Service - macOS Launcher
# Double-click this file to start the service

cd "$(dirname "$0")"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    osascript -e 'display alert "Node.js Required" message "Please install Node.js from https://nodejs.org first." as critical'
    open "https://nodejs.org"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies (first time only)..."
    npm install --production
fi

# Start the service
echo "Starting Fingerprint Service..."
node service.js
