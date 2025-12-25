/**
 * SecuGen Fingerprint Scanner Module for Windows
 * SDK-FREE Version - Captures raw fingerprint images via USB
 * Sends raw images to server for processing (server has the SDK)
 *
 * Architecture:
 * - Local app: Captures raw USB data from scanner
 * - Server: Has SecuGen SDK for template generation & matching
 */

const os = require('os');

// SecuGen Hamster Pro USB identifiers
const SECUGEN_VENDOR_ID = 0x1162;
const SECUGEN_PRODUCT_ID = 0x2200;

// Image dimensions for Hamster Pro 20
const IMAGE_WIDTH = 260;
const IMAGE_HEIGHT = 300;
const IMAGE_SIZE = IMAGE_WIDTH * IMAGE_HEIGHT;

class FingerprintScannerWindows {
  constructor() {
    this.isConnected = false;
    this.isCapturing = false;
    this.deviceInfo = null;
    this.device = null;
    this.usbLib = null;
    this.serverUrl = 'http://localhost:3001'; // Backend server with SDK

    // Try to load USB library
    this.loadUSBLibrary();
  }

  /**
   * Load USB library for direct device communication
   */
  loadUSBLibrary() {
    try {
      this.usbLib = require('usb');
      console.log('[FINGERPRINT] USB library loaded successfully');
    } catch (e) {
      console.log('[FINGERPRINT] USB library not available:', e.message);
      this.usbLib = null;
    }
  }

  /**
   * Set the backend server URL
   */
  setServerUrl(url) {
    this.serverUrl = url;
    console.log('[FINGERPRINT] Server URL set to:', url);
  }

  /**
   * Get scanner status
   */
  getStatus() {
    // Check if scanner is physically connected
    let scannerDetected = false;
    let deviceDetails = null;

    if (this.usbLib) {
      try {
        const device = this.usbLib.findByIds(SECUGEN_VENDOR_ID, SECUGEN_PRODUCT_ID);
        if (device) {
          scannerDetected = true;
          deviceDetails = {
            vendorId: `0x${SECUGEN_VENDOR_ID.toString(16)}`,
            productId: `0x${SECUGEN_PRODUCT_ID.toString(16)}`,
            bus: device.busNumber,
            address: device.deviceAddress
          };
        }
      } catch (e) {
        console.log('[FINGERPRINT] USB detection error:', e.message);
      }
    }

    return {
      connected: this.isConnected,
      capturing: this.isCapturing,
      deviceInfo: this.deviceInfo,
      scannerDetected: scannerDetected,
      usbDetails: deviceDetails,
      usbAvailable: !!this.usbLib,
      sdkRequired: false, // SDK is on server, not here
      serverUrl: this.serverUrl,
      platform: os.platform()
    };
  }

  /**
   * Connect to scanner via USB
   */
  async connect() {
    console.log('[FINGERPRINT] Connecting to scanner...');

    if (this.isConnected) {
      return {
        success: true,
        alreadyConnected: true,
        deviceInfo: this.deviceInfo
      };
    }

    if (!this.usbLib) {
      throw new Error('USB library not available. Please ensure usb package is installed.');
    }

    try {
      // Find SecuGen device
      this.device = this.usbLib.findByIds(SECUGEN_VENDOR_ID, SECUGEN_PRODUCT_ID);

      if (!this.device) {
        throw new Error('SecuGen scanner not detected. Please connect the device.');
      }

      // Open the device
      this.device.open();
      console.log('[FINGERPRINT] Device opened');

      // Get device info
      const descriptor = this.device.deviceDescriptor;

      // Try to get string descriptors
      let manufacturer = 'SecuGen';
      let productName = 'Hamster Pro';

      try {
        if (descriptor.iManufacturer) {
          manufacturer = await this.getStringDescriptor(descriptor.iManufacturer);
        }
        if (descriptor.iProduct) {
          productName = await this.getStringDescriptor(descriptor.iProduct);
        }
      } catch (e) {
        // Use defaults if string descriptors fail
      }

      // Claim the interface
      const iface = this.device.interface(0);

      // On Windows, we might need to detach kernel driver
      if (os.platform() === 'win32') {
        try {
          if (iface.isKernelDriverActive && iface.isKernelDriverActive()) {
            iface.detachKernelDriver();
          }
        } catch (e) {
          // Not critical
        }
      }

      try {
        iface.claim();
        console.log('[FINGERPRINT] Interface claimed');
      } catch (e) {
        console.log('[FINGERPRINT] Could not claim interface:', e.message);
        // Continue anyway - we might still be able to do control transfers
      }

      // Initialize the scanner (turn on LED)
      await this.initializeScanner();

      this.isConnected = true;
      this.deviceInfo = {
        vendorId: `0x${SECUGEN_VENDOR_ID.toString(16)}`,
        productId: `0x${SECUGEN_PRODUCT_ID.toString(16)}`,
        productName: productName,
        manufacturer: manufacturer,
        serial: descriptor.iSerialNumber ? await this.getStringDescriptor(descriptor.iSerialNumber).catch(() => 'N/A') : 'N/A'
      };

      return {
        success: true,
        deviceInfo: this.deviceInfo
      };

    } catch (error) {
      console.error('[FINGERPRINT] Connection error:', error);

      // Close device if opened
      if (this.device) {
        try { this.device.close(); } catch (e) {}
        this.device = null;
      }

      throw error;
    }
  }

  /**
   * Get USB string descriptor
   */
  getStringDescriptor(index) {
    return new Promise((resolve, reject) => {
      if (!this.device) {
        reject(new Error('Device not open'));
        return;
      }
      this.device.getStringDescriptor(index, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  /**
   * Initialize scanner - turn on LED, set brightness
   */
  async initializeScanner() {
    if (!this.device) return;

    // SecuGen initialization commands via USB control transfers
    // These are vendor-specific commands

    const commands = [
      // LED ON command
      { bmRequestType: 0x40, bRequest: 0x50, wValue: 0x01, wIndex: 0x00 },
      // Set brightness
      { bmRequestType: 0x40, bRequest: 0x51, wValue: 0x50, wIndex: 0x00 },
    ];

    for (const cmd of commands) {
      try {
        await this.controlTransfer(cmd.bmRequestType, cmd.bRequest, cmd.wValue, cmd.wIndex, Buffer.alloc(0));
      } catch (e) {
        // Continue even if commands fail
        console.log('[FINGERPRINT] Init command failed:', e.message);
      }
    }
  }

  /**
   * USB control transfer wrapper
   */
  controlTransfer(bmRequestType, bRequest, wValue, wIndex, data) {
    return new Promise((resolve, reject) => {
      if (!this.device) {
        reject(new Error('Device not open'));
        return;
      }

      if (data.length === 0) {
        // OUT transfer with no data
        this.device.controlTransfer(bmRequestType, bRequest, wValue, wIndex, Buffer.alloc(0), (err) => {
          if (err) reject(err);
          else resolve();
        });
      } else if (bmRequestType & 0x80) {
        // IN transfer - expect data back
        this.device.controlTransfer(bmRequestType, bRequest, wValue, wIndex, data.length, (err, recvData) => {
          if (err) reject(err);
          else resolve(recvData);
        });
      } else {
        // OUT transfer with data
        this.device.controlTransfer(bmRequestType, bRequest, wValue, wIndex, data, (err) => {
          if (err) reject(err);
          else resolve();
        });
      }
    });
  }

  /**
   * Disconnect scanner
   */
  async disconnect() {
    console.log('[FINGERPRINT] Disconnecting...');

    if (this.device) {
      try {
        // Turn off LED
        await this.controlTransfer(0x40, 0x50, 0x00, 0x00, Buffer.alloc(0)).catch(() => {});

        // Release interface
        try {
          const iface = this.device.interface(0);
          iface.release(true, () => {});
        } catch (e) {}

        // Close device
        this.device.close();
      } catch (e) {
        console.log('[FINGERPRINT] Disconnect error:', e.message);
      }

      this.device = null;
    }

    this.isConnected = false;
    this.deviceInfo = null;

    return { success: true };
  }

  /**
   * Capture fingerprint image via USB
   * Returns raw image data to be processed by server
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
      // Turn on LED for capture
      await this.setLed(true);

      // Wait a moment for LED
      await this.delay(100);

      // Capture raw image from scanner
      const rawImage = await this.captureRawImage(timeout);

      // Turn off LED
      await this.setLed(false);

      // Calculate local quality estimate
      const quality = this.estimateQuality(rawImage);

      if (quality < minQuality) {
        throw new Error(`Image quality too low (${quality}%). Please place finger properly and try again.`);
      }

      // Return raw image - server will generate template
      return {
        success: true,
        image: rawImage.toString('base64'),
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        quality: quality,
        timestamp: Date.now(),
        requiresServerProcessing: true, // Tell frontend this needs server processing
        message: 'Raw image captured. Send to server for template generation.'
      };

    } finally {
      this.isCapturing = false;
      await this.setLed(false).catch(() => {});
    }
  }

  /**
   * Capture raw image from scanner via USB bulk transfer
   */
  async captureRawImage(timeout) {
    return new Promise((resolve, reject) => {
      if (!this.device) {
        reject(new Error('Device not connected'));
        return;
      }

      const startTime = Date.now();
      const imageBuffer = Buffer.alloc(IMAGE_SIZE);
      let bytesRead = 0;

      // Get the IN endpoint (usually 0x82 or 0x81)
      let inEndpoint = null;
      try {
        const iface = this.device.interface(0);
        for (const ep of iface.endpoints) {
          if (ep.direction === 'in') {
            inEndpoint = ep;
            break;
          }
        }
      } catch (e) {
        // Use default endpoint
      }

      if (!inEndpoint) {
        // Try control transfer method instead
        this.captureViaControlTransfer(timeout)
          .then(resolve)
          .catch(reject);
        return;
      }

      const tryRead = () => {
        if (Date.now() - startTime > timeout) {
          reject(new Error('Capture timeout - no finger detected'));
          return;
        }

        // First, send capture command
        this.device.controlTransfer(
          0x40,  // bmRequestType: vendor, host-to-device
          0x52,  // bRequest: capture command
          0x01,  // wValue: start capture
          0x00,  // wIndex
          Buffer.alloc(0),
          (err) => {
            if (err) {
              // Retry after delay
              setTimeout(tryRead, 200);
              return;
            }

            // Wait for capture to complete
            setTimeout(() => {
              // Read image data
              inEndpoint.transfer(IMAGE_SIZE, (err, data) => {
                if (err) {
                  // Retry
                  setTimeout(tryRead, 200);
                  return;
                }

                if (data && data.length > 0) {
                  // Check if this is a valid fingerprint image (not all black/white)
                  const isValid = this.isValidImage(data);
                  if (isValid) {
                    resolve(data);
                  } else {
                    // No finger detected, retry
                    setTimeout(tryRead, 200);
                  }
                } else {
                  setTimeout(tryRead, 200);
                }
              });
            }, 100);
          }
        );
      };

      tryRead();
    });
  }

  /**
   * Alternative capture method using control transfers only
   */
  async captureViaControlTransfer(timeout) {
    const startTime = Date.now();
    const chunkSize = 64;
    const imageBuffer = Buffer.alloc(IMAGE_SIZE);

    while (Date.now() - startTime < timeout) {
      try {
        // Send capture command
        await this.controlTransfer(0x40, 0x52, 0x01, 0x00, Buffer.alloc(0));

        // Wait for capture
        await this.delay(200);

        // Read image in chunks
        let offset = 0;
        while (offset < IMAGE_SIZE) {
          const chunk = await this.controlTransfer(0xC0, 0x53, offset, 0x00, Buffer.alloc(chunkSize));
          if (chunk && chunk.length > 0) {
            chunk.copy(imageBuffer, offset);
            offset += chunk.length;
          } else {
            break;
          }
        }

        if (offset >= IMAGE_SIZE && this.isValidImage(imageBuffer)) {
          return imageBuffer;
        }

        await this.delay(200);
      } catch (e) {
        await this.delay(200);
      }
    }

    throw new Error('Capture timeout - no finger detected');
  }

  /**
   * Check if image contains valid fingerprint data
   */
  isValidImage(imageData) {
    if (!imageData || imageData.length < 1000) return false;

    // Check for variance (not all same value)
    let min = 255, max = 0, sum = 0;
    const sampleSize = Math.min(1000, imageData.length);

    for (let i = 0; i < sampleSize; i++) {
      const idx = Math.floor(i * imageData.length / sampleSize);
      const pixel = imageData[idx];
      if (pixel < min) min = pixel;
      if (pixel > max) max = pixel;
      sum += pixel;
    }

    const contrast = max - min;
    const mean = sum / sampleSize;

    // Valid fingerprint should have reasonable contrast and not be all black/white
    return contrast > 30 && mean > 30 && mean < 225;
  }

  /**
   * Estimate image quality locally (basic estimate)
   */
  estimateQuality(imageData) {
    let min = 255, max = 0, sum = 0;

    for (let i = 0; i < imageData.length; i++) {
      const pixel = imageData[i];
      if (pixel < min) min = pixel;
      if (pixel > max) max = pixel;
      sum += pixel;
    }

    const contrast = max - min;
    const mean = sum / imageData.length;

    // Calculate variance for sharpness
    let variance = 0;
    for (let i = 0; i < imageData.length; i++) {
      const diff = imageData[i] - mean;
      variance += diff * diff;
    }
    variance /= imageData.length;
    const stdDev = Math.sqrt(variance);

    // Quality score based on contrast and variance
    const contrastScore = Math.min(contrast / 2, 40);
    const sharpnessScore = Math.min(stdDev / 2, 30);
    const baseScore = 30; // Base quality for detecting a finger

    return Math.min(100, Math.max(0, Math.round(contrastScore + sharpnessScore + baseScore)));
  }

  /**
   * Control LED
   */
  async setLed(on) {
    if (!this.device) return;

    try {
      await this.controlTransfer(0x40, 0x50, on ? 0x01 : 0x00, 0x00, Buffer.alloc(0));
    } catch (e) {
      // LED control might not be available on all firmware versions
    }
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Match templates - delegates to server
   * This function sends templates to server which has the SDK
   */
  async match(template1, template2) {
    // Matching must be done on server which has the SDK
    // This is just a stub that informs the caller
    return {
      match: false,
      score: 0,
      error: 'Template matching must be done on server. Use /api/scanner/match endpoint.',
      requiresServer: true
    };
  }

  /**
   * Send raw image to server for processing
   * Server will generate template using SecuGen SDK
   */
  async sendToServer(imageData, serverUrl) {
    const url = serverUrl || this.serverUrl;

    try {
      const response = await fetch(`${url}/api/scanner/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: imageData.toString('base64'),
          width: IMAGE_WIDTH,
          height: IMAGE_HEIGHT
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Failed to send to server: ${error.message}`);
    }
  }
}

module.exports = new FingerprintScannerWindows();
