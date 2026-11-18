#!/usr/bin/env node
// One-time migration: moves the old plaintext user list (users/global_system -> rentals_global_users)
// into Firebase Authentication, keeping every user's username and password.
//
// Dry run (changes nothing, prints the plan):
//   node scripts/migrate-accounts.mjs --key path/to/service-account.json
// Apply:
//   node scripts/migrate-accounts.mjs --key path/to/service-account.json --apply
// Against the local emulators (for testing):
//   node scripts/migrate-accounts.mjs --emulator --apply
//
// What --apply does:
//   1. Creates a Firebase Auth login per user. Passwords are imported as bcrypt hashes, so old
//      passwords keep working even if shorter than Firebase's usual 6-character minimum.
//   2. Writes usernames/{username} and accounts/{uid} (see services/authService.ts).
//   3. Reserves every existing users/{ownerId} id and "global_system" so nobody can sign up as them.
//   4. Deletes the plaintext list and the *_delete_password fields (skip with --keep-legacy).
// Running it again is safe: users that already have a usernames/ entry are skipped.
// The script never prints passwords.

import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import admin from 'firebase-admin';
import bcrypt from 'bcryptjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const APPLY = flag('--apply');
const EMULATOR = flag('--emulator');
const KEEP_LEGACY = flag('--keep-legacy');
const PROJECT_ID = option('--project') || 'marh-6ccfc';
const KEY_PATH = option('--key');
const PLACEHOLDER_DOMAIN = 'noemail.marh-6ccfc.firebaseapp.com';

if (EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
  admin.initializeApp({ projectId: PROJECT_ID });
} else {
  if (!KEY_PATH) {
    console.error('Missing --key <service-account.json>. Download it from Firebase Console → Project settings → Service accounts.');
    process.exit(1);
  }
  const key = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id || PROJECT_ID });
}

const db = admin.firestore();
const authAdmin = admin.auth();
const FieldValue = admin.firestore.FieldValue;

const usernameKey = (u) => String(u).trim().toLowerCase();
const isValidUsername = (u) => {
  const t = String(u || '').trim();
  return !!t && !t.includes('/') && t !== '.' && t !== '..' && !/^__.*__$/.test(t) && t.length <= 100;
};
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
const newUid = () => randomBytes(14).toString('hex');
const placeholderEmail = () => `u-${randomBytes(10).toString('hex')}@${PLACEHOLDER_DOMAIN}`;

const log = (...a) => console.log(...a);

async function main() {
  log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN (nothing will be changed)'}${EMULATOR ? ' — emulator' : ''}`);

  const legacyDoc = await db.doc('users/global_system').get();
  let legacyUsers = legacyDoc.exists ? legacyDoc.get('rentals_global_users') : null;
  if (typeof legacyUsers === 'string') legacyUsers = JSON.parse(legacyUsers);
  if (!Array.isArray(legacyUsers)) legacyUsers = [];
  log(`Legacy users found: ${legacyUsers.length}`);

  const ownerDocs = await db.collection('users').listDocuments();
  const ownerIds = ownerDocs.map(d => d.id).filter(id => id !== 'global_system');
  log(`Owner data documents found: ${ownerIds.length}`);

  const seenKeys = new Set();
  const usedEmails = new Set();
  const plan = [];
  const problems = [];

  // The old list can hold the same username twice (e.g. an owner re-added after a password change).
  // Merge them: use the password that matches the owner's current stored password, and any email found.
  const groups = new Map();
  for (const u of legacyUsers) {
    const k = usernameKey(u?.username || '');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(u);
  }
  const merged = [];
  for (const [k, entries] of groups) {
    if (entries.length === 1) { merged.push(entries[0]); continue; }
    const first = entries[0];
    const ownerId = String(first.ownerId || first.username).trim();
    let current = null;
    if (first.role !== 'worker' && ownerIds.includes(ownerId)) {
      const stored = (await db.doc(`users/${ownerId}`).get()).get(`rentals_${ownerId}_delete_password`);
      current = entries.find(e => stored !== undefined && e.password === stored) || null;
    }
    const chosen = { ...(current || first) };
    chosen.email = chosen.email || entries.find(e => e.email)?.email;
    merged.push(chosen);
    problems.push(`merged ${entries.length} entries for "${chosen.username}" (password: ${current ? 'the current one' : 'first entry'}, email kept: ${chosen.email ? 'yes' : 'no'})`);
  }
  legacyUsers = merged;

  for (const u of legacyUsers) {
    const username = String(u?.username || '').trim();
    const key = usernameKey(username);
    if (!isValidUsername(username)) { problems.push(`skipped: invalid username "${username}"`); continue; }
    if (seenKeys.has(key)) { problems.push(`skipped: duplicate username "${username}" (first one kept)`); continue; }
    if (!u.password) { problems.push(`skipped: "${username}" has no password`); continue; }
    seenKeys.add(key);

    const existing = await db.doc(`usernames/${key}`).get();
    if (existing.exists) { log(`  = ${username}: already migrated, skipping`); continue; }

    const role = u.role === 'worker' ? 'worker' : 'owner';
    const ownerId = String(u.ownerId || username).trim();
    let authEmail = placeholderEmail();
    const email = String(u.email || '').trim();
    if (role === 'owner' && isValidEmail(email) && !usedEmails.has(email.toLowerCase())) {
      let inAuth = false;
      try { await authAdmin.getUserByEmail(email); inAuth = true; } catch {}
      if (!inAuth) { authEmail = email; usedEmails.add(email.toLowerCase()); }
      else problems.push(`note: "${username}" email already used by another login; using a placeholder sign-in email`);
    }
    if (role === 'worker' && !ownerIds.includes(ownerId) && !legacyUsers.some(x => x.role !== 'worker' && String(x.ownerId || x.username).trim() === ownerId)) {
      problems.push(`note: worker "${username}" points to owner "${ownerId}" which has no data document`);
    }

    plan.push({
      uid: newUid(), username, key, role, ownerId, authEmail,
      email: isValidEmail(email) ? email : null,
      password: String(u.password),
      workerName: u.workerName || null,
      permissions: u.permissions || null,
    });
  }

  const plannedKeys = new Set(plan.map(p => p.key));
  const reservations = [];
  for (const id of ['global_system', ...ownerIds]) {
    const key = usernameKey(id);
    if (!isValidUsername(id) || plannedKeys.has(key) || seenKeys.has(key)) continue;
    const existing = await db.doc(`usernames/${key}`).get();
    if (!existing.exists) reservations.push({ key, ownerId: id });
  }

  log('\nAccounts to create:');
  for (const p of plan) {
    log(`  + ${p.role.padEnd(6)} ${p.username}  (owner: ${p.ownerId}, reset by email: ${p.authEmail.endsWith(PLACEHOLDER_DOMAIN) ? 'no' : 'yes'})`);
  }
  if (reservations.length) {
    log('\nUsernames reserved (data exists but no matching login):');
    for (const r of reservations) log(`  # ${r.key}`);
  }
  if (problems.length) {
    log('\nNotes:');
    for (const m of problems) log(`  ! ${m}`);
  }

  if (!APPLY) {
    log('\nDry run finished. Re-run with --apply to make these changes.');
    return;
  }

  // 1. Firebase Auth logins (bcrypt-hashed passwords).
  if (plan.length && EMULATOR) {
    // The Auth emulator cannot verify real password hashes; it has a test-only rawPassword import.
    const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ users: plan.map(p => ({ localId: p.uid, email: p.authEmail, displayName: p.username, rawPassword: p.password })) }),
    });
    const body = await res.json();
    const errors = Array.isArray(body.error) ? body.error
      : body.error ? plan.map((_, index) => ({ index, message: JSON.stringify(body.error) })) : [];
    for (const e of errors) problems.push(`auth import failed for "${plan[e.index].username}": ${e.message}`);
  } else if (plan.length) {
    const records = plan.map(p => ({
      uid: p.uid,
      email: p.authEmail,
      displayName: p.username,
      passwordHash: Buffer.from(bcrypt.hashSync(p.password, 10)),
    }));
    for (let i = 0; i < records.length; i += 1000) {
      const res = await authAdmin.importUsers(records.slice(i, i + 1000), { hash: { algorithm: 'BCRYPT' } });
      if (res.failureCount > 0) {
        for (const e of res.errors) problems.push(`auth import failed for "${plan[i + e.index].username}": ${e.error.message}`);
      }
    }
  }
  const failed = new Set(problems.filter(m => m.startsWith('auth import failed')).map(m => m.match(/"(.*)"/)[1]));

  // 2. usernames/ and accounts/ records + reservations.
  const batch = db.batch();
  for (const p of plan) {
    if (failed.has(p.username)) continue;
    batch.set(db.doc(`usernames/${p.key}`), { uid: p.uid, ownerId: p.ownerId, role: p.role, authEmail: p.authEmail });
    const account = { username: p.username, role: p.role, ownerId: p.ownerId, email: p.email, createdAt: Date.now(), migrated: true };
    if (p.role === 'worker') { account.workerName = p.workerName; account.permissions = p.permissions; }
    batch.set(db.doc(`accounts/${p.uid}`), account);
  }
  for (const r of reservations) {
    batch.set(db.doc(`usernames/${r.key}`), { reserved: true, uid: 'reserved', ownerId: r.ownerId, role: 'reserved' });
  }
  await batch.commit();

  // 3. Remove plaintext passwords.
  if (!KEEP_LEGACY && failed.size === 0) {
    if (legacyDoc.exists) await db.doc('users/global_system').update({ rentals_global_users: FieldValue.delete() });
    for (const ref of ownerDocs) {
      if (ref.id === 'global_system') continue;
      const snap = await ref.get();
      const updates = {};
      for (const field of Object.keys(snap.data() || {})) {
        if (field.endsWith('_delete_password')) updates[field] = FieldValue.delete();
      }
      if (Object.keys(updates).length) await ref.update(updates);
    }
    log('\nPlaintext password list and stored passwords removed.');
  } else if (failed.size > 0) {
    log('\nSome logins failed, so the old list was kept. Fix the issues above and run again.');
  }

  log(`\nDone. Created ${plan.length - failed.size} logins, reserved ${reservations.length} usernames.`);
  for (const m of problems) log(`  ! ${m}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
