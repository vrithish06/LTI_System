#!/usr/bin/env node
/**
 * Generate LTI RSA Key Pair
 *
 * Run once at setup time:
 *   node scripts/generate-lti-keys.mjs
 *
 * Outputs the private and public key PEM strings to paste into your .env file.
 * Keep the private key SECRET — never commit it to git.
 */
import { generateKeyPairSync } from 'crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Collapse to single-line for easy .env storage
const toEnvValue = (pem) => pem.replace(/\n/g, '\\n');

console.log('\n========================================');
console.log('🔑 LTI RSA Key Pair Generated');
console.log('========================================\n');
console.log('Add these to your backend/.env file:\n');
console.log(`LTI_PRIVATE_KEY_PEM="${toEnvValue(privateKey)}"`);
console.log(`LTI_PUBLIC_KEY_PEM="${toEnvValue(publicKey)}"`);
console.log(`LTI_KEY_ID="lti-tool-key-1"`);
console.log('\n⚠️  Keep LTI_PRIVATE_KEY_PEM secret — never commit it to git!');
console.log('📋  Share LTI_PUBLIC_KEY_PEM (or use GET /api/lti/jwks) with LMS admins.\n');
