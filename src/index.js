/**
 * Bolo PC Server
 *
 * Receives voice-transcribed text from the Bolo Android app
 * and types it at the current cursor position on your PC.
 *
 * Features:
 *   - Sticky port: remembers and reuses the same port across restarts
 *   - Auto-discovers on LAN via mDNS (unique per user)
 *   - System tray icon with settings, QR code, copy URL
 *   - Cloudflare Quick Tunnel for internet access (free)
 *   - Start on boot (optional)
 *   - Multi-user safe: increments port if taken by another user
 */

const http = require('http');
const { createServer } = require('./server');
const { startAdvertising, stopAdvertising, getLocalIPs } = require('./discovery');
const { startUdpDiscovery, stopUdpDiscovery } = require('./udp-discovery');
const { startTray, stopTray, updateTunnelUrl } = require('./tray');
const { loadSettings, saveSettings, getServiceName, bindStickyPort, DEFAULT_PORT } = require('./settings');
const { isStartupEnabled, enableStartup, migrateLegacyStartup } = require('./startup');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { startTunnel, stopTunnel, setTunnelUrlListener } = require('./tunnel');
const { ensureIdentity, startPresencePublishing, stopPresencePublishing } = require('./presence');
const { createDesktopShortcut } = require('./shortcut');
const { execSync } = require('child_process');
const { MANIFEST_URL, checkForUpdates, applyHostedUpdate } = require('./updater');

const { handleSelfInstall } = require('./installer');

// Initialize File Logging
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const logDir = path.join(localAppData, 'Bolo');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, 'bolo.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

const util = require('util');
function formatArgs(args) {
    return util.format.apply(util, args) + '\n';
}

const origLog = console.log;
console.log = function(...args) {
    logStream.write(formatArgs(args));
    origLog.apply(console, args);
};

const origWarn = console.warn;
console.warn = function(...args) {
    logStream.write('[WARN] ' + formatArgs(args));
    origWarn.apply(console, args);
};

const origError = console.error;
console.error = function(...args) {
    logStream.write('[ERR] ' + formatArgs(args));
    origError.apply(console, args);
};

async function runUpdateCheck({ interactive = false, wss = null } = {}) {
    try {
        const packageJson = require('../package.json');
        const activeClients = wss
            ? Array.from(wss.clients).filter(ws => ws.isAuthenticated && ws.readyState === 1).length
            : 0;
        if (activeClients > 0) {
            if (interactive) {
                console.log('[Update] Skipped: a phone is currently connected. Try again when idle.');
            }
            return;
        }
        const result = await checkForUpdates(packageJson.version);
        if (!result.enabled) {
            if (interactive) {
                console.log('[Update] Hosted updates are not configured yet.');
            }
            return;
        }
        if (!result.updateAvailable) {
            if (interactive) {
                console.log(`[Update] Already up to date (${packageJson.version}).`);
            }
            return;
        }

        console.log(`[Update] Updating from ${packageJson.version} to ${result.version}`);
        await applyHostedUpdate(result.url);
    } catch (e) {
        console.error('[Update] Hosted update check failed:', e.message);
    }
}

// Helper to open the log file
function openLogs() {
    try {
        execSync(`start notepad "${logFile}"`);
    } catch (e) {
        console.error('Failed to open log file:', e.message);
    }
}

module.exports.openLogs = openLogs;

async function main() {
    // 1. If running for the first time from a temp location, install and relaunch!
    if (handleSelfInstall()) {
        return; // Current process terminates
    }

    // Older releases used a visible Node registry autorun in addition to the hidden shortcut.
    migrateLegacyStartup();

    // 2. Single-instance lock (per Windows user)
    const net = require('net');
    const pipeName = '\\\\.\\pipe\\bolo-pc-server-' + os.userInfo().username;
    try {
        const lockServer = net.createServer();
        await new Promise((resolve, reject) => {
            lockServer.on('error', reject);
            lockServer.listen(pipeName, () => {
                lockServer.removeListener('error', reject);
                resolve();
            });
        });
    } catch (err) {
        if (err.code === 'EADDRINUSE') {
            console.error('[ERR] Bolo Server is already running for this user. Exiting.');
            process.exit(0);
        }
    }

    // Create identity before loading the mutable settings snapshot so later saves preserve it.
    ensureIdentity();
    const settings = loadSettings();
    const serviceName = getServiceName();
    const packageJson = require('../package.json');

    console.log('');
    console.log('==========================================');
    console.log(`       Bolo PC Server v${packageJson.version}              `);
    console.log('==========================================');
    console.log('  Voice-type from your phone to this PC   ');
    console.log('==========================================');
    console.log('');
    console.log(`User: ${serviceName}`);
    console.log('');

    // Firewalls are now handled via standard OS prompts

    // Create HTTP server
    const httpServer = http.createServer();

    // Sticky port: try last known port first, then default, then increment
    const preferredPort = settings.lastPort || DEFAULT_PORT;
    let actualPort;

    try {
        actualPort = await bindStickyPort(httpServer, preferredPort);
    } catch (err) {
        console.error('[ERR] Could not bind to any port:', err.message);
        process.exit(1);
    }

    console.log(`[OK] Server listening on port ${actualPort}`);

    // Save port for next startup
    settings.lastPort = actualPort;
    saveSettings(settings);

    // Attach WebSocket server
    const wss = createServer(httpServer);

    // Start mDNS advertisement
    startAdvertising(actualPort);
    startUdpDiscovery(actualPort);

    // Show manual connection info
    console.log('');
    console.log('Manual connection:');
    const ips = getLocalIPs();
    ips.forEach(ip => {
        console.log(`   ws://${ip}:${actualPort}`);
    });
    console.log('');
    console.log('Waiting for phone to connect...');
    console.log('   (Open Bolo app > PC Mode > Connect)');
    console.log('');

    // Enable startup on first run if setting says so
    if (settings.startOnBoot && !isStartupEnabled()) {
        enableStartup();
    }

    // Start system tray (without tunnel URL initially)
    startTray({
        port: actualPort,
        tunnelUrl: null,
        onCheckUpdates: MANIFEST_URL ? () => runUpdateCheck({ interactive: true, wss }) : null,
        onExit: () => shutdown(httpServer)
    });

    // Check only after startup settles; the updater refuses to interrupt an active phone session.
    if (MANIFEST_URL) {
        const updateTimer = setTimeout(
            () => runUpdateCheck({ interactive: false, wss }),
            15000
        );
        updateTimer.unref?.();
    }

    // Auto-show QR code on first run if no devices are paired
    if (!settings.trustedTokens || settings.trustedTokens.length === 0) {
        setTimeout(() => {
            const { showQRCode } = require('./tray');
            showQRCode(actualPort);
        }, 1000); // Wait 1 second for everything to settle
    }

    // Start Cloudflare tunnel in background (non-blocking)
    let activeTunnelUrl = null;
    const handleTunnelReady = (tunnelUrl) => {
        if (tunnelUrl) {
            if (activeTunnelUrl === tunnelUrl) return;
            activeTunnelUrl = tunnelUrl;
            updateTunnelUrl(tunnelUrl);
            startPresencePublishing(tunnelUrl, packageJson.version);
            console.log(`\n[Cloud] Internet URL: ${tunnelUrl}`);
            console.log(`   wss://${tunnelUrl.replace('https://', '')}`);
        }
    };
    setTunnelUrlListener(handleTunnelReady);
    startTunnel(actualPort).then(handleTunnelReady).catch(err => {
        console.warn('[WARN] Tunnel failed:', err.message);
    });

}

function shutdown(httpServer) {
    console.log('\nShutting down...');
    stopPresencePublishing();
    stopTunnel();
    stopAdvertising();
    stopUdpDiscovery();
    stopTray();
    httpServer.close();
    process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', () => shutdown(null));
process.on('SIGTERM', () => shutdown(null));

main().catch(err => {
    console.error('[ERR] Fatal error:', err);
    process.exit(1);
});
