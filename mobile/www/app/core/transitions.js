// Extraído/adaptado de src/control.js (transitionFor, linhas 46-48) e dos
// valores de transição usados em itemMarkup/renderRules (linhas 63-67, 338).
// Núcleo puro: sem Electron, Capacitor ou DOM.

export const TRANSITIONS = ['cut', 'fade', 'slide-left', 'slide-up', 'zoom'];
export const DEFAULT_TRANSITION = 'fade';

/**
 * Normaliza um valor de transição. Retorna o valor se for uma transição
 * conhecida, ou string vazia caso contrário (nunca lança).
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTransition(value) {
  return typeof value === 'string' && TRANSITIONS.includes(value) ? value : '';
}

/**
 * Reproduz transitionFor(item) do desktop:
 *   item.transition || activeRule()?.transition || 'fade'
 * Aqui a regra ativa é resolvida externamente (ScheduleEngine) e passada
 * como `ruleTransition`, para manter este módulo puro e testável.
 * @param {{transition?: string}} item
 * @param {string|undefined|null} ruleTransition
 * @returns {string}
 */
export function transitionFor(item, ruleTransition) {
  const itemTransition = normalizeTransition(item?.transition);
  if (itemTransition) return itemTransition;
  const fromRule = normalizeTransition(ruleTransition);
  if (fromRule) return fromRule;
  return DEFAULT_TRANSITION;
}
