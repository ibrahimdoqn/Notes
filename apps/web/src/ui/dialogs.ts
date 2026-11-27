import { $, esc, ico } from '../lib/dom.ts';

export interface AskOpts {
  t: string;
  m?: string;
  ok?: string;
  danger?: boolean;
  input?: string;
  inputType?: string;
  placeholder?: string;
  choices?: { v: string; l: string; on?: boolean; icon?: string }[];
}

/** Cam iletişim kutusu. Onayda true, girişte metin, seçimde değer; vazgeçte null döner. */
export function ask(o: AskOpts): Promise<string | true | null> {
  return new Promise((res) => {
    const w = document.createElement('div');
    w.className = 'scrim';
    w.innerHTML = `<form class="dlg" role="dialog" aria-modal="true"><h3>${esc(o.t)}</h3>${o.m ? `<p>${esc(o.m)}</p>` : ''}${
      o.input != null ? `<input class="fld" type="${esc(o.inputType ?? 'text')}" value="${esc(o.input)}" maxlength="${o.inputType === 'password' ? 1024 : 60}" placeholder="${esc(o.placeholder ?? 'Klasör adı')}" aria-label="${esc(o.t)}">` : ''
    }${o.choices ? `<div class="chs">${o.choices.map((c) => `<button type="button" class="ch${c.on ? ' on' : ''}" data-c="${esc(c.v)}">${ico(c.icon ?? 'folder')}${esc(c.l)}</button>`).join('')}</div>` : ''
    }<div class="dbtn"><button type="button" class="cn">Vazgeç</button>${o.ok ? `<button class="ok${o.danger ? ' red' : ''}">${esc(o.ok)}</button>` : ''}</div></form>`;
    document.body.append(w);
    const f = w.querySelector('form') as HTMLFormElement;
    const i = w.querySelector('input');
    const prevFocus = document.activeElement as HTMLElement | null;
    let gone = false;
    const done = (v: string | true | null) => {
      if (gone) return;
      gone = true;
      w.classList.add('out');
      setTimeout(() => w.remove(), 180);
      prevFocus?.focus?.();
      res(v);
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      done(i ? i.value.trim() : true);
    };
    (w.querySelector('.cn') as HTMLButtonElement).onclick = () => done(null);
    w.onclick = (e) => {
      const t = e.target as HTMLElement;
      if (t === w) done(null);
      const c = t.closest<HTMLElement>('[data-c]');
      if (c) done(c.dataset.c ?? null);
    };
    w.onkeydown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done(null);
      }
    };
    setTimeout(() => {
      (i ?? f.querySelector<HTMLElement>('.ok,.ch.on,.ch,.cn'))?.focus();
      i?.select();
    }, 40);
  });
}

let tt: ReturnType<typeof setTimeout> | undefined;
export function toast(m: string, a?: string, fn?: () => void, ms = 4200): void {
  const t = $('#toast');
  t.innerHTML = esc(m) + (a ? `<button>${esc(a)}</button>` : '');
  const b = t.querySelector('button');
  if (b && fn) b.onclick = () => {
    fn();
    t.classList.remove('show');
  };
  t.classList.add('show');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('show'), ms);
}
