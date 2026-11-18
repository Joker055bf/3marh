#!/usr/bin/env node
// Sets a new password for one account (for users without an email who forgot their password).
//   node scripts/reset-password.mjs --key path/to/service-account.json --username ali --password NewPass123
// The user signs in with the new password and can change it from Settings.
import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const username = option('--username');
const password = option('--password');
const keyPath = option('--key');

if (!username || !password || (!keyPath && !args.includes('--emulator'))) {
  console.error('Usage: node scripts/reset-password.mjs --key <service-account.json> --username <name> --password <new password>');
  process.exit(1);
}
if (password.length < 6) {
  console.error('The new password must be at least 6 characters.');
  process.exit(1);
}

if (args.includes('--emulator')) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
  admin.initializeApp({ projectId: 'marh-6ccfc' });
} else {
  const key = JSON.parse(readFileSync(keyPath, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id });
}

const snap = await admin.firestore().doc(`usernames/${username.trim().toLowerCase()}`).get();
if (!snap.exists || !snap.get('uid') || snap.get('reserved')) {
  console.error(`No account found for username "${username}".`);
  process.exit(1);
}
await admin.auth().updateUser(snap.get('uid'), { password });
console.log(`Password updated for "${username}".`);
process.exit(0);
