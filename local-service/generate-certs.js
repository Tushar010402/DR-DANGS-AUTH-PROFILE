/**
 * Generate self-signed certificates for localhost HTTPS
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const certDir = path.join(__dirname, 'certs');

// Create certs directory
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir);
}

const keyFile = path.join(certDir, 'localhost.key');
const certFile = path.join(certDir, 'localhost.crt');

// Check if OpenSSL is available
try {
  console.log('Generating SSL certificates for localhost...');

  // Generate private key and certificate
  execSync(`openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "${keyFile}" -out "${certFile}" -subj "/CN=localhost/O=DrDangs/C=IN"`, {
    stdio: 'inherit'
  });

  console.log('');
  console.log('Certificates generated successfully!');
  console.log(`Key: ${keyFile}`);
  console.log(`Cert: ${certFile}`);

} catch (err) {
  console.log('OpenSSL not found. Creating placeholder certificates...');
  console.log('For production, please install OpenSSL and run this script again.');

  // Create placeholder files
  fs.writeFileSync(keyFile, '# Placeholder - Generate real certificates with OpenSSL');
  fs.writeFileSync(certFile, '# Placeholder - Generate real certificates with OpenSSL');
}
