/** İmleç konumunu düz metin uzaklığı olarak saklayıp geri yükler (uzaktan güncellemelerde). */
export interface Caret {
  start: number;
  end: number;
}

function offsetOf(root: Node, node: Node, off: number): number {
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setEnd(node, off);
  return r.toString().length;
}

export function saveCaret(root: HTMLElement): Caret | null {
  const s = getSelection();
  if (!s || !s.rangeCount) return null;
  const r = s.getRangeAt(0);
  if (!root.contains(r.startContainer)) return null;
  return { start: offsetOf(root, r.startContainer, r.startOffset), end: offsetOf(root, r.endContainer, r.endOffset) };
}

function locate(root: Node, target: number): [Node, number] {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let left = target;
  let last: Text | null = null;
  for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
    if (left <= n.length) return [n, left];
    left -= n.length;
    last = n;
  }
  return last ? [last, last.length] : [root, root.childNodes.length];
}

export function restoreCaret(root: HTMLElement, c: Caret): void {
  const [sn, so] = locate(root, c.start);
  const [en, eo] = locate(root, c.end);
  const r = document.createRange();
  r.setStart(sn, so);
  r.setEnd(en, eo);
  const s = getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
}

export function caretEnd(root: HTMLElement): void {
  const r = document.createRange();
  r.selectNodeContents(root);
  r.collapse(false);
  const s = getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
}
