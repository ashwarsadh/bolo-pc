const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { loadSettings, saveSettings, APP_DIR } = require('./settings');

/**
 * Creates a desktop shortcut for the compiled executable on the first run.
 */
function createDesktopShortcut() {
    const settings = loadSettings();
    if (settings.shortcutCreated) {
        return; // Already created
    }

    // Only create shortcut if running as a compiled pkg executable
    if (!process.pkg) {
        return;
    }

    try {
        const exePath = process.execPath;
        const desktopPath = path.join(os.homedir(), 'Desktop', 'Bolo Server.lnk');

        // Write PS1 script to file to avoid quoting issues with paths containing spaces
        const psScript = `
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("${desktopPath.replace(/\\/g, '\\\\')}")
$Shortcut.TargetPath = "${exePath.replace(/\\/g, '\\\\')}" 
$Shortcut.Description = "Bolo PC Server"
$Shortcut.Save()
`;
        if (!fs.existsSync(APP_DIR)) fs.mkdirSync(APP_DIR, { recursive: true });
        const psPath = path.join(APP_DIR, 'create_shortcut.ps1');
        fs.writeFileSync(psPath, psScript, 'utf8');

        execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`, { windowsHide: true });
        
        console.log(`[OK] Desktop shortcut created at ${desktopPath}`);
        
        // Mark as created
        settings.shortcutCreated = true;
        saveSettings(settings);
    } catch (e) {
        console.warn('[WARN] Failed to create desktop shortcut:', e.message);
    }
}

module.exports = { createDesktopShortcut };
