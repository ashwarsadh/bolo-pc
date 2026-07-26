const crypto = require('crypto');
const { loadSettings, saveSettings } = require('./settings');

class AuthManager {
    constructor() {
        this.currentOtp = null;
    }

    /**
     * Generate a random 4-digit OTP, or return the current one if it exists.
     */
    generateOtp() {
        if (!this.currentOtp) {
            this.currentOtp = Math.floor(1000 + Math.random() * 9000).toString();
            
            // Auto clear after 2 minutes to prevent stale PINs
            if (this.clearTimer) clearTimeout(this.clearTimer);
            this.clearTimer = setTimeout(() => {
                this.currentOtp = null;
            }, 120000);
        }
        return this.currentOtp;
    }

    /**
     * Get the current OTP if it exists.
     */
    getCurrentOtp() {
        return this.currentOtp;
    }

    /**
     * Verify an OTP.
     * @param {string} otp The OTP provided by the client.
     */
    verifyOtp(otp) {
        if (!this.currentOtp || !otp) return false;
        if (this.currentOtp === otp.toString().trim()) {
            this.currentOtp = null; // Single use
            return true;
        }
        return false;
    }

    /**
     * Clear the current OTP.
     */
    clearOtp() {
        this.currentOtp = null;
    }

    /**
     * Generate a long-lived secure token for a trusted device.
     */
    generateDeviceToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Add a device token to the trusted list.
     */
    addTrustedToken(token) {
        const settings = loadSettings();
        if (!settings.trustedTokens) {
            settings.trustedTokens = [];
        }
        if (!settings.trustedTokens.includes(token)) {
            settings.trustedTokens.push(token);
            saveSettings(settings);
        }
    }

    /**
     * Verify if a token is trusted.
     */
    isTokenTrusted(token) {
        if (!token) return false;
        const settings = loadSettings();
        return settings.trustedTokens && settings.trustedTokens.includes(token);
    }

    /**
     * Get a master pairing token for QR codes. Generates one if none exists.
     */
    getMasterToken() {
        const settings = loadSettings();
        if (!settings.trustedTokens || settings.trustedTokens.length === 0) {
            this.addTrustedToken(this.generateDeviceToken());
        }
        const updatedSettings = loadSettings();
        return updatedSettings.trustedTokens[0];
    }
}

module.exports = new AuthManager();
