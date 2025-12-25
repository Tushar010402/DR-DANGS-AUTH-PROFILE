/**
 * Windows Service Installer
 * Installs the fingerprint service as a Windows background service
 */

const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'DrDangsFingerprint',
  description: 'Dr. Dangs Fingerprint Scanner Service - Enables fingerprint authentication in browser',
  script: path.join(__dirname, 'service.js'),
  nodeOptions: [],
  workingDirectory: __dirname,
  allowServiceLogon: true
});

// Listen for install event
svc.on('install', () => {
  console.log('Service installed successfully!');
  console.log('Starting service...');
  svc.start();
});

svc.on('start', () => {
  console.log('Service started successfully!');
  console.log('');
  console.log('The fingerprint scanner service is now running in the background.');
  console.log('You can now use https://auth.drdangscentrallab.com');
  process.exit(0);
});

svc.on('error', (err) => {
  console.error('Service error:', err);
});

// Install the service
console.log('Installing Dr. Dangs Fingerprint Service...');
console.log('');
svc.install();
