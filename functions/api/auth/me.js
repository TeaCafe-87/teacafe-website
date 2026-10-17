import { isOfficialUser, json } from '../../_lib/community.js';
import { getSessionUser } from '../../_lib/session.js';

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ authenticated: false });
  return json({
    authenticated: true,
    is_official: isOfficialUser(user, env),
    user: { id: user.id, username: user.username, global_name: user.global_name, avatar_url: user.avatar_url }
  });
}
