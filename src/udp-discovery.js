const dgram = require('dgram');
const { getServiceName } = require('./settings');
const { getLocalIPs } = require('./discovery');

let server = null;

/**
 * Starts a UDP server listening for discovery probes from the Android app.
 * When a probe "BoloProbe" is received, it replies directly with the PC name and port.
 */
function startUdpDiscovery(wsPort) {
    try {
        server = dgram.createSocket('udp4');
        
        server.on('message', (msg, rinfo) => {
            if (msg.toString() === 'BoloProbe') {
                const { getTunnelUrl } = require('./tunnel');
                let tunnelUrl = getTunnelUrl();
                let wanUrl = tunnelUrl ? tunnelUrl.replace('https://', 'wss://') : null;
                
                const reply = JSON.stringify({
                    bolo: true,
                    name: getServiceName(),
                    port: wsPort,
                    ips: getLocalIPs(),
                    wan: wanUrl,
                    serverId: require('./presence').getPairingPresenceData().serverId
                });
                server.send(reply, rinfo.port, rinfo.address, (err) => {
                    if (err && err.code !== 'ENETUNREACH') console.error('UDP reply error:', err.message);
                });
            }
        });

        server.on('error', (err) => {
            console.warn(`[WARN] UDP Discovery error: ${err.message}`);
            if (server) server.close();
        });

        server.on('listening', () => {
            console.log('[Net] UDP Discovery (Fallback): listening on port 57433');
        });

        // Bind non-exclusively so multiple users on the same PC can listen to broadcasts
        server.bind({ port: 57433, exclusive: false });
    } catch (e) {
        console.warn('[WARN] Failed to start UDP discovery:', e.message);
    }
}

function stopUdpDiscovery() {
    if (server) {
        try {
            server.close();
        } catch (e) {}
        server = null;
    }
}

module.exports = { startUdpDiscovery, stopUdpDiscovery };

