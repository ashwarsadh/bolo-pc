/**
 * mDNS Service Advertisement
 * Advertises the Bolo PC server on the local network so the phone app
 * can discover it automatically without manual IP entry.
 * Uses hostname + username for unique identity (multi-user safe).
 */

const { Bonjour } = require('bonjour-service');
const os = require('os');
const { getServiceName } = require('./settings');
const { getPairingPresenceData } = require('./presence');

const SERVICE_TYPE = 'bolo';

let bonjourInstance = null;
let publishedService = null;

/**
 * Start advertising the Bolo service on the local network.
 * @param {number} port - The port the WebSocket server is listening on.
 */
function startAdvertising(port) {
    const serviceName = getServiceName();
    bonjourInstance = new Bonjour();

    publishedService = bonjourInstance.publish({
        name: serviceName,
        type: SERVICE_TYPE,
        port: port,
        txt: {
            hostname: os.hostname(),
            username: os.userInfo().username,
            version: '2',
            serverId: getPairingPresenceData().serverId
        }
    });

    const addresses = getLocalIPs();
    console.log(`[Net] mDNS: Advertising "${serviceName}" on port ${port}`);
    console.log(`   Local IPs: ${addresses.join(', ')}`);
}

/**
 * Stop advertising and clean up.
 */
function stopAdvertising() {
    if (publishedService) {
        publishedService.stop(() => {
            console.log('[Net] mDNS: Stopped advertising');
        });
    }
    if (bonjourInstance) {
        bonjourInstance.destroy();
    }
}

/**
 * Get all non-internal IPv4 addresses, sorted: 192.168.x first, then 10.x, then others (Tailscale etc).
 */
function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
        // Filter out virtual adapters (WSL, VirtualBox, VMware, Hyper-V)
        const lowerName = name.toLowerCase();
        if (lowerName.includes('virtual') || lowerName.includes('wsl') || 
            lowerName.includes('vmware') || lowerName.includes('vethernet') || 
            lowerName.includes('hyper-v')) {
            continue;
        }

        for (const iface of interfaces[name]) {
            if (!iface.internal) {
                if (iface.family === 'IPv4' || iface.family === 4) {
                    if (!iface.address.startsWith('169.254.')) {
                        addresses.push(iface.address);
                    }
                } else if ((iface.family === 'IPv6' || iface.family === 6) && !iface.address.startsWith('fe80:')) {
                    addresses.push(`[${iface.address}]`);
                }
            }
        }
    }
    // Sort: 192.168.x first (home Wi-Fi), then 10.x, then 100.x (Tailscale) last
    addresses.sort((a, b) => {
        const score = (ip) => {
            if (ip.startsWith('192.168.')) return 0;
            if (ip.startsWith('10.')) return 1;
            if (ip.startsWith('172.')) return 2;
            return 3; // 100.x (Tailscale), others
        };
        return score(a) - score(b);
    });
    return addresses;
}

module.exports = { startAdvertising, stopAdvertising, getLocalIPs };

