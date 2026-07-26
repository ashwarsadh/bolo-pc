const crypto = require('crypto');
const https = require('https');
const { loadSettings, saveSettings, getServiceName } = require('./settings');

const PRESENCE_BASE_URL = (process.env.BOLO_PRESENCE_BASE_URL || 'https://bolo.kkfashionexports.com').replace(/\/$/, '');
const HEARTBEAT_MS = 45000;
const PRESENCE_TTL_MS = 150000;

let heartbeatTimer = null;
let currentTunnelUrl = null;
let currentVersion = null;
let bootId = crypto.randomUUID();

function ensureIdentity() {
    const settings = loadSettings();
    const saved = settings.presenceIdentity;
    if (saved?.privateKey && saved?.publicKey && saved?.lookupToken && saved?.serverId) {
        return saved;
    }

    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
    const identity = {
        serverId: crypto.createHash('sha256').update(publicKeyDer).digest('hex'),
        publicKey: publicKeyDer.toString('base64'),
        privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
        lookupToken: crypto.randomBytes(32).toString('base64url')
    };
    settings.presenceIdentity = identity;
    saveSettings(settings);
    return identity;
}

function getPairingPresenceData() {
    const identity = ensureIdentity();
    return {
        serverId: identity.serverId,
        presencePublicKey: identity.publicKey,
        presenceLookupToken: identity.lookupToken
    };
}

function canonicalPresencePayload(record) {
    return [
        record.serverId,
        record.tunnelUrl,
        record.displayName,
        record.appVersion,
        record.bootId,
        String(record.reportedAt),
        String(record.expiresAt),
        record.lookupTokenHash
    ].join('\n');
}

function createSignedPresence(tunnelUrl, version, now = Date.now()) {
    const identity = ensureIdentity();
    const record = {
        serverId: identity.serverId,
        publicKey: identity.publicKey,
        lookupTokenHash: crypto.createHash('sha256').update(identity.lookupToken).digest('hex'),
        tunnelUrl: String(tunnelUrl).replace(/^https:/, 'wss:'),
        displayName: getServiceName(),
        appVersion: String(version),
        bootId,
        reportedAt: now,
        expiresAt: now + PRESENCE_TTL_MS
    };
    record.signature = crypto.sign(
        'sha256',
        Buffer.from(canonicalPresencePayload(record), 'utf8'),
        identity.privateKey
    ).toString('base64');
    return record;
}

async function publishPresence() {
    if (!currentTunnelUrl || !currentVersion) return false;
    const record = createSignedPresence(currentTunnelUrl, currentVersion);
    const body = Buffer.from(JSON.stringify(record));
    const target = new URL('/v1/pc/presence', PRESENCE_BASE_URL);
    return new Promise((resolve) => {
        const req = https.request(target, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'content-length': body.length,
                'user-agent': `Bolo-PC/${currentVersion}`
            },
            timeout: 10000
        }, (res) => {
            res.resume();
            if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log(`[Cloud] Presence refreshed; expires in ${Math.round(PRESENCE_TTL_MS / 1000)}s`);
                resolve(true);
            } else {
                console.warn(`[Cloud] Presence refresh rejected (${res.statusCode})`);
                resolve(false);
            }
        });
        req.on('timeout', () => req.destroy(new Error('presence request timed out')));
        req.on('error', (error) => {
            console.warn('[Cloud] Presence refresh failed:', error.message);
            resolve(false);
        });
        req.end(body);
    });
}

function startPresencePublishing(tunnelUrl, version) {
    currentTunnelUrl = tunnelUrl;
    currentVersion = version;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    publishPresence();
    heartbeatTimer = setInterval(publishPresence, HEARTBEAT_MS);
    heartbeatTimer.unref?.();
}

function stopPresencePublishing() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    currentTunnelUrl = null;
}

module.exports = {
    canonicalPresencePayload,
    createSignedPresence,
    ensureIdentity,
    getPairingPresenceData,
    startPresencePublishing,
    stopPresencePublishing
};
