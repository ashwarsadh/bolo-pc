/**
 * Windows Firewall Management.
 * Ensures Node.js and mDNS traffic is allowed through the firewall.
 * Prompts for admin elevation on first run.
 */

const { execSync } = require('child_process');
const { loadSettings, saveSettings } = require('./settings');

const RULE_NAME_TCP = 'Bolo Server';
const RULE_NAME_MDNS = 'Bolo mDNS';
const RULE_NAME_UDP_DISC = 'Bolo UDP Discovery';

/**
 * Check if firewall rules exist and create them if not.
 * Only runs once (tracked in settings).
 */
function ensureFirewallRules() {
    // We used to manually open ports with netsh, which caused an Admin UAC prompt.
    // By removing this, we let Windows trigger its native "Windows Security Alert"
    // popup the first time Node binds to a port, which is much friendlier and
    // allows the user to grant access easily.
    const settings = loadSettings();
    if (!settings.firewallConfigured) {
        settings.firewallConfigured = true;
        saveSettings(settings);
    }
}

function hasRule(name) {
    try {
        const result = execSync(
            `netsh advfirewall firewall show rule name="${name}" dir=in 2>nul`,
            { encoding: 'utf8', windowsHide: true }
        );
        return result.includes(name);
    } catch (e) {
        return false;
    }
}

module.exports = { ensureFirewallRules };

