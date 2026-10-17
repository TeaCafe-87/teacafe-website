import { getSessionUser } from './session.js';

export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const MAX_MEDIA_FILES = 30;
export const MEDIA_TYPES = new Map([
  ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
  ['image/gif', 'gif'], ['video/mp4', 'mp4'], ['video/webm', 'webm']
]);

export async function hasValidSignature(file) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));
  switch (file.type) {
    case 'image/jpeg': return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/png': return bytes[0] === 0x89 && ascii(1, 3) === 'PNG';
    case 'image/gif': return ascii(0, 4) === 'GIF8';
    case 'image/webp': return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP';
    case 'video/mp4': return ascii(4, 4) === 'ftyp';
    case 'video/webm': return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
    default: return false;
  }
}

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export async function userOrError(request, env) {
  const user = await getSessionUser(request, env);
  return user || null;
}

export function isOfficialUser(user, env) {
  if (!user?.id) return false;
  const reviewers = ['891516136464723998', '969660268265226251', ...String(env.OFFICIAL_DISCORD_IDS || '').split(',')];
  return reviewers.some(id => id.trim() === String(user.id));
}

export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

export function publicPost(row, media = []) {
  return {
    id: row.id, kind: row.kind, category: row.category,
    is_official: row.kind === 'forum' && row.category === 'official',
    title: row.title, body: row.body,
    author_id: row.author_id, author_username: row.author_username,
    author_name: row.author_name || row.author_username,
    author_avatar_url: row.author_avatar_url,
    created_at: row.created_at,
    like_count: Number(row.like_count || 0),
    comment_count: Number(row.comment_count || 0),
    share_count: Number(row.share_count || 0),
    liked: Boolean(row.liked),
    media
  };
}

export async function findPublishedPost(env, id) {
  return env.DB.prepare("SELECT id FROM community_posts WHERE id = ? AND status = 'published' LIMIT 1").bind(id).first();
}

export function authorFields(user) {
  return [String(user.id), String(user.username || 'Discord User'), user.global_name ? String(user.global_name) : null, user.avatar_url ? String(user.avatar_url) : null];
}
