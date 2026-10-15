import { json } from '../../../_lib/community.js';

export async function onRequestGet({ params, request, env }) {
  if (!env.DB || !env.GALLERY_MEDIA) return json({ error: 'storage_not_configured' }, 503);
  const row = await env.DB.prepare("SELECT m.object_key,m.mime_type,m.byte_size FROM community_media m JOIN community_posts p ON p.id=m.post_id WHERE m.id=? AND p.status='published'").bind(params.id).first();
  if (!row) return json({ error: 'media_not_found' }, 404);
  const rangeHeader = request.headers.get('Range');
  let options = {};
  if (rangeHeader) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${row.byte_size}` } });
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : row.byte_size - 1;
    if (start >= row.byte_size || end < start || end >= row.byte_size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${row.byte_size}` } });
    options = { range: { offset: start, length: end - start + 1 } };
  }
  const object = await env.GALLERY_MEDIA.get(row.object_key, options);
  if (!object) return json({ error: 'media_not_found' }, 404);
  const headers = new Headers({ 'Content-Type': row.mime_type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'public, max-age=3600', 'Accept-Ranges': 'bytes' });
  if (rangeHeader) {
    const offset = object.range?.offset || 0;
    const length = object.range?.length || row.byte_size;
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${row.byte_size}`);
    headers.set('Content-Length', String(length));
  } else headers.set('Content-Length', String(row.byte_size));
  return new Response(object.body, { status: rangeHeader ? 206 : 200, headers });
}
