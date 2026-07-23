/** Nome do país (PT/EN) → ISO-2. */
const NATION_ISO = {
  brasil: 'BR',
  brazil: 'BR',
  argentina: 'AR',
  uruguai: 'UY',
  uruguay: 'UY',
  paraguai: 'PY',
  paraguay: 'PY',
  chile: 'CL',
  colombia: 'CO',
  peru: 'PE',
  equador: 'EC',
  ecuador: 'EC',
  bolivia: 'BO',
  venezuela: 'VE',
  mexico: 'MX',
  portugal: 'PT',
  espanha: 'ES',
  spain: 'ES',
  italia: 'IT',
  italy: 'IT',
  franca: 'FR',
  france: 'FR',
  alemanha: 'DE',
  germany: 'DE',
  holanda: 'NL',
  netherlands: 'NL',
  belgica: 'BE',
  belgium: 'BE',
  croacia: 'HR',
  croatia: 'HR',
  servia: 'RS',
  serbia: 'RS',
  nigeria: 'NG',
  gana: 'GH',
  ghana: 'GH',
  senegal: 'SN',
  camaroes: 'CM',
  cameroon: 'CM',
  'costa do marfim': 'CI',
  'ivory coast': 'CI',
  japao: 'JP',
  japan: 'JP',
  'coreia do sul': 'KR',
  'south korea': 'KR',
  china: 'CN',
  'estados unidos': 'US',
  usa: 'US',
  'united states': 'US',
  canada: 'CA',
  angola: 'AO',
  mocambique: 'MZ',
  mozambique: 'MZ',
  'cabo verde': 'CV',
  'cape verde': 'CV',
};

function normKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function isoForNationality(nation, isoOverride) {
  if (isoOverride) {
    const code = String(isoOverride).trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : null;
  }
  const key = normKey(nation);
  return NATION_ISO[key] || null;
}

/** PNG local — CSP do 5081 bloqueia img externa; emoji de bandeira often não renderiza no Windows. */
export function flagImageUrl(iso2) {
  const iso = String(iso2 || '').toLowerCase();
  if (!/^[a-z]{2}$/.test(iso)) return null;
  return `./flags/${iso}.png`;
}

export function flagImgMarkup(nation, isoOverride) {
  const iso = isoForNationality(nation, isoOverride);
  const src = iso ? flagImageUrl(iso) : null;
  if (!src) return '';
  return `<img class="md-card-flag" src="${src}" alt="" width="20" height="15" loading="lazy" decoding="async">`;
}
