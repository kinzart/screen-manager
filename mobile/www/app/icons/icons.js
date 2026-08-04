// Ícones SVG inline, empacotados localmente (nenhum CDN, nenhum emoji).
// Cada função retorna uma string de markup <svg> pronta para innerHTML.
// stroke="currentColor" para herdar a cor do texto/botão que os contém.

function svg(paths, { size = 20, viewBox = '0 0 24 24', filled = false } = {}) {
  const attrs = filled
    ? `fill="currentColor" stroke="none"`
    : `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  // Sem xmlns: o elemento é sempre inserido via innerHTML dentro de um
  // documento HTML (nunca como arquivo .svg standalone), onde o parser já
  // aplica o namespace SVG corretamente a partir da tag <svg>. Evita um
  // falso positivo no teste "sem URL http(s) hardcoded" (xmlns não é uma
  // requisição de rede, é um identificador de namespace).
  return `<svg width="${size}" height="${size}" viewBox="${viewBox}" ${attrs} aria-hidden="true" focusable="false">${paths}</svg>`;
}

const ICONS = {
  play: () => svg('<path d="M6 4l14 8-14 8V4z"/>', { filled: true }),
  pause: () => svg('<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>', { filled: true }),
  previous: () => svg('<path d="M19 5v14L8 12l11-7z"/><rect x="5" y="5" width="2" height="14"/>', { filled: true }),
  next: () => svg('<path d="M5 5v14l11-7L5 5z"/><rect x="17" y="5" width="2" height="14"/>', { filled: true }),
  blackout: () => svg('<rect x="4" y="4" width="16" height="16" rx="2"/>', { filled: true }),
  logo: () => svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
  import: () => svg('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 19h16"/>'),
  settings: () => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V19a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H4a2 2 0 110-4h.1a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H10a1.7 1.7 0 001-1.5V4a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V10a1.7 1.7 0 001.5 1h.1a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  home: () => svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
  playlist: () => svg('<path d="M4 6h11"/><path d="M4 12h11"/><path d="M4 18h7"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="12" r="2"/>'),
  presentation: () => svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6"/><path d="M12 16v4"/>'),
  moveUp: () => svg('<path d="M12 19V6"/><path d="M6 11l6-6 6 6"/>'),
  moveDown: () => svg('<path d="M12 5v13"/><path d="M18 13l-6 6-6-6"/>'),
  delete: () => svg('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>'),
  edit: () => svg('<path d="M4 20h4l11-11-4-4L4 16v4z"/><path d="M14.5 5.5l4 4"/>'),
  close: () => svg('<path d="M5 5l14 14"/><path d="M19 5L5 19"/>'),
  more: () => svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', { filled: true }),
  loop: () => svg('<path d="M4 4v5h5"/><path d="M20 20v-5h-5"/><path d="M5.1 15A8 8 0 0019 12"/><path d="M18.9 9A8 8 0 005 12"/>'),
  timer: () => svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/>'),
  image: () => svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-6-6-5 5-2-2-4 4"/>'),
  video: () => svg('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>'),
  warning: () => svg('<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4"/><path d="M12 17.5v.01"/>'),
  check: () => svg('<path d="M5 12l5 5 9-10"/>'),
  arrowRight: () => svg('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>'),
};

/** Retorna o markup SVG do ícone `name`. Lança se o nome não existir (evita ícone ausente silencioso). */
export function icon(name, options) {
  const fn = ICONS[name];
  if (!fn) throw new Error(`icon: ícone desconhecido "${name}"`);
  return fn(options);
}

export const ICON_NAMES = Object.freeze(Object.keys(ICONS));
