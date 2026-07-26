/**
 * Cloudflare Quick Tunnel
 * Provides free internet access to the local server without any account.
 * Downloads cloudflared.exe on first use, then runs a quick tunnel.
 */

const { spawn, execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { APP_DIR } = require('./settings');

const CLOUDFLARED_PATH = path.join(APP_DIR, 'cloudflared.exe');
const DOWNLOAD_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

let tunnelProcess = null;
let tunnelUrl = null;
let onUrlReady = null;

function setTunnelUrlListener(listener) {
    onUrlReady = typeof listener === 'function' ? listener : null;
}

/**
 * Start a Cloudflare Quick Tunnel.
 * @param {number} port - Local port to tunnel.
 * @returns {Promise<string>} The public tunnel URL.
 */
async function startTunnel(port) {
    // Ensure cloudflared is available
    if (!fs.existsSync(CLOUDFLARED_PATH)) {
        console.log('[Cloud] Downloading cloudflared (one-time, ~30MB)...');
        await downloadCloudflared();
        console.log('[Cloud] Download complete');
    }

    return new Promise((resolve, reject) => {
        console.log('[Cloud] Starting Cloudflare tunnel...');

        tunnelProcess = spawn(CLOUDFLARED_PATH, [
            'tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'
        ], {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let resolved = false;
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                console.warn('[Cloud] Tunnel URL not detected in 30s, tunnel may still be starting...');
                resolve(null);
            }
        }, 30000);

        const handleOutput = (data) => {
            const line = data.toString();
            // cloudflared prints the URL in stderr
            const urlMatch = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (urlMatch) {
                const detectedUrl = urlMatch[0];
                const changed = tunnelUrl !== detectedUrl;
                tunnelUrl = detectedUrl;
                if (changed) {
                    console.log(`[Cloud] Tunnel ready: ${tunnelUrl}`);
                    onUrlReady?.(tunnelUrl);
                }
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve(tunnelUrl);
                }
            }
        };

        tunnelProcess.stdout.on('data', handleOutput);
        tunnelProcess.stderr.on('data', handleOutput);

        tunnelProcess.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                console.error('[Cloud] Tunnel failed:', err.message);
                resolve(null); // Don't reject — tunnel is optional
            }
        });

        tunnelProcess.on('exit', (code) => {
            tunnelUrl = null;
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                console.warn(`[Cloud] Tunnel exited with code ${code}`);
                resolve(null);
            }
        });
    });
}

/**
 * Stop the tunnel.
 */
function stopTunnel() {
    if (tunnelProcess) {
        tunnelProcess.kill();
        tunnelProcess = null;
        tunnelUrl = null;
        console.log('[Cloud] Tunnel stopped');
    }
}

/**
 * Get the current tunnel URL (or null if not running).
 */
function getTunnelUrl() {
    return tunnelUrl;
}

/**
 * Download cloudflared.exe to APP_DIR.
 */
function downloadCloudflared() {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(APP_DIR)) {
            fs.mkdirSync(APP_DIR, { recursive: true });
        }

        const tmpPath = CLOUDFLARED_PATH + '.tmp';
        const file = fs.createWriteStream(tmpPath);

        const download = (url) => {
            https.get(url, (response) => {
                // Handle redirects
                if (response.statusCode === 301 || response.statusCode === 302) {
                    download(response.headers.location);
                    return;
                }

                const total = parseInt(response.headers['content-length'], 10) || 0;
                let downloaded = 0;

                response.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (total > 0) {
                        const pct = Math.round((downloaded / total) * 100);
                        process.stdout.write(`\r   Progress: ${pct}%`);
                    }
                });

                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    process.stdout.write('\n');
                    // Rename tmp to final
                    fs.renameSync(tmpPath, CLOUDFLARED_PATH);
                    resolve();
                });
            }).on('error', (err) => {
                try { fs.unlinkSync(tmpPath); } catch (e) {}
                reject(err);
            });
        };

        download(DOWNLOAD_URL);
    });
}

module.exports = { startTunnel, stopTunnel, getTunnelUrl, setTunnelUrlListener };
