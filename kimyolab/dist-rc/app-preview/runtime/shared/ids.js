// Collision-resistant immutable identifiers for runtime records (attempts, evidence, quarantine).
// Uses the platform CSPRNG; never derives an id from activity/concept ids.

function randomBytes(length       )            {
  const bytes=new Uint8Array(length);
  const cryptoApi=(globalThis       ).crypto;
  if(!cryptoApi||typeof cryptoApi.getRandomValues!=='function') throw new Error('SECURE_RANDOM_UNAVAILABLE');
  cryptoApi.getRandomValues(bytes);
  return bytes;
}

export function newUuid()        {
  const cryptoApi=(globalThis       ).crypto;
  if(cryptoApi&&typeof cryptoApi.randomUUID==='function') return cryptoApi.randomUUID();
  const b=randomBytes(16);
  b[6]=(b[6] &0x0f)|0x40;
  b[8]=(b[8] &0x3f)|0x80;
  const hex=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
