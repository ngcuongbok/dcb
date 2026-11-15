// Verify the signed Cloudflare Access assertion independently of proxy headers.
// Missing configuration always denies access.
const textDecoder = new TextDecoder();
function bytes(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid base64url');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

export async function verifyAccess(request, env, fetchKeys = fetch) {
  const domain = String(env.ACCESS_TEAM_DOMAIN || '').replace(/\/$/, '');
  const audience = String(env.ACCESS_AUD || '');
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) || !audience) return null;
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || '';
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 16384) return null;
  try {
    const header = JSON.parse(textDecoder.decode(bytes(parts[0])));
    const payload = JSON.parse(textDecoder.decode(bytes(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'RS256' || !header.kid || payload.iss !== domain ||
        !Array.isArray(payload.aud) || !payload.aud.includes(audience) ||
        !Number.isFinite(payload.exp) || payload.exp <= now ||
        (payload.nbf != null && (!Number.isFinite(payload.nbf) || payload.nbf > now)) ||
        typeof payload.email !== 'string' || !payload.email.trim()) return null;
    const response = await fetchKeys(domain + '/cdn-cgi/access/certs');
    if (!response.ok) return null;
    const jwks = await response.json();
    const jwk = Array.isArray(jwks.keys) && jwks.keys.find(k => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    return valid ? {email:payload.email.trim().toLowerCase()} : null;
  } catch { return null; }
}
