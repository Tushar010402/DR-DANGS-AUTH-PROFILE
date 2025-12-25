/**
 * Fingerprint Scanner Service
 * Runs on localhost:5050
 */

const express = require('express');
const cors = require('cors');

let server = null;
const PORT = 5050;

// Scanner state
let scannerState = {
  connected: true,
  deviceInfo: {
    vendorId: '1162',
    productId: '0320',
    manufacturer: 'SecuGen',
    product: 'Hamster Plus'
  },
  capturing: false
};

function createApp() {
  const app = express();

  // CORS - Allow all origins for localhost service
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  app.use(express.json({ limit: '10mb' }));

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

  // Scanner status
  app.get('/scanner/status', (req, res) => {
    res.json({
      connected: scannerState.connected,
      capturing: scannerState.capturing,
      deviceInfo: scannerState.deviceInfo
    });
  });

  // Connect scanner
  app.post('/scanner/connect', (req, res) => {
    scannerState.connected = true;
    res.json({
      success: true,
      message: 'Scanner connected',
      deviceInfo: scannerState.deviceInfo
    });
  });

  // Capture fingerprint
  app.post('/scanner/capture', async (req, res) => {
    try {
      scannerState.capturing = true;

      // Simulate capture (replace with real SecuGen SDK later)
      await new Promise(resolve => setTimeout(resolve, 1500));

      scannerState.capturing = false;

      const quality = 75 + Math.floor(Math.random() * 20);
      const template = generateTemplate();
      const image = generateFingerprintImage();

      res.json({
        success: true,
        template: template,
        image: image,
        quality: quality,
        width: 260,
        height: 300,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      scannerState.capturing = false;
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  });

  return app;
}

function generateTemplate() {
  const template = Buffer.alloc(512);
  for (let i = 0; i < 512; i++) {
    template[i] = Math.floor(Math.random() * 256);
  }
  return template.toString('base64');
}

function generateFingerprintImage() {
  const width = 260;
  const height = 300;
  const buffer = Buffer.alloc(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = width / 2, cy = height / 2;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const ridge = Math.sin(dist * 0.3 + angle * 3) * 0.5 + 0.5;
      const noise = Math.random() * 0.2;
      buffer[y * width + x] = Math.floor((ridge + noise) * 128 + 64);
    }
  }

  return buffer.toString('base64');
}

function startServer() {
  return new Promise((resolve, reject) => {
    const app = createApp();

    server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`Fingerprint service running on http://localhost:${PORT}`);
      resolve();
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} already in use - service may already be running`);
        resolve(); // Don't fail, assume another instance is running
      } else {
        reject(err);
      }
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        console.log('Fingerprint service stopped');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

module.exports = { startServer, stopServer };
