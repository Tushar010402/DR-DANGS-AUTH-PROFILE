/**
 * CT-AUTH-PORTAL - Industrial-Grade Fingerprint Authentication Server
 *
 * Features:
 * - Real-time WebSocket communication
 * - Direct USB fingerprint capture
 * - Secure template storage
 * - Production-ready error handling
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { WebSocketServer } = require('ws');
const http = require('http');
const db = require('./database');
const scanner = require('./fingerprint');

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server for both Express and WebSocket
const server = http.createServer(app);

// WebSocket server for real-time updates
const wss = new WebSocketServer({ server, path: '/ws' });

// Connected WebSocket clients
const wsClients = new Set();

// ========== Middleware ==========

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// ========== Photo Upload Configuration ==========

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
  }
});

// ========== WebSocket Handling ==========

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  wsClients.add(ws);

  // Send current scanner status
  ws.send(JSON.stringify({
    type: 'status',
    data: scanner.getStatus()
  }));

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.action) {
        case 'capture':
          ws.send(JSON.stringify({ type: 'captureStart' }));
          try {
            const result = await scanner.capture({ timeout: data.timeout || 10000 });
            ws.send(JSON.stringify({ type: 'captureComplete', data: result }));
          } catch (error) {
            ws.send(JSON.stringify({ type: 'captureError', error: error.message }));
          }
          break;

        case 'status':
          ws.send(JSON.stringify({ type: 'status', data: scanner.getStatus() }));
          break;

        case 'connect':
          const connectResult = await scanner.connect();
          ws.send(JSON.stringify({ type: 'connectionResult', data: connectResult }));
          break;
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', error: error.message }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    wsClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    wsClients.delete(ws);
  });
});

// Broadcast to all WebSocket clients
function broadcast(type, data) {
  const message = JSON.stringify({ type, data });
  wsClients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

// ========== Scanner Event Handlers ==========

scanner.on('connected', (data) => {
  console.log('Scanner connected:', data);
  broadcast('scannerConnected', data);
});

scanner.on('disconnected', () => {
  console.log('Scanner disconnected');
  broadcast('scannerDisconnected', {});
});

scanner.on('captureStart', () => {
  broadcast('captureStart', {});
});

scanner.on('fingerDetected', () => {
  broadcast('fingerDetected', {});
});

scanner.on('captureComplete', (data) => {
  broadcast('captureComplete', { quality: data.quality });
});

scanner.on('captureError', (data) => {
  broadcast('captureError', data);
});

// ========== API Routes ==========

// Health check
app.get('/api/health', (req, res) => {
  console.log('[API] GET /api/health - Request received');
  const scannerStatus = scanner.getStatus();
  console.log('[API] Health check - scanner status:', JSON.stringify(scannerStatus, null, 2));
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    scanner: scannerStatus
  });
});

// Get scanner status
app.get('/api/scanner/status', async (req, res) => {
  console.log('='.repeat(60));
  console.log('[API] GET /api/scanner/status - Request received');
  console.log('[API] Timestamp:', new Date().toISOString());

  try {
    console.log('[API] Calling scanner.getStatus()...');
    let status = scanner.getStatus();
    console.log('[API] Initial status:', JSON.stringify(status, null, 2));

    // Try to connect if not connected
    if (!status.connected) {
      console.log('[API] Scanner not connected, attempting to connect...');
      const connectResult = await scanner.connect();
      console.log('[API] Connect result:', JSON.stringify(connectResult, null, 2));

      const updatedStatus = scanner.getStatus();
      console.log('[API] Updated status after connect:', JSON.stringify(updatedStatus, null, 2));

      status = {
        ...updatedStatus,
        ...connectResult
      };
      console.log('[API] Merged status:', JSON.stringify(status, null, 2));
    } else {
      console.log('[API] Scanner already connected');
    }

    console.log('[API] Sending response:', JSON.stringify(status, null, 2));
    console.log('='.repeat(60));
    res.json(status);
  } catch (error) {
    console.error('[API] ERROR in /api/scanner/status:', error);
    console.error('[API] Error stack:', error.stack);
    console.log('='.repeat(60));
    res.status(500).json({ error: error.message });
  }
});

// Connect scanner
app.post('/api/scanner/connect', async (req, res) => {
  try {
    const result = await scanner.connect();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Capture fingerprint
app.post('/api/scanner/capture', async (req, res) => {
  try {
    const options = {
      timeout: req.body.timeout || 10000,
      minQuality: req.body.minQuality || 40
    };

    const result = await scanner.capture(options);

    res.json({
      success: true,
      template: result.template,
      image: result.image,
      quality: result.quality,
      width: result.width,
      height: result.height,
      timestamp: result.timestamp
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Register new user
app.post('/api/users/register', upload.single('photo'), async (req, res) => {
  try {
    const { name, email, phone, department, employeeId, fingerprintTemplate, fingerprintQuality } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    if (!fingerprintTemplate) {
      return res.status(400).json({ success: false, error: 'Fingerprint template is required' });
    }

    // Check for duplicate fingerprint
    const existingUsers = db.prepare('SELECT * FROM users WHERE fingerprint_template IS NOT NULL').all();
    const inputTemplate = Buffer.from(fingerprintTemplate, 'base64');

    for (const user of existingUsers) {
      const matchResult = scanner.match(inputTemplate, user.fingerprint_template);
      if (matchResult.match && matchResult.score >= 70) {
        return res.status(400).json({
          success: false,
          error: `This fingerprint is already registered to ${user.name}`,
          existingUser: user.name
        });
      }
    }

    // Create user
    const userId = uuidv4();
    const photoPath = req.file ? `/uploads/${req.file.filename}` : null;
    const templateBuffer = Buffer.from(fingerprintTemplate, 'base64');

    const stmt = db.prepare(`
      INSERT INTO users (id, name, email, phone, department, employee_id, photo_path, fingerprint_template, fingerprint_quality)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      userId,
      name.trim(),
      email?.trim() || null,
      phone?.trim() || null,
      department?.trim() || null,
      employeeId?.trim() || null,
      photoPath,
      templateBuffer,
      parseInt(fingerprintQuality) || 0
    );

    res.json({
      success: true,
      message: 'User registered successfully',
      userId: userId,
      user: {
        id: userId,
        name: name.trim(),
        email: email?.trim() || null,
        department: department?.trim() || null,
        employeeId: employeeId?.trim() || null
      }
    });

    broadcast('userRegistered', { userId, name: name.trim() });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify fingerprint and get user
app.post('/api/users/verify', async (req, res) => {
  try {
    const { fingerprintTemplate } = req.body;

    if (!fingerprintTemplate) {
      return res.status(400).json({ success: false, error: 'Fingerprint template is required' });
    }

    const inputTemplate = Buffer.from(fingerprintTemplate, 'base64');
    const users = db.prepare('SELECT * FROM users WHERE fingerprint_template IS NOT NULL').all();

    let bestMatch = null;
    let bestScore = 0;

    for (const user of users) {
      const result = scanner.match(inputTemplate, user.fingerprint_template);
      if (result.score > bestScore) {
        bestScore = result.score;
        bestMatch = user;
      }
    }

    if (bestMatch && bestScore >= 60) {
      // Update last access time
      db.prepare('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(bestMatch.id);

      res.json({
        success: true,
        verified: true,
        matchScore: bestScore,
        user: {
          id: bestMatch.id,
          name: bestMatch.name,
          email: bestMatch.email,
          phone: bestMatch.phone,
          department: bestMatch.department,
          employeeId: bestMatch.employee_id,
          photoPath: bestMatch.photo_path,
          createdAt: bestMatch.created_at,
          lastAccess: new Date().toISOString()
        }
      });

      broadcast('userVerified', { userId: bestMatch.id, name: bestMatch.name, score: bestScore });
    } else {
      res.json({
        success: true,
        verified: false,
        matchScore: bestScore,
        message: 'No matching fingerprint found'
      });

      broadcast('verificationFailed', { score: bestScore });
    }
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all users
app.get('/api/users', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let query = `
      SELECT id, name, email, phone, department, employee_id, photo_path, fingerprint_quality, created_at, updated_at
      FROM users
    `;

    let countQuery = 'SELECT COUNT(*) as total FROM users';
    const params = [];

    if (search) {
      query += ` WHERE name LIKE ? OR email LIKE ? OR employee_id LIKE ? OR department LIKE ?`;
      countQuery += ` WHERE name LIKE ? OR email LIKE ? OR employee_id LIKE ? OR department LIKE ?`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;

    const users = db.prepare(query).all(...params, limit, offset);
    const { total } = db.prepare(countQuery).get(...params);

    res.json({
      success: true,
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user by ID
app.get('/api/users/:id', (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, name, email, phone, department, employee_id, photo_path, fingerprint_quality, created_at, updated_at
      FROM users WHERE id = ?
    `).get(req.params.id);

    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(404).json({ success: false, error: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update user
app.put('/api/users/:id', upload.single('photo'), (req, res) => {
  try {
    const { name, email, phone, department, employeeId } = req.body;
    const userId = req.params.id;

    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const photoPath = req.file ? `/uploads/${req.file.filename}` : existing.photo_path;

    db.prepare(`
      UPDATE users
      SET name = ?, email = ?, phone = ?, department = ?, employee_id = ?, photo_path = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name?.trim() || existing.name,
      email?.trim() || existing.email,
      phone?.trim() || existing.phone,
      department?.trim() || existing.department,
      employeeId?.trim() || existing.employee_id,
      photoPath,
      userId
    );

    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete user
app.delete('/api/users/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);

    if (result.changes > 0) {
      res.json({ success: true, message: 'User deleted successfully' });
      broadcast('userDeleted', { userId: req.params.id });
    } else {
      res.status(404).json({ success: false, error: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Statistics
app.get('/api/stats', (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const todayRegistrations = db.prepare(`
      SELECT COUNT(*) as count FROM users
      WHERE date(created_at) = date('now')
    `).get().count;
    const avgQuality = db.prepare(`
      SELECT AVG(fingerprint_quality) as avg FROM users
      WHERE fingerprint_quality > 0
    `).get().avg || 0;

    res.json({
      success: true,
      stats: {
        totalUsers,
        todayRegistrations,
        averageQuality: Math.round(avgQuality),
        scannerStatus: scanner.getStatus()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== Error Handling ==========

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// ========== Server Startup ==========

async function startServer() {
  console.log('='.repeat(60));
  console.log('[SERVER] Starting CT-AUTH-PORTAL server...');
  console.log('[SERVER] Timestamp:', new Date().toISOString());
  console.log('[SERVER] Node version:', process.version);
  console.log('[SERVER] Platform:', process.platform);
  console.log('='.repeat(60));

  // Initialize scanner
  console.log('[SERVER] Initializing fingerprint scanner...');
  const scannerResult = await scanner.connect();
  console.log('[SERVER] Scanner connection result:', JSON.stringify(scannerResult, null, 2));
  console.log('[SERVER] Scanner status after init:', JSON.stringify(scanner.getStatus(), null, 2));

  // Start server
  server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║          CT-AUTH-PORTAL - Fingerprint Authentication             ║
╠══════════════════════════════════════════════════════════════════╣
║  HTTP Server:    http://localhost:${PORT}                            ║
║  WebSocket:      ws://localhost:${PORT}/ws                           ║
║  Scanner:        ${scannerResult.success ? 'Connected ✓' : 'Not connected ✗'}                              ║
║  Mode:           ${scannerResult.success ? scannerResult.deviceInfo?.productName || 'USB Direct' : 'Waiting for device'}                   ║
╚══════════════════════════════════════════════════════════════════╝
    `);
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await scanner.disconnect();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await scanner.disconnect();
  server.close();
  process.exit(0);
});

startServer();
