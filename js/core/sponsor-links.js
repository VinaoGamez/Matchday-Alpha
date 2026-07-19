/**
 * Links externos dos patrocinadores (por slug do ícone).
 * Só entram URLs confirmadas — demais marcas não ficam clicáveis.
 */
export const SPONSOR_EXTERNAL_LINKS = {
  'tekno-cursos': 'https://teknocursos.com.br/',
};

export function sponsorExternalUrlBySlug(slug) {
  if (!slug) return null;
  const href = SPONSOR_EXTERNAL_LINKS[slug];
  return typeof href === 'string' && href.startsWith('http') ? href : null;
}
