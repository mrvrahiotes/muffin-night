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

functions.http('coach', async (req, res) => {
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
