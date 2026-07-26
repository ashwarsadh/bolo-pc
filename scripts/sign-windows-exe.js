const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const exePath = process.argv[2] ? path.resolve(process.argv[2]) : null;

if (!exePath) {
    console.error('Usage: node scripts/sign-windows-exe.js <exe-path>');
    process.exit(2);
}

if (!fs.existsSync(exePath)) {
    throw new Error(`Missing executable: ${exePath}`);
}

const signtool = process.env.WINDOWS_SIGNTOOL_PATH || 'signtool.exe';
const timestampUrl = process.env.WINDOWS_TIMESTAMP_URL || 'http://timestamp.digicert.com';
const pfxPath = process.env.WINDOWS_CERT_PFX;
const pfxPassword = process.env.WINDOWS_CERT_PASSWORD;
const certSha1 = process.env.WINDOWS_CERT_SHA1;
const certSubject = process.env.WINDOWS_CERT_SUBJECT;

if (!pfxPath && !certSha1 && !certSubject) {
    console.log('[Sign] Skipped: set WINDOWS_CERT_PFX, WINDOWS_CERT_SHA1, or WINDOWS_CERT_SUBJECT to sign the EXE.');
    process.exit(0);
}

const args = ['sign', '/fd', 'SHA256', '/tr', timestampUrl, '/td', 'SHA256'];

if (pfxPath) {
    args.push('/f', pfxPath);
    if (pfxPassword) {
        args.push('/p', pfxPassword);
    }
} else if (certSha1) {
    args.push('/sha1', certSha1);
} else if (certSubject) {
    args.push('/n', certSubject);
}

args.push(exePath);

console.log(`[Sign] Signing ${exePath}`);
execFileSync(signtool, args, {
    stdio: 'inherit',
    windowsHide: true
});
