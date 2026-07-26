const assert = require('assert');
const crypto = require('crypto');
const { createSignedPresence, canonicalPresencePayload } = require('../src/presence');

const record = createSignedPresence('https://test-tunnel.trycloudflare.com', 'test');
const publicKey = crypto.createPublicKey({
    key: Buffer.from(record.publicKey, 'base64'),
    format: 'der',
    type: 'spki'
});
assert.equal(record.serverId, crypto.createHash('sha256').update(Buffer.from(record.publicKey, 'base64')).digest('hex'));
assert.equal(crypto.verify('sha256', Buffer.from(canonicalPresencePayload(record)), publicKey, Buffer.from(record.signature, 'base64')), true);
assert.equal(record.tunnelUrl, 'wss://test-tunnel.trycloudflare.com');
console.log('PC presence signing test passed');
