export { escapeHtml as esc } from '@camnotlar/shared';

export function $<T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`öğe yok: ${sel}`);
  return el;
}
export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
export const ico = (n: string) => `<svg class="i"><use href="#i-${n}"/></svg>`;
export const mq = matchMedia('(max-width:760px)');
