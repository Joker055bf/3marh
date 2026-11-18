#!/usr/bin/env node
// Daily payment & contract notifications. Run by GitHub Actions every morning
// (.github/workflows/overdue-notifications.yml), or by hand:
//   node notify/send-overdue.mjs --key path/to/service-account.json --dry-run   (shows what would be sent)
//   node notify/send-overdue.mjs --key path/to/service-account.json             (sends)
// In GitHub Actions the key comes from the FIREBASE_SERVICE_ACCOUNT secret.
//
// Per device (users/{ownerId}/pushTokens/{token}) up to four notifications, each one only if the
// device has that type switched on (prefs) and there is something to say:
//   overdue   – unpaid payments past their due date
//   today     – payments due today
//   upcoming  – payments due in the next 3 days
//   contracts – contracts ending in 30 / 7 / 1 day(s) or today
// Owners see everything; workers only if allowed to see alerts, and only their buildings/units.

import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { findOpenPayments, groupPayments, findExpiringContracts, todayInRiyadh, cleanFlatNo, UPCOMING_DAYS } from './overdue.mjs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const keyIndex = args.indexOf('--key');
const SITE_URL = (process.env.SITE_URL || 'https://3marh.vercel.app/').replace(/\/?$/, '/');
const DEFAULT_PREFS = { overdue: true, today: true, upcoming: true, contracts: true };

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

const money = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const dmy = (iso) => iso.split('-').reverse().map(Number).join('-');

const visibleTo = (items, account) => {
  if (!account || account.role === 'owner') return items;
  const perms = account.permissions || {};
  if (!perms.canViewAlerts) return [];
  const buildings = Array.isArray(perms.allowedBuildings) && perms.allowedBuildings.length ? perms.allowedBuildings : null;
  return items.filter(p => {
    if (buildings && !buildings.includes(p.building)) return false;
    const units = perms.allowedUnits?.[p.building];
    if (Array.isArray(units) && units.length && !units.some(u => cleanFlatNo(u) === p.flatNo)) return false;
    return true;
  });
};

const buildingSummary = (items) => {
  const counts = new Map();
  for (const p of items) counts.set(p.building, (counts.get(p.building) || 0) + 1);
  return counts;
};

const linkFor = (items) => {
  const buildings = [...buildingSummary(items).keys()];
  return buildings.length === 1 ? `${SITE_URL}${encodeURIComponent(buildings[0])}?modal=alerts` : SITE_URL;
};

const paymentMessage = (kind, items) => {
  const total = items.reduce((s, p) => s + p.remaining, 0);
  const one = items.length === 1 ? items[0] : null;
  const who = (p) => `${p.tenantName || 'مستأجر'} — ${p.building}، وحدة ${p.flatNo}`;
  const perBuilding = [...buildingSummary(items)].map(([b, n]) => `${b} (${n})`).join('، ');
  const titles = {
    overdue: one ? 'دفعة متأخرة' : `${items.length} دفعات متأخرة`,
    today: one ? 'دفعة مستحقة اليوم' : `${items.length} دفعات مستحقة اليوم`,
    upcoming: one ? `دفعة قادمة خلال ${UPCOMING_DAYS} أيام` : `${items.length} دفعات قادمة خلال ${UPCOMING_DAYS} أيام`,
  };
  let body;
  if (one) {
    const when = kind === 'upcoming' ? ` (${one.daysUntilDue === 1 ? 'غداً' : dmy(one.dueDate)})` : '';
    body = `${who(one)}: ${kind === 'overdue' ? 'متبقي ' : ''}${money(one.remaining)} ر.س${when}`;
  } else {
    body = `الإجمالي ${money(total)} ر.س — ${perBuilding}`;
  }
  return { title: titles[kind], body, url: linkFor(items), kind };
};

const contractsMessage = (items) => {
  const when = (d) => (d === 0 ? 'ينتهي اليوم' : d === 1 ? 'ينتهي غداً' : `ينتهي بعد ${d} يوماً`);
  const title = items.length === 1 ? 'عقد قريب الانتهاء' : `${items.length} عقود قريبة الانتهاء`;
  const body = items.length === 1
    ? `${items[0].tenantName || 'مستأجر'} — ${items[0].building}، وحدة ${items[0].flatNo}: ${when(items[0].daysLeft)} (${dmy(items[0].endDate)})`
    : items.slice(0, 3).map(c => `${c.tenantName || c.flatNo}: ${when(c.daysLeft)}`).join('، ') + (items.length > 3 ? '…' : '');
  return { title, body, url: linkFor(items), kind: 'contracts' };
};

async function main() {
  const today = todayInRiyadh();
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (nothing sent)' : 'SEND'} — date ${today.toISOString().slice(0, 10)}`);
  const ownerRefs = (await db.collection('users').listDocuments()).filter(r => r.id !== 'global_system');
  let sent = 0, removed = 0;

  for (const ownerRef of ownerRefs) {
    const ownerId = ownerRef.id;
    const ownerDoc = (await ownerRef.get()).data();
    if (!ownerDoc) continue;
    const groups = groupPayments(findOpenPayments(ownerId, ownerDoc, today));
    const contracts = findExpiringContracts(ownerId, ownerDoc, today);
    const counts = `late ${groups.overdue.length}, today ${groups.today.length}, upcoming ${groups.upcoming.length}, contracts ${contracts.length}`;

    const tokensSnap = await ownerRef.collection('pushTokens').get();
    if (tokensSnap.empty) {
      if (groups.overdue.length + groups.today.length + groups.upcoming.length + contracts.length) console.log(`  ${ownerId}: ${counts} — no devices`);
      continue;
    }
    console.log(`  ${ownerId}: ${counts} — ${tokensSnap.size} device(s)`);

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
      const prefs = { ...DEFAULT_PREFS, ...(t.get('prefs') || {}) };
      const messages = [];
      for (const kind of ['overdue', 'today', 'upcoming']) {
        const items = prefs[kind] ? visibleTo(groups[kind], account) : [];
        if (items.length) messages.push(paymentMessage(kind, items));
      }
      const myContracts = prefs.contracts ? visibleTo(contracts, account) : [];
      if (myContracts.length) messages.push(contractsMessage(myContracts));

      for (const msg of messages) {
        console.log(`    → ${account.role} ${account.username}: ${msg.title} | ${msg.body}`);
        if (DRY_RUN) continue;
        try {
          await messaging.send({
            token: t.id,
            data: { title: msg.title, body: msg.body, url: msg.url, tag: `${msg.kind}-${ownerId}` },
            webpush: { headers: { Urgency: 'high', TTL: String(12 * 3600) } },
          });
          sent++;
        } catch (err) {
          const code = err?.errorInfo?.code || err?.code || '';
          if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token') || code.includes('invalid-argument')) {
            await t.ref.delete();
            removed++;
            break;
          }
          console.error(`    send failed for ${ownerId}/${account.username}: ${code || err.message}`);
        }
      }
    }
  }
  console.log(`Done. Notifications sent: ${sent}. Dead devices removed: ${removed}.`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
