/**
 * SecuGen Fingerprint Scanner Module for Windows
 * Uses SecuGen FDx SDK Pro via FFI
 *
 * Requirements:
 * - SecuGen FDx SDK Pro installed (Windows only)
 * - sgfplib.dll in system32 or app directory
 */

const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Check if we're on Windows
const isWindows = os.platform() === 'win32';

// SecuGen constants
const CYCACHE_CONSTANTS = {
  // Device IDs
  SG_DEV_FDU02: 0x03,
  SG_DEV_FDU03: 0x04,
  SG_DEV_FDU04: 0x05,
  SG_DEV_FDU05: 0x06,
  SG_DEV_FDU06: 0x07,
  SG_DEV_FDU07: 0x08,
  SG_DEV_FDU07A: 0x09,
  SG_DEV_HAMSTER_PRO: 0x0A,
  SG_DEV_HAMSTER_PRO_20: 0x0B,
  SG_DEV_AUTO: 0xFF,

  // Error codes
  CYCACHE_ERROR_NONE: 0,
  CYCACHE_ERROR_CREATION_FAILED: 1,
  CYCACHE_ERROR_FUNCTION_FAILED: 2,
  CYCACHE_ERROR_INVALID_PARAM: 3,
  CYCACHE_ERROR_NOT_USED: 4,
  CYCACHE_ERROR_DLLLOAD_FAILED: 5,
  CYCACHE_ERROR_DLLLOAD_FAILED_DRV: 6,
  CYCACHE_ERROR_DLLLOAD_FAILED_ALGO: 7,
  CYCACHE_ERROR_SYSLOAD_FAILED: 8,

  // Image dimensions for Hamster Pro 20
  IMAGE_WIDTH: 260,
  IMAGE_HEIGHT: 300,
  IMAGE_DPI: 500
};

class FingerprintScannerWindows {
  constructor() {
    this.isConnected = false;
    this.isCapturing = false;
    this.deviceInfo = null;
    this.sgfplib = null;
    this.hDevice = null;
    this.imageWidth = CYCACHE_CONSTANTS.IMAGE_WIDTH;
    this.imageHeight = CYCACHE_CONSTANTS.IMAGE_HEIGHT;

    // Try to load SecuGen SDK
    this.loadSDK();
  }

  /**
   * Load SecuGen SDK DLL
   */
  loadSDK() {
    if (!isWindows) {
      console.log('[FINGERPRINT] Not on Windows - using simulation mode');
      return;
    }

    try {
      // Try to load using ffi-napi
      const ffi = require('ffi-napi');
      const ref = require('ref-napi');

      // Define types
      const DWORD = ref.types.uint32;
      const LPVOID = ref.refType(ref.types.void);
      const LPBYTE = ref.refType(ref.types.byte);
      const LPDWORD = ref.refType(DWORD);

      // Load the SecuGen DLL
      const dllPaths = [
        'sgfplib.dll',
        'C:\\Program Files\\SecuGen\\FDx SDK Pro for Windows\\bin\\x64\\sgfplib.dll',
        'C:\\Program Files (x86)\\SecuGen\\FDx SDK Pro for Windows\\bin\\win32\\sgfplib.dll',
        path.join(__dirname, 'sdk', 'sgfplib.dll')
      ];

      for (const dllPath of dllPaths) {
        try {
          this.sgfplib = ffi.Library(dllPath, {
            'CYCACHE_Create': [DWORD, [LPVOID]],
            'CYCACHE_Close': [DWORD, [LPVOID]],
            'CYCACHE_Init': [DWORD, [LPVOID, DWORD]],
            'CYCACHE_OpenDevice': [DWORD, [LPVOID, DWORD]],
            'CYCACHE_CloseDevice': [DWORD, [LPVOID]],
            'CYCACHE_GetDeviceInfo': [DWORD, [LPVOID, LPVOID]],
            'CYCACHE_GetImage': [DWORD, [LPVOID, LPBYTE]],
            'CYCACHE_GetImageEx': [DWORD, [LPVOID, LPBYTE, DWORD, LPVOID, DWORD]],
            'CYCACHE_GetImageQuality': [DWORD, [LPVOID, DWORD, DWORD, LPBYTE, LPDWORD]],
            'CYCACHE_CreateTemplate': [DWORD, [LPVOID, LPVOID, LPBYTE, LPBYTE]],
            'CYCACHE_MatchTemplate': [DWORD, [LPVOID, LPBYTE, LPBYTE, DWORD, LPDWORD]],
            'CYCACHE_SetLedOn': [DWORD, [LPVOID, 'bool']],
            'CYCACHE_SetBrightness': [DWORD, [LPVOID, DWORD]]
          });
          console.log('[FINGERPRINT] SecuGen SDK loaded from:', dllPath);
          break;
        } catch (e) {
          continue;
        }
      }

      if (!this.sgfplib) {
        console.log('[FINGERPRINT] SecuGen SDK not found - using simulation mode');
      }
    } catch (e) {
      console.log('[FINGERPRINT] Failed to load SecuGen SDK:', e.message);
      console.log('[FINGERPRINT] Using simulation mode');
    }
  }

  /**
   * Get scanner status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      capturing: this.isCapturing,
      deviceInfo: this.deviceInfo,
      usbAvailable: true,
      sdkAvailable: !!this.sgfplib,
      platform: os.platform()
    };
  }

  /**
   * Connect to scanner
   */
  async connect() {
    console.log('[FINGERPRINT] Connecting...');

    if (this.isConnected) {
      return {
        success: true,
        alreadyConnected: true,
        deviceInfo: this.deviceInfo
      };
    }

    // If no SDK available or not on Windows, use simulation
    if (!this.sgfplib || !isWindows) {
      this.isConnected = true;
      this.deviceInfo = {
        vendorId: '0x1162',
        productId: '0x2200',
        productName: 'SecuGen Hamster Pro 20 (Simulated)',
        manufacturer: 'SecuGen',
        simulated: true
      };

      return {
        success: true,
        simulated: true,
        deviceInfo: this.deviceInfo
      };
    }

    try {
      const ref = require('ref-napi');

      // Create device handle
      const hDevicePtr = ref.alloc(ref.types.uint64);
      let result = this.sgfplib.CYCACHE_Create(hDevicePtr);

      if (result !== CYCACHE_CONSTANTS.CYCACHE_ERROR_NONE) {
        throw new Error(`Failed to create device handle: ${result}`);
      }

      this.hDevice = hDevicePtr.deref();

      // Initialize for Hamster Pro 20
      result = this.sgfplib.CYCACHE_Init(this.hDevice, CYCACHE_CONSTANTS.SG_DEV_AUTO);
      if (result !== CYCACHE_CONSTANTS.CYCACHE_ERROR_NONE) {
        throw new Error(`Failed to initialize: ${result}`);
      }

      // Open device
      result = this.sgfplib.CYCACHE_OpenDevice(this.hDevice, 0);
      if (result !== CYCACHE_CONSTANTS.CYCACHE_ERROR_NONE) {
        throw new Error(`Failed to open device: ${result}`);
      }

      // Turn on LED
      this.sgfplib.CYCACHE_SetLedOn(this.hDevice, true);

      this.isConnected = true;
      this.deviceInfo = {
        vendorId: '0x1162',
        productId: '0x2200',
        productName: 'SecuGen Hamster Pro 20',
        manufacturer: 'SecuGen',
        simulated: false
      };

      return {
        success: true,
        deviceInfo: this.deviceInfo
      };

    } catch (error) {
      console.error('[FINGERPRINT] Connection error:', error);

      // Fallback to simulation
      this.isConnected = true;
      this.deviceInfo = {
        vendorId: '0x1162',
        productId: '0x2200',
        productName: 'SecuGen Hamster Pro 20 (Simulated)',
        manufacturer: 'SecuGen',
        simulated: true
      };

      return {
        success: true,
        simulated: true,
        deviceInfo: this.deviceInfo,
        warning: error.message
      };
    }
  }

  /**
   * Disconnect scanner
   */
  async disconnect() {
    if (this.sgfplib && this.hDevice && isWindows) {
      try {
        this.sgfplib.CYCACHE_SetLedOn(this.hDevice, false);
        this.sgfplib.CYCACHE_CloseDevice(this.hDevice);
        this.sgfplib.CYCACHE_Close(this.hDevice);
      } catch (e) {
        console.log('[FINGERPRINT] Disconnect error:', e.message);
      }
    }

    this.isConnected = false;
    this.deviceInfo = null;
    this.hDevice = null;

    return { success: true };
  }

  /**
   * Capture fingerprint
   */
  async capture(options = {}) {
    const timeout = options.timeout || 10000;
    const minQuality = options.minQuality || 40;

    console.log(`[FINGERPRINT] Capturing (timeout=${timeout}ms)`);

    if (!this.isConnected) {
      await this.connect();
    }

    if (this.isCapturing) {
      throw new Error('Capture already in progress');
    }

    this.isCapturing = true;

    try {
      let imageData;
      let quality;
      let template;

      // Check if we have real SDK and device
      if (this.sgfplib && this.hDevice && isWindows && !this.deviceInfo?.simulated) {
        // Real capture using SecuGen SDK
        const result = await this.captureReal(timeout);
        imageData = result.imageData;
        quality = result.quality;
        template = result.template;
      } else {
        // Simulation mode
        await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate scan time
        imageData = this.generateFingerprint();
        quality = this.calculateQuality(imageData);
        template = this.generateTemplate(imageData);
      }

      if (quality < minQuality) {
        throw new Error(`Image quality too low (${quality}%). Please try again.`);
      }

      return {
        success: true,
        template: template.toString('base64'),
        image: imageData.toString('base64'),
        quality: quality,
        width: this.imageWidth,
        height: this.imageHeight,
        timestamp: Date.now(),
        simulated: this.deviceInfo?.simulated || false
      };

    } finally {
      this.isCapturing = false;
    }
  }

  /**
   * Real capture using SecuGen SDK
   */
  async captureReal(timeout) {
    return new Promise((resolve, reject) => {
      try {
        const ref = require('ref-napi');

        // Turn on LED
        this.sgfplib.CYCACHE_SetLedOn(this.hDevice, true);

        // Allocate image buffer
        const imageSize = this.imageWidth * this.imageHeight;
        const imageBuffer = Buffer.alloc(imageSize);

        // Capture with timeout
        const startTime = Date.now();

        const tryCapture = () => {
          if (Date.now() - startTime > timeout) {
            this.sgfplib.CYCACHE_SetLedOn(this.hDevice, false);
            reject(new Error('Capture timeout'));
            return;
          }

          const result = this.sgfplib.CYCACHE_GetImage(this.hDevice, imageBuffer);

          if (result === CYCACHE_CONSTANTS.CYCACHE_ERROR_NONE) {
            // Got image, check quality
            const qualityPtr = ref.alloc(ref.types.uint32);
            this.sgfplib.CYCACHE_GetImageQuality(
              this.hDevice,
              this.imageWidth,
              this.imageHeight,
              imageBuffer,
              qualityPtr
            );

            const quality = qualityPtr.deref();

            // Create template
            const templateBuffer = Buffer.alloc(400); // Max template size
            this.sgfplib.CYCACHE_CreateTemplate(
              this.hDevice,
              null, // Use default fingerprint info
              imageBuffer,
              templateBuffer
            );

            this.sgfplib.CYCACHE_SetLedOn(this.hDevice, false);

            resolve({
              imageData: imageBuffer,
              quality: quality,
              template: templateBuffer
            });
          } else {
            // Retry after short delay
            setTimeout(tryCapture, 100);
          }
        };

        tryCapture();

      } catch (error) {
        this.sgfplib.CYCACHE_SetLedOn(this.hDevice, false);
        reject(error);
      }
    });
  }

  /**
   * Generate synthetic fingerprint (fallback)
   */
  generateFingerprint() {
    const width = this.imageWidth;
    const height = this.imageHeight;
    const image = Buffer.alloc(width * height);

    const cx = width / 2;
    const cy = height / 2;
    const seed = Date.now() % 10000;
    const patternType = seed % 3;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        // Elliptical boundary
        const ellipse = (dx * dx) / (115 * 115) + (dy * dy) / (135 * 135);

        if (ellipse > 1) {
          image[idx] = 235 + Math.floor(Math.random() * 20);
        } else {
          let pattern;
          const freq = 0.12 + (seed % 30) * 0.002;

          if (patternType === 0) {
            // Loop pattern
            pattern = Math.sin(dy * freq + Math.sin(dx * 0.05) * 2);
          } else if (patternType === 1) {
            // Whorl pattern
            pattern = Math.sin(dist * freq + angle * 2);
          } else {
            // Arch pattern
            pattern = Math.sin((dy + Math.abs(dx) * 0.3) * freq);
          }

          const noise = (Math.random() - 0.5) * 15;
          const baseValue = pattern > 0 ? 50 : 190;
          image[idx] = Math.max(0, Math.min(255, baseValue + noise));
        }
      }
    }

    return image;
  }

  /**
   * Calculate image quality
   */
  calculateQuality(imageData) {
    let min = 255, max = 0, sum = 0;

    for (let i = 0; i < imageData.length; i++) {
      const pixel = imageData[i];
      if (pixel < min) min = pixel;
      if (pixel > max) max = pixel;
      sum += pixel;
    }

    const contrast = max - min;
    const mean = sum / imageData.length;

    let variance = 0;
    for (let i = 0; i < imageData.length; i++) {
      const diff = imageData[i] - mean;
      variance += diff * diff;
    }
    variance /= imageData.length;
    const stdDev = Math.sqrt(variance);

    const contrastScore = Math.min(contrast / 2, 40);
    const sharpnessScore = Math.min(stdDev / 2, 30);
    const edgeScore = 30;

    return Math.min(100, Math.max(0, Math.round(contrastScore + sharpnessScore + edgeScore)));
  }

  /**
   * Generate fingerprint template
   */
  generateTemplate(imageData) {
    const width = this.imageWidth;
    const height = this.imageHeight;
    const dpi = CYCACHE_CONSTANTS.IMAGE_DPI;
    const minutiae = this.extractMinutiae(imageData, width, height);

    // FMR template format header
    const header = Buffer.from([
      0x46, 0x4D, 0x52, 0x00, // "FMR\0"
      0x20, 0x32, 0x30,       // " 20"
      minutiae.length,
      (width >> 8) & 0xFF, width & 0xFF,
      (height >> 8) & 0xFF, height & 0xFF,
      dpi >> 8, dpi & 0xFF
    ]);

    const minutiaeData = Buffer.alloc(minutiae.length * 6);
    minutiae.forEach((m, i) => {
      const offset = i * 6;
      minutiaeData.writeUInt16BE(m.x, offset);
      minutiaeData.writeUInt16BE(m.y, offset + 2);
      minutiaeData[offset + 4] = m.angle;
      minutiaeData[offset + 5] = m.type;
    });

    const templateData = Buffer.concat([header, minutiaeData]);
    const hash = crypto.createHash('sha256').update(templateData).digest().slice(0, 16);

    return Buffer.concat([templateData, hash]);
  }

  /**
   * Extract minutiae points
   */
  extractMinutiae(imageData, width, height) {
    const minutiae = [];
    const threshold = 128;
    const blockSize = 16;

    for (let by = 1; by < Math.floor(height / blockSize) - 1; by++) {
      for (let bx = 1; bx < Math.floor(width / blockSize) - 1; bx++) {
        const x = bx * blockSize + blockSize / 2;
        const y = by * blockSize + blockSize / 2;
        const idx = Math.floor(y) * width + Math.floor(x);

        if (idx >= 0 && idx < imageData.length) {
          const pixel = imageData[idx];

          if (pixel < threshold) {
            const neighbors = this.countNeighbors(imageData, x, y, width, height, threshold);

            if (neighbors === 1 || neighbors === 3) {
              minutiae.push({
                x: Math.round(x),
                y: Math.round(y),
                angle: Math.floor(Math.random() * 256),
                type: neighbors === 1 ? 0x01 : 0x02 // Ridge ending or bifurcation
              });
            }
          }
        }
      }
    }

    return minutiae.slice(0, 128);
  }

  /**
   * Count neighbors for minutiae detection
   */
  countNeighbors(imageData, x, y, width, height, threshold) {
    let count = 0;
    const offsets = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

    for (const [dx, dy] of offsets) {
      const nx = Math.floor(x + dx);
      const ny = Math.floor(y + dy);

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (imageData[ny * width + nx] < threshold) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Match two templates
   */
  async match(template1, template2) {
    try {
      const t1 = Buffer.isBuffer(template1) ? template1 : Buffer.from(template1, 'base64');
      const t2 = Buffer.isBuffer(template2) ? template2 : Buffer.from(template2, 'base64');

      if (t1.length < 20 || t2.length < 20) {
        return { match: false, score: 0, error: 'Invalid template' };
      }

      // If we have real SDK, use it
      if (this.sgfplib && this.hDevice && isWindows && !this.deviceInfo?.simulated) {
        const ref = require('ref-napi');
        const scorePtr = ref.alloc(ref.types.uint32);

        const result = this.sgfplib.CYCACHE_MatchTemplate(
          this.hDevice,
          t1,
          t2,
          3, // Security level (1-5)
          scorePtr
        );

        if (result === CYCACHE_CONSTANTS.CYCACHE_ERROR_NONE) {
          const score = scorePtr.deref();
          return {
            match: score >= 60,
            score: score
          };
        }
      }

      // Fallback: simple hash comparison
      const hash1 = crypto.createHash('md5').update(t1).digest('hex');
      const hash2 = crypto.createHash('md5').update(t2).digest('hex');

      let matchingChars = 0;
      for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] === hash2[i]) matchingChars++;
      }

      const score = Math.round((matchingChars / hash1.length) * 100);

      return {
        match: score >= 60,
        score: score
      };

    } catch (error) {
      return { match: false, score: 0, error: error.message };
    }
  }
}

module.exports = new FingerprintScannerWindows();
