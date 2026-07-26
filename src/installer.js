const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

function handleSelfInstall() {
    // Only perform self-install if we are running as a compiled binary (.exe)
    if (!process.pkg) return false;

    const exePath = process.execPath;
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const targetDir = path.join(localAppData, 'Bolo');
    const targetExe = path.join(targetDir, 'Bolo-Server.exe');

    // If we are already running from the target directory, we are installed!
    if (exePath.toLowerCase() === targetExe.toLowerCase()) {
        return false; // Proceed normally
    }

    try {
        console.log('[Install] First run detected. Installing to', targetDir);

        // 1. Create target directory
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // 1.5 Kill any existing instance reliably to prevent EPERM
        try {
            const processName = path.basename(targetExe, '.exe');
            const myPid = process.pid;
            const psScript = `Get-Process -Name "${processName}" -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne ${myPid} } | Stop-Process -Force`;
            execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript}"`, { windowsHide: true, stdio: 'ignore' });
            
            // Wait up to 2 seconds for the file lock to release
            let retries = 20;
            while (retries > 0) {
                try {
                    const start = Date.now();
                    while (Date.now() - start < 100) { } // 100ms sleep
                    if (fs.existsSync(targetExe)) {
                        fs.closeSync(fs.openSync(targetExe, 'r+'));
                    }
                    break; 
                } catch (e) {
                    if (e.code === 'ENOENT') break; 
                    retries--;
                }
            }
        } catch (e) { }

        // Try to explicitly delete the old file if it exists
        if (fs.existsSync(targetExe)) {
            try { fs.unlinkSync(targetExe); } catch (e) {}
        }

        // 2. Copy the executable
        fs.copyFileSync(exePath, targetExe);

        // 3. Create a VBS launcher to completely hide the console
        const vbsLauncherPath = path.join(targetDir, 'Bolo-Launcher.vbs');
        const vbsContent = `Set WshShell = CreateObject("WScript.Shell")\nWshShell.Run chr(34) & "${targetExe}" & chr(34), 0, False`;
        fs.writeFileSync(vbsLauncherPath, vbsContent, 'utf8');

        // 4. Create Desktop Shortcut pointing to the VBS Launcher (for no console flash)
        const desktopPath = path.join(os.homedir(), 'Desktop', 'Bolo Server.lnk');
        createShortcut(desktopPath, vbsLauncherPath, targetDir, targetExe);

        // 5. Create Start Menu Shortcut
        const startMenuPath = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Bolo Server.lnk');
        createShortcut(startMenuPath, vbsLauncherPath, targetDir, targetExe);

        // 6. Add to Startup
        const startupPath = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Bolo Server.lnk');
        createShortcut(startupPath, vbsLauncherPath, targetDir, targetExe);

        console.log('[Install] Installation complete. Launching installed version...');

        // 7. Launch the new installed version via VBS
        spawn('wscript.exe', [vbsLauncherPath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });

        // 8. Exit the current temporary executable
        process.exit(0);
        return true;
    } catch (e) {
        console.error('[Install] Installation failed:', e.message);
        return false; // Fallback to running from current location
    }
}

function createShortcut(linkPath, targetPath, workingDir, iconPath) {
    try {
        const psScript = `
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("${linkPath}")
$Shortcut.TargetPath = "${targetPath}"
$Shortcut.WorkingDirectory = "${workingDir}"
$Shortcut.IconLocation = "${iconPath}"
$Shortcut.Save()
`;
        const tempPs = path.join(os.tmpdir(), `bolo_shortcut_${Date.now()}.ps1`);
        fs.writeFileSync(tempPs, psScript, 'utf8');
        execSync(`powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tempPs}"`, { windowsHide: true });
        fs.unlinkSync(tempPs);
    } catch (e) {
        console.warn(`[WARN] Failed to create shortcut at ${linkPath}`);
    }
}

module.exports = { handleSelfInstall };
