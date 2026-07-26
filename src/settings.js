/**
 * Per-user settings management.
 * Stores settings in %APPDATA%/Bolo/settings.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_DIR = path.join(os.homedir(), 'AppData', 'Roaming', 'Bolo');
const SETTINGS_FILE = path.join(APP_DIR, 'settings.json');

const DEFAULT_PORT = 9876;

const DEFAULTS = {
    startOnBoot: true,
    lastPort: DEFAULT_PORT   // Remembers last used port for consistency
};

/**
 * Load settings from disk, merging with defaults.
 */
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
            return { ...DEFAULTS, ...data };
        }
    } catch (e) {
        console.warn('[WARN] Failed to load settings, using defaults:', e.message);
    }
    return { ...DEFAULTS };
}

/**
 * Save settings to disk.
 */
function saveSettings(settings) {
    try {
        if (!fs.existsSync(APP_DIR)) {
            fs.mkdirSync(APP_DIR, { recursive: true });
        }
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    } catch (e) {
        console.warn('[WARN] Failed to save settings:', e.message);
    }
}

/**
 * Get a unique service name: "Hostname (Username)"
 */
function getServiceName() {
    const hostname = os.hostname();
    const username = os.userInfo().username;
    return `${hostname} (${username})`;
}

/**
 * Try to bind to the given port. If busy, try incrementing up to maxAttempts.
 * Returns a promise that resolves with the server listening on a port.
 */
function bindStickyPort(httpServer, preferredPort, maxAttempts = 20) {
    return new Promise((resolve, reject) => {
        let attempt = 0;
        const tryPort = (port) => {
            attempt++;
            httpServer.once('error', (err) => {
                if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
                    console.log(`   Port ${port} busy, trying ${port + 1}...`);
                    tryPort(port + 1);
                } else {
                    reject(err);
                }
            });
            httpServer.listen(port, () => {
                resolve(httpServer.address().port);
            });
        };
        tryPort(preferredPort);
    });
}

module.exports = {
    loadSettings, saveSettings, getServiceName,
    bindStickyPort, APP_DIR, DEFAULT_PORT
};

