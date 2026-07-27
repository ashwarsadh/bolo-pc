/**
 * Windows startup management.
 * Uses one hidden Startup shortcut and removes the legacy visible Node autorun.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const LEGACY_REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const LEGACY_REG_VALUE = 'Bolo-PC';
const installDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Bolo');
const launcherPath = path.join(installDir, 'Bolo-Launcher.vbs');
const startupDir = path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup'
);
const startupLinkPath = path.join(startupDir, 'Bolo Server.lnk');

function escapeVbs(value) {
    return String(value).replace(/"/g, '""');
}

function hasLegacyStartupEntry() {
    const result = spawnSync(
        'reg.exe',
        ['query', LEGACY_REG_KEY, '/v', LEGACY_REG_VALUE],
        { windowsHide: true, stdio: 'ignore' }
    );
    return result.status === 0;
}

function removeLegacyStartupEntry() {
    if (!hasLegacyStartupEntry()) return false;

    const result = spawnSync(
        'reg.exe',
        ['delete', LEGACY_REG_KEY, '/v', LEGACY_REG_VALUE, '/f'],
        { windowsHide: true, stdio: 'ignore' }
    );
    if (result.status !== 0) {
        console.warn('[WARN] Could not remove the legacy Bolo startup entry.');
        return false;
    }
    return true;
}

function writeHiddenLauncher() {
    fs.mkdirSync(installDir, { recursive: true });

    const executablePath = process.execPath;
    const argument = process.pkg
        ? ''
        : ` & " " & Chr(34) & "${escapeVbs(path.resolve(__dirname, 'index.js'))}" & Chr(34)`;
    const content = [
        'Set WshShell = CreateObject("WScript.Shell")',
        `WshShell.Run Chr(34) & "${escapeVbs(executablePath)}" & Chr(34)${argument}, 0, False`
    ].join('\r\n');

    fs.writeFileSync(launcherPath, content, 'utf8');
}

function createStartupShortcut() {
    fs.mkdirSync(startupDir, { recursive: true });
    writeHiddenLauncher();

    const iconPath = process.pkg ? process.execPath : launcherPath;
    const scriptPath = path.join(os.tmpdir(), `bolo_startup_${process.pid}_${Date.now()}.vbs`);
    const script = [
        'Set WshShell = CreateObject("WScript.Shell")',
        `Set Shortcut = WshShell.CreateShortcut("${escapeVbs(startupLinkPath)}")`,
        `Shortcut.TargetPath = "${escapeVbs(launcherPath)}"`,
        `Shortcut.WorkingDirectory = "${escapeVbs(installDir)}"`,
        `Shortcut.IconLocation = "${escapeVbs(iconPath)}"`,
        'Shortcut.Save'
    ].join('\r\n');

    try {
        fs.writeFileSync(scriptPath, script, 'utf8');
        execFileSync('cscript.exe', ['//nologo', scriptPath], {
            windowsHide: true,
            stdio: 'ignore'
        });
    } finally {
        try { fs.unlinkSync(scriptPath); } catch (e) { /* best effort */ }
    }
}

function isStartupEnabled() {
    return fs.existsSync(startupLinkPath) || hasLegacyStartupEntry();
}

function enableStartup() {
    try {
        createStartupShortcut();
        removeLegacyStartupEntry();
        console.log('[OK] Hidden startup enabled');
        return true;
    } catch (e) {
        console.error('[ERR] Failed to enable startup:', e.message);
        return false;
    }
}

function disableStartup() {
    try {
        if (fs.existsSync(startupLinkPath)) fs.unlinkSync(startupLinkPath);
        removeLegacyStartupEntry();
        console.log('[OK] Startup disabled');
        return true;
    } catch (e) {
        console.error('[ERR] Failed to disable startup:', e.message);
        return false;
    }
}

function migrateLegacyStartup() {
    if (!hasLegacyStartupEntry()) return false;

    try {
        if (!fs.existsSync(startupLinkPath)) createStartupShortcut();
        if (!removeLegacyStartupEntry()) return false;
        console.log('[Startup] Migrated legacy autorun to hidden startup.');
        return true;
    } catch (e) {
        console.warn('[WARN] Failed to migrate legacy startup:', e.message);
        return false;
    }
}

module.exports = {
    isStartupEnabled,
    enableStartup,
    disableStartup,
    migrateLegacyStartup
};
