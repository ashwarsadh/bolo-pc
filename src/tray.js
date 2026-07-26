/**
 * System Tray Module
 * Shows a tray icon with menu items for settings, startup toggle, QR code, and exit.
 */

const SysTray = require('systray2').default;
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const { isStartupEnabled, enableStartup, disableStartup } = require('./startup');
const { loadSettings, saveSettings, getServiceName, APP_DIR } = require('./settings');
const authManager = require('./auth');

let systrayInstance = null;

/**
 * Load the icon as base64 string.
 * Prefers .ico (proper Windows tray format) over .png.
 */
function loadIcon() {
    const extensions = ['ico', 'png'];
    const baseDirs = [
        path.join(__dirname, '..', 'assets'),
        path.join(process.cwd(), 'assets'),
        path.join(path.dirname(process.execPath), 'assets')
    ];

    for (const ext of extensions) {
        for (const dir of baseDirs) {
            const iconPath = path.join(dir, `icon.${ext}`);
            try {
                if (fs.existsSync(iconPath)) {
                    return fs.readFileSync(iconPath).toString('base64');
                }
            } catch (e) { /* try next */ }
        }
    }

    // Fallback: a tiny 1x1 transparent PNG
    return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}

/**
 * Start the system tray icon.
 * @param {object} options
 * @param {number} options.port - The port the server is listening on.
 * @param {string|null} options.tunnelUrl - Cloudflare tunnel URL (null if not ready).
 * @param {function} [options.onCheckUpdates] - Callback to check for app updates.
 * @param {function} options.onExit - Callback when user clicks Exit.
 */
function startTray({ port, tunnelUrl, onCheckUpdates, onExit }) {
    const startupEnabled = isStartupEnabled();
    const serviceName = getServiceName();
    const localIPs = getLocalIPs();
    const lanAddr = localIPs.length > 0 ? `${localIPs[0]}:${port}` : `localhost:${port}`;
    const packageJson = require('../package.json');

    // Menu item indices: 0=name, 1=port, 2=sep, 3=Copy LAN, 4=Copy Internet, 5=Show QR, 6=Show Logs, 7=Check Updates, 8=sep, 9=startup, 10=sep, 11=PIN, 12=exit
    systrayInstance = new SysTray({
        menu: {
            icon: loadIcon(),
            title: '',
            tooltip: `${serviceName} - Port ${port}`,
            items: [
                {
                    title: `${serviceName} v${packageJson.version}`,
                    tooltip: 'Bolo PC Server',
                    enabled: false,
                    checked: false
                },
                {
                    title: `LAN: ${lanAddr}`,
                    tooltip: 'Local network address',
                    enabled: false,
                    checked: false
                },
                { title: '-------------', enabled: false, checked: false },
                {
                    title: 'Copy LAN address',
                    tooltip: 'Copy LAN address to clipboard',
                    checked: false,
                    enabled: true
                },
                {
                    title: tunnelUrl ? 'Copy Internet URL' : 'Internet: starting...',
                    tooltip: tunnelUrl || 'Cloudflare tunnel starting...',
                    checked: false,
                    enabled: !!tunnelUrl
                },
                {
                    title: 'Show QR Code',
                    tooltip: 'Show QR code for phone pairing',
                    checked: false,
                    enabled: true
                },
                {
                    title: 'Show Logs',
                    tooltip: 'Toggle the console window to view debug logs',
                    checked: false,
                    enabled: true
                },
                {
                    title: 'Check for Updates',
                    tooltip: 'Check for a newer PC Server build',
                    checked: false,
                    enabled: !!onCheckUpdates
                },
                { title: '-------------', enabled: false, checked: false },
                {
                    title: 'Start on boot',
                    tooltip: 'Launch Bolo when Windows starts',
                    checked: startupEnabled,
                    enabled: true
                },
                { title: '-------------', enabled: false, checked: false },
                {
                    title: 'Show Pairing PIN',
                    tooltip: 'Show the active 4-digit pairing PIN',
                    checked: false,
                    enabled: true
                },
                {
                    title: 'Exit',
                    tooltip: 'Stop Bolo PC Server',
                    checked: false,
                    enabled: true
                }
            ]
        },
        debug: false,
        copyDir: true
    });

    systrayInstance.onClick(action => {
        switch (action.seq_id) {
            case 3: {
                // Copy LAN address
                copyToClipboard(`ws://${lanAddr}`);
                console.log(`[Clip] Copied LAN address: ws://${lanAddr}`);
                break;
            }
            case 4: {
                // Copy Internet URL
                const url = currentTunnelUrl || tunnelUrl;
                if (url) {
                    const wsUrl = url.replace('https://', 'wss://');
                    copyToClipboard(wsUrl);
                    console.log(`[Clip] Copied Internet URL: ${wsUrl}`);
                }
                break;
            }
            case 5: {
                // Show QR Code
                showQRCode(port);
                break;
            }
            case 6: {
                // Open Logs
                const index = require('./index.js');
                index.openLogs();
                break;
            }
            case 7: {
                if (onCheckUpdates) {
                    onCheckUpdates();
                }
                break;
            }
            case 9: {
                // Toggle startup
                const currentlyEnabled = isStartupEnabled();
                if (currentlyEnabled) {
                    disableStartup();
                } else {
                    enableStartup();
                }
                
                systrayInstance.sendAction({
                    type: 'update-item',
                    item: {
                        ...action.item,
                        checked: !currentlyEnabled
                    },
                    seq_id: action.seq_id,
                });
                
                const { loadSettings, saveSettings } = require('./settings');
                const settings = loadSettings();
                settings.startOnBoot = !currentlyEnabled;
                saveSettings(settings);
                break;
            }
            case 11: {
                // Show Pairing PIN
                showPairingPin();
                break;
            }
            case 12: {
                console.log('[Sys] Exiting Bolo PC Server...');
                stopTray();
                process.exit(0);
                break;
            }
        }
    });

    console.log('[Bell] System tray icon active');
}

let currentTunnelUrl = null;

/**
 * Update the tray to show the tunnel URL once it's ready.
 */
function updateTunnelUrl(url) {
    currentTunnelUrl = url;
    if (systrayInstance && url) {
        systrayInstance.sendAction({
            type: 'update-item',
            item: {
                title: 'Copy Internet URL',
                tooltip: url,
                checked: false,
                enabled: true
            },
            seq_id: 4
        });
    }
}

function stopTray() {
    if (systrayInstance) {
        systrayInstance.kill(false);
        systrayInstance = null;
    }
}

/**
 * Copy text to clipboard using PowerShell.
 */
function copyToClipboard(text) {
    try {
        const { execSync } = require('child_process');
        execSync(`powershell -NoProfile -WindowStyle Hidden -Command "Set-Clipboard -Value '${text.replace(/'/g, "''")}';"`,
            { windowsHide: true }
        );
    } catch (e) {
        console.warn('Failed to copy to clipboard:', e.message);
    }
}

/**
 * Show QR code in a native Windows popup window.
 */
async function showQRCode(port) {
    try {
        const localIPs = getLocalIPs();
        const pairingData = {
            name: getServiceName(),
            port: port,
            ips: localIPs,
            wan: currentTunnelUrl ? currentTunnelUrl.replace('https://', 'wss://') : null,
            token: authManager.getMasterToken(),
            ...require('./presence').getPairingPresenceData()
        };

        // Generate QR as PNG file
        const qrPngPath = path.join(APP_DIR, 'qr.png');
        if (!fs.existsSync(APP_DIR)) fs.mkdirSync(APP_DIR, { recursive: true });
        await QRCode.toFile(qrPngPath, JSON.stringify(pairingData), {
            width: 300,
            margin: 2,
            color: { dark: '#00BFA5', light: '#0F1419' }
        });

        // Build info text
        const lanLines = localIPs.map(ip => `LAN: ws://${ip}:${port}`).join('\\\\n');
        const wanLine = pairingData.wan ? `Internet: ${pairingData.wan}` : '';
        const infoText = `${lanLines}${wanLine ? '\\\\n' + wanLine : ''}`;

        // Show in a native WinForms window via PowerShell
        const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Bolo Pairing'
$form.Size = New-Object System.Drawing.Size(380, 520)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.TopMost = $true
$form.BackColor = [System.Drawing.ColorTranslator]::FromHtml('#0F1419')
$title = New-Object System.Windows.Forms.Label
$title.Text = 'Scan from Bolo App'
$title.ForeColor = [System.Drawing.ColorTranslator]::FromHtml('#00BFA5')
$title.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(60, 15)
$form.Controls.Add($title)
$img = [System.Drawing.Image]::FromFile('${qrPngPath.replace(/\\/g, '\\\\')}')
$pic = New-Object System.Windows.Forms.PictureBox
$pic.Image = $img
$pic.SizeMode = 'CenterImage'
$pic.Size = New-Object System.Drawing.Size(320, 320)
$pic.Location = New-Object System.Drawing.Point(20, 50)
$form.Controls.Add($pic)
$info = New-Object System.Windows.Forms.Label
$info.Text = '${infoText}'
$info.ForeColor = [System.Drawing.ColorTranslator]::FromHtml('#64FFDA')
$info.Font = New-Object System.Drawing.Font('Consolas', 9)
$info.AutoSize = $true
$info.Location = New-Object System.Drawing.Point(20, 380)
$form.Controls.Add($info)
$hint = New-Object System.Windows.Forms.Label
$hint.Text = 'PC Mode > Scan QR Code'
$hint.ForeColor = [System.Drawing.ColorTranslator]::FromHtml('#6B7280')
$hint.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$hint.AutoSize = $true
$hint.Location = New-Object System.Drawing.Point(100, 460)
$form.Controls.Add($hint)
$form.ShowDialog()
$img.Dispose()
`;

        // Write PowerShell script to file (avoids escaping hell)
        const psPath = path.join(APP_DIR, 'show_qr.ps1');
        fs.writeFileSync(psPath, psScript, 'utf8');

        const { exec } = require('child_process');
        exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`,
            { windowsHide: true }
        );
        console.log('[Phone] QR code window opened');
    } catch (e) {
        console.error('Failed to show QR code:', e.message);
    }
}

/**
 * Show the active pairing PIN using a native Windows message box.
 */
function showPairingPin() {
    try {
        const pin = authManager.getCurrentOtp();
        if (!pin) {
            const { exec } = require('child_process');
            exec(`powershell -NoProfile -WindowStyle Hidden -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('There is no active pairing request right now. Try connecting from your phone first.', 'Bolo', 'OK', 'Information')"`, { windowsHide: true });
            return;
        }

        const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Bolo Pairing PIN'
$form.Size = New-Object System.Drawing.Size(300, 200)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.TopMost = $true
$form.BackColor = [System.Drawing.ColorTranslator]::FromHtml('#0F1419')
$title = New-Object System.Windows.Forms.Label
$title.Text = 'Pairing PIN'
$title.ForeColor = [System.Drawing.ColorTranslator]::FromHtml('#00BFA5')
$title.Font = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(95, 20)
$form.Controls.Add($title)
$pinLabel = New-Object System.Windows.Forms.Label
$pinLabel.Text = '${pin}'
$pinLabel.ForeColor = [System.Drawing.ColorTranslator]::FromHtml('#FFFFFF')
$pinLabel.Font = New-Object System.Drawing.Font('Consolas', 36, [System.Drawing.FontStyle]::Bold)
$pinLabel.AutoSize = $true
$pinLabel.Location = New-Object System.Drawing.Point(80, 50)
$form.Controls.Add($pinLabel)
$hint = New-Object System.Windows.Forms.Label
$hint.Text = 'Enter this code on your phone'
$hint.ForeColor = [System.Drawing.ColorTranslator]::FromHtml('#6B7280')
$hint.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$hint.AutoSize = $true
$hint.Location = New-Object System.Drawing.Point(55, 120)
$form.Controls.Add($hint)
$form.Add_Shown({$form.Activate()})
[void]$form.ShowDialog()
`;
        const psPath = path.join(APP_DIR, 'show_pin.ps1');
        fs.writeFileSync(psPath, psScript, 'utf8');
        const { exec } = require('child_process');
        module.exports.activePinProcess = exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`, { windowsHide: true });
        console.log('[Phone] PIN window opened');
    } catch (e) {
        console.warn('Failed to show PIN popup:', e.message);
    }
}

function hidePairingPin() {
    try {
        const { exec } = require('child_process');
        exec('taskkill /F /FI "WINDOWTITLE eq Bolo Pairing PIN" /T', { windowsHide: true });
    } catch (e) {}

    if (module.exports.activePinProcess) {
        try {
            module.exports.activePinProcess.kill();
        } catch (e) {}
        module.exports.activePinProcess = null;
    }
}

function showPairingSuccess() {
    hidePairingPin();
    try {
        const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Bolo'
$form.Size = New-Object System.Drawing.Size(300, 150)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.TopMost = $true
$form.BackColor = [System.Drawing.ColorTranslator]::FromHtml('#0F1419')
$title = New-Object System.Windows.Forms.Label
$title.Text = 'Pairing Successful!'
$title.ForeColor = [System.Drawing.ColorTranslator]::FromHtml('#00BFA5')
$title.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(55, 40)
$form.Controls.Add($title)
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.add_Tick({ $form.Close() })
$timer.Start()
$form.Add_Shown({$form.Activate()})
[void]$form.ShowDialog()
`;
        const psPath = path.join(APP_DIR, 'show_success.ps1');
        const fs = require('fs');
        fs.writeFileSync(psPath, psScript, 'utf8');
        const { exec } = require('child_process');
        exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`, { windowsHide: true });
    } catch (e) {
        console.warn('Failed to show success popup:', e.message);
    }
}

function getLocalIPs() {
    return require('./discovery').getLocalIPs();
}

module.exports = { startTray, stopTray, updateTunnelUrl, showQRCode, showPairingPin, showPairingSuccess };
