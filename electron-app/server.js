/**
 * Fingerprint Scanner Service
 * Runs on localhost:5050
 *
 * Architecture: SDK-FREE
 * - This local service captures raw fingerprint images via USB
 * - Sends raw images to your backend server for processing
 * - Your server (with SecuGen SDK) handles template generation & matching
 */

const express = require('express');
const cors = require('cors');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Use Windows-specific module on Windows, generic on other platforms
let scanner;
if (os.platform() === 'win32') {
  scanner = require('./fingerprint-windows');
} else {
  // Try to load the full USB module, fall back to simple version
  try {
    scanner = require('./fingerprint-macos');
  } catch (e) {
    scanner = require('./fingerprint');
  }
}

let server = null;
const PORT = 5050;

// Configuration file path
const configPath = path.join(__dirname, 'config.json');

// Default configuration
const defaultConfig = {
  backendServerUrl: 'https://auth.drdangscentrallab.com'
};

/**
 * Load configuration from file
 */
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      const loaded = JSON.parse(data);
      console.log('[CONFIG] Loaded from file:', configPath);
      return { ...defaultConfig, ...loaded };
    }
  } catch (e) {
    console.log('[CONFIG] Failed to load config:', e.message);
  }
  console.log('[CONFIG] Using default configuration');
  return { ...defaultConfig };
}

/**
 * Save configuration to file
 */
function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('[CONFIG] Saved to file:', configPath);
    return true;
  } catch (e) {
    console.log('[CONFIG] Failed to save config:', e.message);
    return false;
  }
}

// Initialize configuration
let config = loadConfig();
let backendServerUrl = config.backendServerUrl;

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
      version: '2.0.0',
      port: PORT,
      architecture: 'SDK-FREE (raw capture)',
      backendServer: backendServerUrl,
      platform: os.platform(),
      timestamp: new Date().toISOString()
    });
  });

  // Scanner status
  app.get('/scanner/status', (req, res) => {
    const status = scanner.getStatus();
    res.json({
      ...status,
      backendServerUrl: backendServerUrl
    });
  });

  // Configure backend server URL (with persistence)
  app.post('/config/server', (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Server URL is required'
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    // Update in-memory value
    backendServerUrl = url;
    config.backendServerUrl = url;

    if (scanner.setServerUrl) {
      scanner.setServerUrl(url);
    }

    // Persist to file
    const saved = saveConfig(config);

    res.json({
      success: true,
      backendServerUrl: backendServerUrl,
      persisted: saved,
      message: saved ? 'Settings saved permanently' : 'Settings saved for this session only'
    });
  });

  // Get current configuration
  app.get('/config', (req, res) => {
    res.json({
      backendServerUrl: backendServerUrl,
      port: PORT,
      platform: os.platform()
    });
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

  // Capture fingerprint (returns raw image)
  app.post('/scanner/capture', async (req, res) => {
    try {
      const options = {
        timeout: req.body.timeout || 10000,
        minQuality: req.body.minQuality || 40
      };

      const result = await scanner.capture(options);

      // If caller wants to forward to backend server for processing
      if (req.body.processOnServer && result.success) {
        try {
          const serverResult = await forwardToBackend('/api/scanner/process', {
            image: result.image,
            width: result.width,
            height: result.height,
            quality: result.quality
          });

          res.json({
            ...result,
            serverProcessing: serverResult
          });
        } catch (serverErr) {
          res.json({
            ...result,
            serverProcessing: {
              success: false,
              error: serverErr.message
            }
          });
        }
      } else {
        res.json(result);
      }

    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  });

  // Capture and immediately process on server (convenience endpoint)
  app.post('/scanner/capture-and-process', async (req, res) => {
    try {
      const options = {
        timeout: req.body.timeout || 10000,
        minQuality: req.body.minQuality || 40
      };

      // Capture raw image
      const captureResult = await scanner.capture(options);

      if (!captureResult.success) {
        return res.status(400).json(captureResult);
      }

      // Forward to backend server for template generation
      const serverResult = await forwardToBackend('/api/scanner/process', {
        image: captureResult.image,
        width: captureResult.width,
        height: captureResult.height,
        quality: captureResult.quality,
        patientId: req.body.patientId,
        fingerIndex: req.body.fingerIndex
      });

      res.json({
        success: true,
        capture: captureResult,
        processing: serverResult
      });

    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  });

  // Match templates - forwards to backend server
  app.post('/scanner/match', async (req, res) => {
    try {
      const { template1, template2 } = req.body;

      if (!template1 || !template2) {
        return res.status(400).json({
          success: false,
          error: 'Both template1 and template2 are required'
        });
      }

      // Forward to backend server for matching (server has SDK)
      const result = await forwardToBackend('/api/scanner/match', {
        template1,
        template2
      });

      res.json(result);

    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  });

  // Verify fingerprint against stored template - forwards to backend
  app.post('/scanner/verify', async (req, res) => {
    try {
      const { patientId, fingerIndex } = req.body;

      if (!patientId) {
        return res.status(400).json({
          success: false,
          error: 'Patient ID is required'
        });
      }

      // Capture fingerprint
      const captureResult = await scanner.capture({
        timeout: req.body.timeout || 10000,
        minQuality: req.body.minQuality || 40
      });

      if (!captureResult.success) {
        return res.status(400).json(captureResult);
      }

      // Send to backend for verification
      const verifyResult = await forwardToBackend('/api/scanner/verify', {
        patientId,
        fingerIndex: fingerIndex || 0,
        image: captureResult.image,
        width: captureResult.width,
        height: captureResult.height
      });

      res.json({
        success: true,
        capture: captureResult,
        verification: verifyResult
      });

    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  });

  // Enroll fingerprint - forwards to backend
  app.post('/scanner/enroll', async (req, res) => {
    try {
      const { patientId, fingerIndex } = req.body;

      if (!patientId) {
        return res.status(400).json({
          success: false,
          error: 'Patient ID is required'
        });
      }

      // Capture fingerprint
      const captureResult = await scanner.capture({
        timeout: req.body.timeout || 10000,
        minQuality: req.body.minQuality || 50 // Higher quality for enrollment
      });

      if (!captureResult.success) {
        return res.status(400).json(captureResult);
      }

      // Send to backend for enrollment (template generation + storage)
      const enrollResult = await forwardToBackend('/api/scanner/enroll', {
        patientId,
        fingerIndex: fingerIndex || 0,
        image: captureResult.image,
        width: captureResult.width,
        height: captureResult.height,
        quality: captureResult.quality
      });

      res.json({
        success: true,
        capture: captureResult,
        enrollment: enrollResult
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

/**
 * Forward request to backend server
 */
async function forwardToBackend(endpoint, data) {
  const url = `${backendServerUrl}${endpoint}`;

  try {
    // Use dynamic import for node-fetch or native fetch
    let fetchFn;
    if (typeof fetch !== 'undefined') {
      fetchFn = fetch;
    } else {
      // For Node.js < 18
      const http = require('http');
      const https = require('https');

      return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;

        const postData = JSON.stringify(data);
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
          path: urlObj.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const req = client.request(options, (res) => {
          let body = '';
          res.on('data', (chunk) => body += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              resolve({ success: false, error: 'Invalid response from server' });
            }
          });
        });

        req.on('error', (e) => {
          reject(new Error(`Backend server error: ${e.message}`));
        });

        req.write(postData);
        req.end();
      });
    }

    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    return await response.json();

  } catch (error) {
    throw new Error(`Failed to communicate with backend: ${error.message}`);
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    const app = createApp();

    server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`Fingerprint service running on http://localhost:${PORT}`);
      console.log(`Backend server: ${backendServerUrl}`);
      console.log(`Platform: ${os.platform()}`);

      // Auto-connect scanner on startup
      scanner.connect().then(result => {
        if (result.success) {
          console.log('Scanner connected:', result.deviceInfo?.productName || 'Unknown');
        }
      }).catch((err) => {
        console.log('Scanner auto-connect failed:', err.message);
      });

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
