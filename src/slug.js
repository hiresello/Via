export function slug(value) {
  const text = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return text || 'x';
}

/** Display faces (Apestron / Syne) read as all-caps. Lowercase maps to caps. */
export function caps(value) {
  return String(value || '').toLocaleUpperCase('en-US');
}
