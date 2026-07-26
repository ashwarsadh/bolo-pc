/**
 * WebSocket Server
 * Handles connections from the Bolo Android app and processes
 * incoming text messages by typing them at the cursor position.
 */

const { WebSocketServer } = require('ws');
const os = require('os');
const authManager = require('./auth');
const { typeAtCursor, replaceTypedText } = require('./typer');
const { getServiceName } = require('./settings');

let clipboardHistory = [];

/**
 * Create a WebSocket server attached to an existing HTTP server.
 * @param {http.Server} httpServer - The HTTP server to attach to.
 * @returns {WebSocketServer} The WebSocket server instance.
 */
function createServer(httpServer) {
    const wss = new WebSocketServer({ server: httpServer });

    // Poll clipboard every 2 seconds
    const clipInterval = setInterval(() => {
        try {
            const { exec } = require('child_process');
            exec('powershell -NoProfile -WindowStyle Hidden -Command "Get-Clipboard"', { windowsHide: true }, (err, stdout) => {
                if (err) return;
                const text = stdout.replace(/\r\n$/, '');
                if (text && text.trim().length > 0 && (!clipboardHistory.length || clipboardHistory[0] !== text)) {
                    clipboardHistory.unshift(text);
                    if (clipboardHistory.length > 10) clipboardHistory.pop();
                    
                    wss.clients.forEach(ws => {
                        if (ws.isAuthenticated && ws.readyState === 1) {
                            ws.send(JSON.stringify({
                                type: 'clipboard_history',
                                items: clipboardHistory
                            }));
                        }
                    });
                }
            });
        } catch (e) {}
    }, 2000);

    const interval = setInterval(() => {
        wss.clients.forEach(ws => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 15000); // Check every 15s

    wss.on('close', () => {
        clearInterval(interval);
        clearInterval(clipInterval);
    });

    wss.on('connection', (ws, req) => {
        const clientIP = req.socket.remoteAddress;
        console.log(`\n[Phone] Connected from ${clientIP}`);

        ws.isAlive = true;
        ws.isAuthenticated = false; // Add auth state to socket
        ws.realtimePreview = '';

        ws.on('pong', () => {
            ws.isAlive = true;
        });

        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                
                // Unauthenticated routes
                if (message.type === 'pair_request') {
                    const token = message.token;
                    if (authManager.isTokenTrusted(token)) {
                        ws.isAuthenticated = true;
                        sendHello(ws);
                    } else {
                        const pin = authManager.generateOtp();
                        console.log(`[Key] Phone requesting to pair. PIN: ${pin}`);
                        try {
                            const { showPairingPin } = require('./tray');
                            showPairingPin();
                        } catch (e) {
                            console.warn('Failed to trigger PIN popup:', e.message);
                        }
                        ws.send(JSON.stringify({ type: 'auth_required' }));
                    }
                    return;
                }
                
                if (message.type === 'auth') {
                    if (authManager.verifyOtp(message.pin)) {
                        ws.isAuthenticated = true;
                        const newToken = authManager.generateDeviceToken();
                        authManager.addTrustedToken(newToken);
                        try {
                            const { showPairingSuccess } = require('./tray');
                            showPairingSuccess();
                        } catch (e) {}
                        ws.send(JSON.stringify({ type: 'auth_success', token: newToken }));
                        sendHello(ws);
                    } else {
                        // Keep the socket and OTP alive so the phone can correct the PIN in place.
                        ws.send(JSON.stringify({ type: 'error', message: 'Invalid PIN. Check the code and try again.' }));
                    }
                    return;
                }

                // If not authenticated, reject other messages
                if (!ws.isAuthenticated) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
                    return;
                }

                await handleMessage(ws, message);
            } catch (error) {
                console.error('[ERR] Failed to parse message:', error.message);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid message format'
                }));
            }
        });

        ws.on('close', () => {
            console.log('[Phone] Disconnected');
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error.message);
        });
    });

    return wss;
}

function sendHello(ws) {
    const { getTunnelUrl } = require('./tunnel');
    const wan = getTunnelUrl();
    const wanWss = wan ? wan.replace('https://', 'wss://') : null;

    const presence = require('./presence').getPairingPresenceData();
    ws.send(JSON.stringify({
        type: 'hello',
        hostname: os.hostname(),
        username: os.userInfo().username,
        name: getServiceName(),
        version: 10,
        wan: wanWss,
        ...presence
    }));

    ws.send(JSON.stringify({
        type: 'clipboard_history',
        items: clipboardHistory
    }));


    // Close the QR code window if it's open
    try {
        require('child_process').exec('taskkill /F /FI "WINDOWTITLE eq Bolo Pairing" /T', { windowsHide: true });
    } catch (e) {
        // Ignore errors if window is not found
    }
}

/**
 * Handle incoming authenticated messages from the phone.
 */
async function handleMessage(ws, message) {
    switch (message.type) {
        case 'text': {
            ws.realtimePreview = '';
            const text = message.content;
            if (!text || text.trim().length === 0) {
                ws.send(JSON.stringify({ type: 'ack', status: 'empty' }));
                return;
            }

            console.log(`[Text] Received ${text.length} chars`);

            const success = await typeAtCursor(text);
            ws.send(JSON.stringify({
                type: 'ack',
                status: success ? 'typed' : 'failed'
            }));
            break;
        }

        case 'realtime_text': {
            const text = typeof message.text === 'string' ? message.text : '';
            const final = !!message.final;
            const previousText = ws.realtimePreview || '';

            console.log(`[Realtime] ${final ? 'final' : 'partial'} ${text.length} chars`);

            const success = await replaceTypedText(previousText, text);
            if (success) {
                ws.realtimePreview = final ? '' : text;
            }
            ws.send(JSON.stringify({
                type: 'ack',
                status: success ? (final ? 'realtime_final' : 'realtime_partial') : 'failed'
            }));
            break;
        }

        case 'ping': {
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
        }

        case 'clipboard_paste': {
            const text = message.text;
            if (text && text.trim().length > 0) {
                console.log(`[Clip] Received ${text.length} clipboard chars`);
                try {
                    const success = await typeAtCursor(text);
                    ws.send(JSON.stringify({ type: 'ack', status: success ? 'typed' : 'failed' }));
                } catch (e) {
                    ws.send(JSON.stringify({ type: 'ack', status: 'failed' }));
                }
            }
            break;
        }

        case 'update':
            ws.send(JSON.stringify({ type: 'ack', status: 'ignored' }));
            break;

        default:
            console.log(`[WARN] Unknown message type: ${message.type}`);
            break;
    }
}

module.exports = { createServer };
