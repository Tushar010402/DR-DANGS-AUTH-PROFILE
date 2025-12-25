/**
 * Windows Service Uninstaller
 */

const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'DrDangsFingerprint',
  script: path.join(__dirname, 'service.js')
});

svc.on('uninstall', () => {
  console.log('Service uninstalled successfully!');
  process.exit(0);
});

console.log('Uninstalling Dr. Dangs Fingerprint Service...');
svc.uninstall();
