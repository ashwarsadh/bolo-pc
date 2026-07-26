const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const MANIFEST_URL = process.env.BOLO_UPDATE_MANIFEST_URL || 'https://github.com/ashwarsadh/bolo-pc/releases/latest/download/bolo-pc-manifest.json';

function compareVersions(a, b) {
    const aParts = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
    const bParts = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
    const max = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < max; i++) {
        const av = aParts[i] || 0;
        const bv = bParts[i] || 0;
        if (av > bv) return 1;
        if (av < bv) return -1;
    }
    return 0;
}

async function checkForUpdates(currentVersion) {
    if (!MANIFEST_URL) {
        return { enabled: false };
    }

    const res = await fetch(MANIFEST_URL, {
        headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
        }
    });

    if (!res.ok) {
        throw new Error(`Update manifest request failed: ${res.status}`);
    }

    const manifest = await res.json();
    const latestVersion = manifest.version;
    const downloadUrl = manifest.url;

    if (!latestVersion || !downloadUrl) {
        throw new Error('Update manifest is missing version or url');
    }

    return {
        enabled: true,
        updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
        version: latestVersion,
        url: downloadUrl,
        notes: manifest.notes || ''
    };
}

async function applyHostedUpdate(downloadUrl) {
    const fsPromises = fs.promises;
    const tempZip = path.join(os.tmpdir(), 'Bolo-Server-Hosted-Update.zip');
    const tempDir = path.join(os.tmpdir(), `Bolo-Server-Hosted-${Date.now()}`);
    const currentExe = process.execPath;
    const exeDir = path.dirname(currentExe);

    const res = await fetch(downloadUrl);
    if (!res.ok) {
        throw new Error(`Failed to download update: ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    await fsPromises.writeFile(tempZip, Buffer.from(arrayBuffer));

    const extract = require('extract-zip');
    await extract(tempZip, { dir: tempDir });

    const newExePath = path.join(tempDir, 'Bolo-Server.exe');
    if (!fs.existsSync(newExePath)) {
        throw new Error('Bolo-Server.exe not found in update package');
    }

    const vbsPath = path.join(os.tmpdir(), 'bolo_update.vbs');
    const vbsLauncher = path.join(exeDir, 'Bolo-Launcher.vbs');
    const vbs = [
        'WScript.Sleep 2000',
        'Set fso = CreateObject("Scripting.FileSystemObject")',
        `fso.CopyFile "${newExePath.replace(/\\/g, '\\\\')}", "${currentExe.replace(/\\/g, '\\\\')}", True`,
        'Set WshShell = CreateObject("WScript.Shell")',
        `If fso.FileExists("${vbsLauncher.replace(/\\/g, '\\\\')}") Then`,
        `    WshShell.Run "wscript.exe ""${vbsLauncher.replace(/\\/g, '\\\\')}""", 0, False`,
        'Else',
        `    WshShell.Run chr(34) & "${currentExe.replace(/\\/g, '\\\\')}" & chr(34), 0, False`,
        'End If'
    ].join('\r\n');

    await fsPromises.writeFile(vbsPath, vbs, 'utf8');

    spawn('wscript.exe', [vbsPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
    }).unref();

    setTimeout(() => process.exit(0), 500);
}

module.exports = {
    MANIFEST_URL,
    checkForUpdates,
    applyHostedUpdate
};
