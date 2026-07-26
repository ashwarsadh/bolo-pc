/**
 * Windows Startup Management.
 * Adds/removes Bolo from the Windows startup registry.
 */

const { execSync } = require('child_process');
const path = require('path');

const REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const REG_VALUE = 'Bolo-PC';

/**
 * Check if Bolo is set to start on boot.
 */
function isStartupEnabled() {
    try {
        const result = execSync(
            `reg query "${REG_KEY}" /v "${REG_VALUE}" 2>nul`,
            { encoding: 'utf8', windowsHide: true }
        );
        return result.includes(REG_VALUE);
    } catch (e) {
        return false;
    }
}

/**
 * Enable startup on boot.
 * Uses the current executable path (works for both node and packaged exe).
 */
function enableStartup() {
    try {
        const exePath = process.execPath;
        // If running from node.js, use the full command
        const command = process.pkg
            ? exePath
            : `${exePath}" "${path.resolve(__dirname, 'index.js')}`;

        // Use reg add for reliable path handling without PowerShell escape issues
        const escapedCommand = command.replace(/"/g, '\\"');
        const regCmd = `reg add "${REG_KEY}" /v "${REG_VALUE}" /t REG_SZ /d "${escapedCommand}" /f`;
        execSync(regCmd, { encoding: 'utf8', windowsHide: true });
        console.log('[OK] Startup enabled');
        return true;
    } catch (e) {
        // If it fails, we don't crash, just warn
        console.error('[ERR] Failed to enable startup:', e.message);
        return false;
    }
}

/**
 * Disable startup on boot.
 */
function disableStartup() {
    try {
        execSync(
            `reg delete "${REG_KEY}" /v "${REG_VALUE}" /f 2>nul`,
            { encoding: 'utf8', windowsHide: true }
        );
        console.log('[OK] Startup disabled');
        return true;
    } catch (e) {
        // If it fails, just warn
        console.error('[ERR] Failed to disable startup:', e.message);
        return false;
    }
}

module.exports = { isStartupEnabled, enableStartup, disableStartup };
