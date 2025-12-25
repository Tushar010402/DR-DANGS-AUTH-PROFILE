/**
 * Dr. Dangs Fingerprint Scanner Service
 *
 * A lightweight local service that bridges the browser with USB fingerprint scanners.
 * Double-click to run - no setup required!
 *
 * Port: 5050 (5000 is used by macOS AirPlay)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 5050;

// Scanner state
let scannerState = {
  connected: false,
  deviceInfo: null,
  capturing: false
};

// CORS - Allow requests from the web app
app.use(cors({
  origin: '*', // Allow all origins for localhost service
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ========== Scanner Simulation ==========
// Note: For real SecuGen integration, replace these functions with SDK calls

function connectScanner() {
  // Simulate scanner detection
  // In production, use SecuGen SDK to detect real device
  scannerState.connected = true;
  scannerState.deviceInfo = {
    vendorId: '1162',
    productId: '0320',
    manufacturer: 'SecuGen',
    product: 'Hamster Plus (Demo Mode)'
  };

  return {
    success: true,
    message: 'Scanner connected (Demo Mode)',
    deviceInfo: scannerState.deviceInfo
  };
}

async function captureFingerprint(options = {}) {
  const timeout = options.timeout || 10000;
  const minQuality = options.minQuality || 40;

  scannerState.capturing = true;

  return new Promise((resolve) => {
    // Simulate capture delay
    setTimeout(() => {
      scannerState.capturing = false;

      // Generate demo fingerprint
      const quality = 75 + Math.floor(Math.random() * 20);
      const template = generateDemoTemplate();
      const image = generateDemoImage();

      resolve({
        success: true,
        template: template,
        image: image,
        quality: quality,
        width: 260,
        height: 300,
        timestamp: new Date().toISOString()
      });
    }, 1500);
  });
}

function generateDemoTemplate() {
  const template = Buffer.alloc(512);
  for (let i = 0; i < 512; i++) {
    template[i] = Math.floor(Math.random() * 256);
  }
  return template.toString('base64');
}

function generateDemoImage() {
  // Generate a simple fingerprint-like pattern
  const width = 260;
  const height = 300;
  const pixels = width * height;
  const buffer = Buffer.alloc(pixels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerX = width / 2;
      const centerY = height / 2;
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      // Create ridge pattern
      const ridge = Math.sin(dist * 0.3 + angle * 3) * 0.5 + 0.5;
      const noise = Math.random() * 0.2;
      const value = Math.floor((ridge + noise) * 128 + 64);

      buffer[y * width + x] = Math.min(255, Math.max(0, value));
    }
  }

  return buffer.toString('base64');
}

// ========== API Routes ==========

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Dr. Dangs Fingerprint Service',
    version: '1.0.0',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Get scanner status
app.get('/scanner/status', (req, res) => {
  if (!scannerState.connected) {
    connectScanner();
  }

  res.json({
    connected: scannerState.connected,
    capturing: scannerState.capturing,
    deviceInfo: scannerState.deviceInfo
  });
});

// Connect scanner
app.post('/scanner/connect', (req, res) => {
  const result = connectScanner();
  res.json(result);
});

// Capture fingerprint
app.post('/scanner/capture', async (req, res) => {
  try {
    const options = {
      timeout: req.body.timeout || 10000,
      minQuality: req.body.minQuality || 40
    };

    const result = await captureFingerprint(options);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

// ========== Start Server ==========

// Try to start on PORT, fallback if busy
const server = app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Dr. Dangs Fingerprint Scanner Service                    ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Status:    Running                                          ║`);
  console.log(`║  URL:       http://localhost:${PORT}                             ║`);
  console.log('║  Scanner:   Ready (Demo Mode)                                ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Keep this window open while using the fingerprint portal.   ║');
  console.log('║  Open: https://auth.drdangscentrallab.com                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Auto-connect scanner on startup
  connectScanner();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is busy. Service may already be running.`);
    console.log('Open: https://auth.drdangscentrallab.com');
  } else {
    console.error('Server error:', err.message);
  }
});

// Keep the window open on Windows
if (process.platform === 'win32') {
  process.on('SIGINT', () => {
    console.log('\\nPress Ctrl+C again to exit...');
  });
}
