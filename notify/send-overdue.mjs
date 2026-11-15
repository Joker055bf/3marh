#!/usr/bin/env node
// Daily late-payment notifications. Run by GitHub Actions every morning
// (.github/workflows/overdue-notifications.yml), or by hand:
//   node notify/send-overdue.mjs --key path/to/service-account.json --dry-run   (shows what would be sent)
//   node notify/send-overdue.mjs --key path/to/service-account.json             (sends)
// In GitHub Actions the key comes from the FIREBASE_SERVICE_ACCOUNT secret.
//
// For every owner: find late payments, then send one notification to each device in
// users/{ownerId}/pushTokens — owners see everything; workers only if allowed to see alerts,
// and only for their allowed buildings/units. Dead device addresses are removed.

import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { findOverduePayments, cleanFlatNo } from './overdue.mjs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const keyIndex = args.indexOf('--key');
const SITE_URL = 'https://joker055bf.github.io/3marh/';

const serviceAccount = keyIndex >= 0
  ? JSON.parse(readFileSync(args[keyIndex + 1], 'utf8'))
  : process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : null;
if (!serviceAccount) {
  console.error('No credentials: pass --key <service-account.json> or set FIREBASE_SERVICE_ACCOUNT.');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const messaging = admin.messaging();

const formatAmount = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

const visibleTo = (overdue, account) => {
  if (!account || account.role === 'owner') return overdue;
  const perms = account.permissions || {};
  if (!perms.canViewAlerts) return [];
  const buildings = Array.isArray(perms.allowedBuildings) && perms.allowedBuildings.length ? perms.allowedBuildings : null;
  return overdue.filter(p => {
    if (buildings && !buildings.includes(p.building)) return false;
    const units = perms.allowedUnits?.[p.building];
    if (Array.isArray(units) && units.length && !units.some(u => cleanFlatNo(u) === p.flatNo)) return false;
    return true;
  });
};

const buildMessage = (items) => {
  const total = items.reduce((s, p) => s + p.remaining, 0);
  const byBuilding = new Map();
  for (const p of items) byBuilding.set(p.building, (byBuilding.get(p.building) || 0) + 1);
  const title = items.length === 1 ? 'دفعة متأخرة' : `${items.length} دفعات متأخرة`;
  let body;
  if (items.length === 1) {
    const p = items[0];
    body = `${p.tenantName || 'مستأجر'} — ${p.building}، وحدة ${p.flatNo}: متبقي ${formatAmount(p.remaining)} ر.س`;
  } else {
    const parts = [...byBuilding].map(([b, n]) => `${b} (${n})`).join('، ');
    body = `الإجمالي المتبقي ${formatAmount(total)} ر.س — ${parts}`;
  }
  const url = byBuilding.size === 1
    ? `${SITE_URL}${encodeURIComponent([...byBuilding.keys()][0])}?modal=alerts`
    : SITE_URL;
  return { title, body, url };
};

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (nothing sent)' : 'SEND'}`);
  const ownerRefs = (await db.collection('users').listDocuments()).filter(r => r.id !== 'global_system');
  let sent = 0, removed = 0, ownersWithOverdue = 0;

  for (const ownerRef of ownerRefs) {
    const ownerId = ownerRef.id;
    const tokensSnap = await ownerRef.collection('pushTokens').get();
    const ownerDoc = (await ownerRef.get()).data();
    if (!ownerDoc) continue;
    const overdue = findOverduePayments(ownerId, ownerDoc);
    if (overdue.length) ownersWithOverdue++;
    if (tokensSnap.empty || !overdue.length) {
      if (overdue.length) console.log(`  ${ownerId}: ${overdue.length} late, no devices registered`);
      continue;
    }

    const accounts = new Map();
    for (const t of tokensSnap.docs) {
      const uid = t.get('uid');
      if (uid && !accounts.has(uid)) {
        const acc = await db.doc(`accounts/${uid}`).get();
        accounts.set(uid, acc.exists ? acc.data() : null);
      }
    }

    for (const t of tokensSnap.docs) {
      const account = accounts.get(t.get('uid'));
      if (!account || account.ownerId !== ownerId) { // account removed or moved: forget this device
        if (!DRY_RUN) await t.ref.delete();
        removed++;
        continue;
      }
      const items = visibleTo(overdue, account);
      if (!items.length) continue;
      const msg = buildMessage(items);
      console.log(`  ${ownerId} → ${account.role} ${account.username}: ${msg.title} | ${msg.body}`);
      if (DRY_RUN) continue;
      try {
        await messaging.send({
          token: t.id,
          data: { title: msg.title, body: msg.body, url: msg.url, tag: `overdue-${ownerId}` },
          webpush: { headers: { Urgency: 'high', TTL: String(12 * 3600) } },
        });
        sent++;
      } catch (err) {
        const code = err?.errorInfo?.code || err?.code || '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token') || code.includes('invalid-argument')) {
          await t.ref.delete();
          removed++;
        } else {
          console.error(`  send failed for ${ownerId}/${account.username}: ${code || err.message}`);
        }
      }
    }
  }
  console.log(`Done. Owners with late payments: ${ownersWithOverdue}. Notifications sent: ${sent}. Dead devices removed: ${removed}.`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
