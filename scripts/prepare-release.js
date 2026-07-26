const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const packageJsonPath = path.join(repoRoot, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;
const exePath = path.join(distDir, 'Bolo-Server.exe');
const zipPath = path.join(distDir, 'Bolo-Server.zip');
const manifestPath = path.join(distDir, 'bolo-pc-manifest.json');

execFileSync('cmd.exe', ['/c', 'npm', 'run', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env
});

if (!fs.existsSync(exePath)) {
    throw new Error(`Missing ${exePath} after build.`);
}

execFileSync('node', [path.join(__dirname, 'sign-windows-exe.js'), exePath], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env
});

if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
}

execFileSync(
    'powershell.exe',
    [
        '-NoProfile',
        '-Command',
        `Compress-Archive -LiteralPath '${exePath.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`
    ],
    { stdio: 'inherit' }
);

const repository = process.env.BOLO_RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY || 'ashwarsadh/bolo-pc';
const downloadUrl = `https://github.com/${repository}/releases/latest/download/Bolo-Server.zip`;
const notes = process.env.BOLO_RELEASE_NOTES || `Bolo PC Server ${version}`;

const manifest = {
    version,
    url: downloadUrl,
    notes
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`[Release] Prepared ${zipPath}`);
console.log(`[Release] Prepared ${manifestPath}`);
