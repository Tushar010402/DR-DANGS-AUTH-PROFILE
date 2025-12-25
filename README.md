# CT-AUTH-PORTAL - Fingerprint Authentication Backend

SecuGen HAMSTER_PRO fingerprint authentication backend for Dr. Dang's Lab.

## Features

- SecuGen HAMSTER_PRO USB fingerprint scanner support
- Real-time fingerprint capture via WebSocket
- REST API for scanner operations
- SQLite database for fingerprint templates
- CORS enabled for frontend integration

## Requirements

### For Linux VPS (Production)
- Node.js 18+
- npm or yarn
- libusb-1.0-0-dev (for USB access)
- SecuGen FDx SDK (for real fingerprint capture)

### Installation on Ubuntu/Debian VPS

```bash
# Install system dependencies
sudo apt update
sudo apt install -y nodejs npm libusb-1.0-0-dev

# Clone repository
git clone https://github.com/Tushar010402/DR-DANGS-AUTH-PROFILE.git
cd DR-DANGS-AUTH-PROFILE

# Install Node dependencies
npm install

# Setup USB permissions for SecuGen
sudo usermod -a -G plugdev $USER
sudo bash -c 'cat > /etc/udev/rules.d/99-secugen.rules << EOF
SUBSYSTEM=="usb", ATTR{idVendor}=="1162", MODE="0666", GROUP="plugdev"
EOF'
sudo udevadm control --reload-rules
sudo udevadm trigger

# Start server
npm start
```

### For Windows (with SecuGen SDK)
1. Download SecuGen FDx SDK from [SecuGen SDK Page](https://secugen.com/products/sdk/)
2. Install the SDK
3. Run `npm install && npm start`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/scanner/status` | Scanner connection status |
| POST | `/api/scanner/connect` | Connect to scanner |
| POST | `/api/scanner/disconnect` | Disconnect scanner |
| POST | `/api/scanner/capture` | Capture fingerprint |
| POST | `/api/fingerprint/enroll` | Enroll fingerprint |
| POST | `/api/fingerprint/verify` | Verify fingerprint |
| GET | `/api/fingerprint/list` | List enrolled fingerprints |

## WebSocket Events

Connect to `ws://localhost:3001/ws` for real-time updates:

- `scanner:status` - Scanner connection status changes
- `capture:start` - Capture started
- `capture:progress` - Capture progress updates
- `capture:complete` - Capture completed
- `capture:error` - Capture error

## Environment Variables

Create `.env` file:

```env
PORT=3001
NODE_ENV=production
```

## Running with PM2 (Production)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start src/server.js --name ct-auth-portal

# Auto-restart on reboot
pm2 startup
pm2 save

# View logs
pm2 logs ct-auth-portal
```

## Platform Support

| Platform | Scanner Detection | Real Capture |
|----------|------------------|--------------|
| Linux | Yes | Yes (with SDK) |
| Windows | Yes | Yes (with SDK) |
| macOS | Yes | No (SDK not available) |

## License

Proprietary - Dr. Dang's Lab
