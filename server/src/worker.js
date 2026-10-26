import {ProviderSignInError} from './provider-auth.js';
import {verifyIdentity} from './identity.js';
import {discussionRoute} from './discussion.js';
import {profileDetails, updateProfile} from './profile-details.js';
import {localIdentity} from './local-identity.js';
import { socialRoute, isBlocked } from './social.js';
// AniDeck cloud: opt-in watcher cards shared only between AniDeck users.
//
// Identity comes from an optional AniList/Kitsu sign-in or a random 256-bit AniDeck recovery key: POST /v1/session with that access token, the
// worker asks AniList / Kitsu who it belongs to (the token is never stored), and returns a signed AniDeck session.
// Nothing about a person is visible until they join with a handle; cards are visible to friends (or, if they choose,
// to any AniDeck user who knows the handle).

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' };
const SESSION_DAYS = 60;
const MAX_CARD = 200_000; // bytes
const HANDLE = /^[a-z0-9_]{3,20}$/i;

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const fail = (status, error) => json({ error }, status);
const now = () => Date.now();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return key;
}
async function signSession(env, uid) {
  const body = b64url(new TextEncoder().encode(JSON.stringify({ uid, exp: now() + SESSION_DAYS * 86400000 })));
  const key = await hmac(env.SESSION_SECRET);
  const sig = b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return `${body}.${sig}`;
}
async function readSession(env, req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const [body, sig] = token.split('.');
  if (!body || !sig || !env.SESSION_SECRET) return null;
  const key = await hmac(env.SESSION_SECRET);
  const ok = await crypto.subtle.verify('HMAC', key, fromB64url(sig), new TextEncoder().encode(body)).catch(() => false);
  if (!ok) return null;
  try { const s = JSON.parse(new TextDecoder().decode(fromB64url(body))); return s.exp > now() ? s.uid : null; } catch { return null; }
}

const code = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(8)); return [...r].map((x) => a[x % a.length]).join(''); };
const pub = (u, withCard = false) => u && ({ handle: u.handle, name: u.name, avatar: u.avatar, visibility: u.visibility, cardAt: u.card_at, ...(withCard && u.card ? { card: JSON.parse(u.card) } : {}) });
const one = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first();
const all = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results || [];
const friendship = (env, x, y) => one(env, 'SELECT * FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', x, y, y, x);

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });
    const url = new URL(req.url), path = url.pathname.replace(/\/+$/, ''), m = req.method;
    try {
      if (path === '/v1/health') return json({ ok: true, version:3, features:['friends','messages','blocks','media-friends','message-controls','anime-cards','watch-invites','anideck-accounts','discussions','profile-customization'] });

      // Exchange provider credentials or a device recovery key for a signed AniDeck session.
      if (path === '/v1/session' && m === 'POST') {
        const { provider, token } = await req.json().catch(() => ({}));
        if (!['anilist', 'kitsu', 'anideck'].includes(provider) || typeof token !== 'string' || token.length < 10) return fail(400, 'Sign in to AniList or Kitsu first.');
        const who = provider==='anideck'?await localIdentity(token):await verifyIdentity(env,provider,token);
        if(!who)return fail(401,'Invalid AniDeck recovery key.');
        const existing = await one(env, 'SELECT * FROM users WHERE id = ?', who.id);
        if (existing&&provider!=='anideck'&&!await one(env,'SELECT owner FROM profile_details WHERE owner=?',who.id)) await env.DB.prepare('UPDATE users SET name = ?, avatar = ? WHERE id = ?').bind(who.name, who.avatar, who.id).run();
        return json({ session: await signSession(env, who.id), joined: !!existing?.handle, me: existing ? { ...pub(existing), friendCode: existing.friend_code } : null, suggested: (who.name || '').replace(/[^a-z0-9_]/gi, '').slice(0, 20) });
      }

      const uid = await readSession(env, req);
      if (!uid) return fail(401, 'Your AniDeck session expired. Open your profile to sign in again.');

      if (path === '/v1/me' && m === 'GET') {
        const u = await one(env, 'SELECT * FROM users WHERE id = ?', uid);
        return json({ accountId:uid,me: u?.handle ? { ...await profileDetails(env,pub(u),uid), friendCode: u.friend_code } : null });
      }
      // Join or update: handle, who can see the card, the card itself.
      if (path === '/v1/me' && m === 'PUT') {
        const body = await req.json().catch(() => ({}));
        let u = await one(env, 'SELECT * FROM users WHERE id = ?', uid);
        if (!u) {
          if (!HANDLE.test(body.handle || '')) return fail(400, 'Handles are 3–20 letters, numbers or underscores.');
          if (await one(env, 'SELECT id FROM users WHERE handle = ?', body.handle)) return fail(409, 'That handle is taken. Try another.');
          await env.DB.prepare('INSERT INTO users (id, handle, name, avatar, friend_code, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(uid, body.handle, String(body.name || '').slice(0, 80), String(body.avatar || '').slice(0, 500), code(), body.visibility === 'public' ? 'public' : 'friends', now()).run();
          u = await one(env, 'SELECT * FROM users WHERE id = ?', uid);
        }
        if (body.handle && body.handle !== u.handle) {
          if (!HANDLE.test(body.handle)) return fail(400, 'Handles are 3–20 letters, numbers or underscores.');
          if (await one(env, 'SELECT id FROM users WHERE handle = ? AND id != ?', body.handle, uid)) return fail(409, 'That handle is taken. Try another.');
          await env.DB.prepare('UPDATE users SET handle = ? WHERE id = ?').bind(body.handle, uid).run();
        }
        if (body.visibility) await env.DB.prepare('UPDATE users SET visibility = ? WHERE id = ?').bind(body.visibility === 'public' ? 'public' : 'friends', uid).run();
        if ((body.name || body.avatar)&&!await one(env,'SELECT owner FROM profile_details WHERE owner=?',uid)) await env.DB.prepare('UPDATE users SET name = COALESCE(?, name), avatar = COALESCE(?, avatar) WHERE id = ?').bind(body.name ? String(body.name).slice(0, 80) : null, body.avatar ? String(body.avatar).slice(0, 500) : null, uid).run();
        if (body.card) {
          const text = JSON.stringify(body.card);
          if (new TextEncoder().encode(text).length > MAX_CARD) return fail(413, 'That card is too large.');
          await env.DB.prepare('UPDATE users SET card = ?, card_at = ? WHERE id = ?').bind(text, now(), uid).run();
        }
        u = await one(env, 'SELECT * FROM users WHERE id = ?', uid);
        return json({ me: { ...pub(u), friendCode: u.friend_code } });
      }
      // Leave: deletes the profile, card and friendships.
      if (path === '/v1/me' && m === 'DELETE') {
        await env.DB.batch([env.DB.prepare('DELETE FROM watch_invites WHERE message_id IN (SELECT id FROM messages WHERE sender=? OR recipient=?)').bind(uid,uid),env.DB.prepare('DELETE FROM message_extras WHERE message_id IN (SELECT id FROM messages WHERE sender=? OR recipient=?)').bind(uid,uid),env.DB.prepare('DELETE FROM messages WHERE sender=? OR recipient=?').bind(uid,uid),env.DB.prepare('DELETE FROM blocks WHERE owner=? OR target=?').bind(uid,uid),env.DB.prepare('DELETE FROM message_reads WHERE owner=? OR peer=?').bind(uid,uid),env.DB.prepare('DELETE FROM friends WHERE a = ? OR b = ?').bind(uid, uid), env.DB.prepare('DELETE FROM users WHERE id = ?').bind(uid)]);
        return json({ ok: true });
      }

      // How many AniDeck watchers (with a shared card) have each milestone. Cached for 10 minutes.
      if (path === '/v1/stats/milestones' && m === 'GET') {
        const cache = caches.default, key = new Request(`${url.origin}/v1/stats/milestones`);
        const hit = await cache.match(key);
        if (hit) return hit;
        const total = (await one(env, 'SELECT COUNT(*) AS n FROM users WHERE handle IS NOT NULL AND card IS NOT NULL'))?.n || 0;
        const rows = await all(env, "SELECT j.value AS id, COUNT(*) AS n FROM users, json_each(users.card, '$.badges') AS j WHERE users.handle IS NOT NULL AND users.card IS NOT NULL GROUP BY j.value");
        const res = json({ total, counts: Object.fromEntries(rows.map((r) => [r.id, r.n])) });
        res.headers.set('cache-control', 'public, max-age=600');
        await cache.put(key, res.clone());
        return res;
      }

      const meRow = await one(env, 'SELECT * FROM users WHERE id = ?', uid);
      if (!meRow?.handle) return fail(403, 'Join AniDeck profiles first.');

      if(path==='/v1/me/profile'&&m==='PUT')return updateProfile(req,env,uid,meRow,JSON_HEADERS);
      const discussion=await discussionRoute(req,env,uid,meRow);if(discussion)return discussion;
      const social=await socialRoute(req,env,uid,meRow);if(social)return social;

      // Friends: accepted, plus requests in and out.
      if (path === '/v1/friends' && m === 'GET') {
        const rows = await all(env, `SELECT f.a, f.b, f.status, u.* FROM friends f JOIN users u ON u.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END WHERE f.a = ? OR f.b = ?`, uid, uid, uid);
        const out = { friends: [], incoming: [], outgoing: [] };
        for (const r of rows) {
          if(await isBlocked(env,uid,r.id))continue;
          const p = pub(r); const c = r.card && (r.status==='accepted'||r.visibility==='public') ? JSON.parse(r.card) : null;
          if (c) p.summary = { level: c.level, rank: c.rank, top: c.genres?.[0]?.[0] || '', watching: (c.watching || []).length, eps: c.eps };
          (r.status === 'accepted' ? out.friends : r.a === uid ? out.outgoing : out.incoming).push(p);
        }
        return json(out);
      }
      // Ask: by handle or friend code. If they already asked you, you're friends straight away.
      if (path === '/v1/friends' && m === 'POST') {
        const { to } = await req.json().catch(() => ({}));
        const q = String(to || '').trim().replace(/^@/, '');
        const t = await one(env, 'SELECT * FROM users WHERE handle = ? OR friend_code = ?', q, q.toUpperCase());
        if (!t) return fail(404, 'No AniDeck profile with that handle or code.');
        if (t.id === uid) return fail(400, 'That’s you.');
        if(await isBlocked(env,uid,t.id))return fail(404,'No AniDeck profile with that handle or code.');
        const count=await one(env,'SELECT COUNT(*) AS n FROM friends WHERE a=? OR b=?',uid,uid);if((count?.n||0)>=200)return fail(429,'You can keep up to 200 friends and requests.');
        const f = await friendship(env, uid, t.id);
        if (f?.status === 'accepted') return json({ status: 'accepted', user: pub(t) });
        if (f && f.a === t.id) { await env.DB.prepare('UPDATE friends SET status = ? WHERE a = ? AND b = ?').bind('accepted', t.id, uid).run(); return json({ status: 'accepted', user: pub(t) }); }
        if (!f) await env.DB.prepare('INSERT INTO friends (a, b, status, created_at) VALUES (?, ?, ?, ?)').bind(uid, t.id, 'pending', now()).run();
        return json({ status: 'pending', user: pub(t) });
      }
      let mm = path.match(/^\/v1\/friends\/([^/]+)\/accept$/);
      if (mm && m === 'POST') {
        const t = await one(env, 'SELECT * FROM users WHERE handle = ?', decodeURIComponent(mm[1]));
        if (!t || await isBlocked(env,uid,t.id)) return fail(404, 'Not found.');
        const r = await env.DB.prepare('UPDATE friends SET status = ? WHERE a = ? AND b = ? AND status = ?').bind('accepted', t.id, uid, 'pending').run();
        return r.meta?.changes ? json({ status: 'accepted' }) : fail(404, 'No request from them.');
      }
      mm = path.match(/^\/v1\/friends\/([^/]+)$/);
      if (mm && m === 'DELETE') {
        const t = await one(env, 'SELECT * FROM users WHERE handle = ?', decodeURIComponent(mm[1]));
        if (t) await env.DB.prepare('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').bind(uid, t.id, t.id, uid).run();
        return json({ ok: true });
      }
      // A profile: the card for friends (or anyone, if they chose "public"); otherwise just who they are.
      mm = path.match(/^\/v1\/users\/([^/]+)$/);
      if (mm && m === 'GET') {
        const t = await one(env, 'SELECT * FROM users WHERE handle = ?', decodeURIComponent(mm[1]));
        if (!t?.handle || await isBlocked(env,uid,t.id)) return fail(404, 'No AniDeck profile with that handle.');
        const f = t.id === uid ? { status: 'accepted' } : await friendship(env, uid, t.id);
        const canSee = t.id === uid || t.visibility === 'public' || f?.status === 'accepted';
        return json({ user: await profileDetails(env,pub(t, canSee),t.id), friend: f?.status || null, requested: f?.status === 'pending' ? (f.a === uid ? 'out' : 'in') : null, locked: !canSee });
      }
      return fail(404, 'Not found.');
    } catch (e) {
      if(e instanceof ProviderSignInError)return json({error:e.message,code:e.code,...(e.code==='provider_unavailable'?{upstreamStatus:e.upstreamStatus}: {})},e.status);
      return fail(500, 'AniDeck cloud had a problem. Try again in a moment.');
    }
  },
};
