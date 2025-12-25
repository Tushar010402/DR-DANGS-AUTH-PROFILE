/**
 * Fingerprint Scanner Service
 * Runs on localhost:5050
 */

const express = require('express');
const cors = require('cors');
const os = require('os');

// Use Windows-specific module on Windows, generic on other platforms
const scanner = os.platform() === 'win32'
  ? require('./fingerprint-windows')
  : require('./fingerprint');

let server = null;
const PORT = 5050;

function createApp() {
  const app = express();

  // CORS - Allow browser access
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
    const status = scanner.getStatus();
    res.json(status);
  });

  // Connect scanner
  app.post('/scanner/connect', async (req, res) => {
    try {
      const result = await scanner.connect();
      res.json(result);
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });

  // Disconnect scanner
  app.post('/scanner/disconnect', async (req, res) => {
    try {
      const result = await scanner.disconnect();
      res.json(result);
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });

  // Capture fingerprint
  app.post('/scanner/capture', async (req, res) => {
    try {
      const options = {
        timeout: req.body.timeout || 10000,
        minQuality: req.body.minQuality || 40
      };

      const result = await scanner.capture(options);
      res.json(result);

    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  });

  // Match templates
  app.post('/scanner/match', (req, res) => {
    try {
      const { template1, template2 } = req.body;

      if (!template1 || !template2) {
        return res.status(400).json({
          success: false,
          error: 'Both template1 and template2 are required'
        });
      }

      const result = scanner.match(template1, template2);
      res.json({
        success: true,
        ...result
      });

    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  });

  return app;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const app = createApp();

    server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`Fingerprint service running on http://localhost:${PORT}`);

      // Auto-connect scanner on startup
      scanner.connect().then(result => {
        if (result.success) {
          console.log('Scanner connected:', result.deviceInfo?.productName || 'Simulated');
        }
      }).catch(() => {});

      resolve();
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} already in use - service may already be running`);
        resolve();
      } else {
        reject(err);
      }
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    scanner.disconnect().catch(() => {});

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
