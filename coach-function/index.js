// Muffin Night AI coach: a small server piece that keeps the Claude API key private.
// Runs as a Google Cloud Run function (Node.js 20). Entry point: coach
const functions = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');
admin.initializeApp();

const ALLOWED_ORIGIN = 'https://mrvrahiotes.github.io';
const DAILY_LIMIT = 40;
const MODEL = 'claude-sonnet-5-5';

const SYSTEM = `You are the coach inside Muffin Night, a private relationship app for devoted, monogamous couples who want more desire and deeper connection.
Who you help: one partner in a committed couple, writing privately to you. Their partner cannot see this chat.
How you help:
- Be warm, practical, and frank about romance and sex, like a good couples' coach. Plain language, no lectures.
- Keep it mutual: both partners' needs matter equally. Encourage talking, consent, and checking in, without being preachy.
- Keep sex between the two of them: no third parties, swinging, or open-relationship suggestions. Don't bring up porn unless what they shared says they're both open to watching it together.
- Never suggest anything they've listed as off the table, and respect a no without pushing.
- Suggest concrete next steps, and where it fits, features in the app (Start tonight, Sparks and Make a move, Notes for hard conversations, Exploring slowly for new things at the slower partner's pace, Pillow talk after a night, Little things, IOUs).
- You can discuss sexual techniques and ideas educationally, but don't write erotica or graphic descriptions.
- You're not a therapist or doctor. For pain, medical or sexual-health concerns, abuse, coercion, or a crisis, gently recommend a professional (a doctor, a licensed couples or sex therapist, or a crisis line).
- If someone describes pressure, control, or one partner being pushed past a limit, side with consent and safety.
- Keep answers short: usually under 200 words, a few short paragraphs or a brief list.`;

const APP_URL = 'https://mrvrahiotes.github.io/muffin-night/';
const MSG = {
  spark: 'Something sweet is waiting for you 💌', move: 'Check Muffin Night 😉', dq: 'Your partner answered today\'s question 💬',
  plan: 'A Muffin Night was planned 🧁', plan_suggest: 'A new time was suggested 🧁', week: 'Your partner filled in the weekly check-in 🗓️',
  fix: 'Your partner would like to talk something through 🤝', break: 'Taking a 20-minute break. Back soon.', talk: 'A conversation is waiting 💬',
  surprise: 'It\'s time. Open Muffin Night 😉', plan_today: 'Tonight\'s the night 🧁', dq_daily: 'Today\'s question is waiting 💬', week_rem: 'Time for your weekly check-in 🗓️'
};
async function sendTo(uid, kind) {
  const db = admin.firestore();
  const u = await db.doc(`users/${uid}`).get();
  const tokens = (u.exists && u.data().fcm) || [];
  if (!tokens.length) return 0;
  const r = await admin.messaging().sendEachForMulticast({ tokens, notification: { title: 'Muffin Night', body: MSG[kind] || MSG.move }, webpush: { fcmOptions: { link: APP_URL } } });
  const bad = [];
  r.responses.forEach((x, i) => { if (!x.success && /registration-token-not-registered|invalid-argument|invalid-registration/.test(String(x.error && x.error.code))) bad.push(tokens[i]); });
  if (bad.length) await db.doc(`users/${uid}`).set({ fcm: admin.firestore.FieldValue.arrayRemove(...bad) }, { merge: true });
  return r.successCount;
}
async function partnerOf(uid) {
  const db = admin.firestore();
  const u = await db.doc(`users/${uid}`).get();
  const cid = u.exists && u.data().cid;
  if (!cid) return null;
  const c = await db.doc(`couples/${cid}`).get();
  return ((c.exists && c.data().members) || []).find(x => x !== uid) || null;
}
function localNow(tzMin) { const d = new Date(Date.now() - (tzMin || 0) * 60000); return { day: d.toISOString().slice(0, 10), dow: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() }; }
async function tick() {
  const db = admin.firestore(); const now = Date.now(); let sent = 0;
  const due = await db.collection('scheduled').where('at', '<=', now).limit(200).get();
  for (const d of due.docs) { const x = d.data(); try { if (x.to && MSG[x.kind] && now - x.at < 6 * 3600e3) sent += await sendTo(x.to, x.kind); } catch (e) {} await d.ref.delete(); }
  const us = await db.collection('users').where('notifyOn', '==', true).limit(1000).get();
  for (const d of us.docs) {
    const x = d.data(), n = localNow(x.tz), upd = {};
    const at = typeof x.dqAt === 'number' ? x.dqAt : 20 * 60;
    if (x.dqOn !== false && n.min >= at && n.min < at + 30 && x.lastDq !== n.day) { try { sent += await sendTo(d.id, 'dq_daily'); } catch (e) {} upd.lastDq = n.day; }
    if (x.wkOn !== false && n.dow === 0 && n.min >= 19 * 60 && n.min < 19 * 60 + 30 && x.lastWk !== n.day) { try { sent += await sendTo(d.id, 'week_rem'); } catch (e) {} upd.lastWk = n.day; }
    if (Object.keys(upd).length) await d.ref.set(upd, { merge: true });
  }
  return sent;
}

functions.http('coach', async (req, res) => {
  if (req.path === '/tick') { try { const n = await tick(); return res.json({ ok: true, sent: n }); } catch (e) { console.error('tick', e && e.message); return res.status(500).json({ error: 'tick' }); } }
  if (req.path === '/notify') {
    res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN); res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.set('Access-Control-Allow-Methods', 'POST');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    try {
      const tok = (req.get('Authorization') || '').replace(/^Bearer /, '');
      const user = await admin.auth().verifyIdToken(tok);
      const kind = String((req.body || {}).kind || '');
      if (!MSG[kind]) return res.status(400).json({ error: 'kind' });
      const db = admin.firestore(), day = new Date().toISOString().slice(0, 10), ref = db.doc(`notifyUsage/${user.uid}_${day}`);
      const n = await db.runTransaction(async t => { const s = await t.get(ref); const c = (s.exists ? s.data().n : 0) + 1; t.set(ref, { n: c }, { merge: true }); return c; });
      if (n > 60) return res.status(429).json({ error: 'limit' });
      const p = await partnerOf(user.uid);
      const sent = p ? await sendTo(p, kind) : 0;
      return res.json({ ok: true, sent });
    } catch (e) { console.error('notify', e && e.message); return res.status(401).json({ error: 'unauthorized' }); }
  }
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).send('');
  let user;
  try {
    const tok = (req.get('Authorization') || '').replace(/^Bearer /, '');
    user = await admin.auth().verifyIdToken(tok);
  } catch (e) { return res.status(401).json({ error: 'unauthorized' }); }
  try {
    const db = admin.firestore();
    const day = new Date().toISOString().slice(0, 10);
    const ref = db.doc(`coachUsage/${user.uid}_${day}`);
    const n = await db.runTransaction(async t => {
      const s = await t.get(ref);
      const c = (s.exists ? s.data().n : 0) + 1;
      if (c <= DAILY_LIMIT) t.set(ref, { n: c }, { merge: true });
      return c;
    });
    if (n > DAILY_LIMIT) return res.status(429).json({ error: 'daily_limit' });
    const body = req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
    if (!messages.length) return res.status(400).json({ error: 'bad_request' });
    const msgs = messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 4000) }));
    if (msgs[0].role !== 'user') msgs.shift();
    const context = body.context ? String(body.context).slice(0, 4000) : '';
    const system = SYSTEM + (context ? `\n\nWhat this person chose to share about themselves and their relationship:\n${context}` : '');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 900, system, messages: msgs })
    });
    const j = await r.json();
    if (!r.ok) { console.error('anthropic', r.status, j && j.error && j.error.type); return res.status(502).json({ error: 'ai_error' }); }
    res.json({ text: (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n') });
  } catch (e) { console.error(e && e.message); res.status(500).json({ error: 'server_error' }); }
});
