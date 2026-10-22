// Parameter forms built from each algorithm's `params` spec (core/filters, core/interp).
import { plain } from './i18n.mjs';

export function buildForm(container, algo, values, onChange) {
  container.innerHTML = '';
  for (const p of algo.params) {
    const label = document.createElement('label');
    label.className = 'fld';
    const span = document.createElement('span');
    span.className = 'field-label';
    span.dataset.t = `p.${algo.id}.${p.key}`;
    span.textContent = plain(`p.${algo.id}.${p.key}`);
    const input = document.createElement('input');
    input.className = 'field';
    input.type = 'number';
    Object.assign(input, { min: p.min, max: p.max, step: p.step });
    input.value = values[p.key] ?? algo.defaults[p.key];
    input.dataset.key = p.key;
    input.addEventListener('change', () => {
      let v = Number(input.value);
      if (!Number.isFinite(v)) v = algo.defaults[p.key];
      v = Math.min(p.max, Math.max(p.min, v));
      input.value = v;
      onChange(p.key, v);
    });
    label.append(span, input);
    container.append(label);
  }
}

export function readForm(container) {
  const out = {};
  container.querySelectorAll('input[data-key]').forEach((el) => { out[el.dataset.key] = Number(el.value); });
  return out;
}

export function fillSelect(select, items, keyOf) {
  const cur = select.value;
  select.innerHTML = '';
  for (const it of items) {
    const o = document.createElement('option');
    o.value = it.id;
    o.textContent = plain(keyOf(it));
    select.append(o);
  }
  if ([...select.options].some((o) => o.value === cur)) select.value = cur;
}

export function setTabs(root) {
  const tabs = root.querySelectorAll('[role="tab"]');
  tabs.forEach((b) => b.addEventListener('click', () => {
    tabs.forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    root.querySelectorAll('.tabpanel').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
    root.dispatchEvent(new CustomEvent('tab', { detail: b.dataset.tab }));
  }));
}

export const fmtPct = (v) => (Number.isFinite(v) ? `${(100 * v).toFixed(1)}%` : '—');
export const fmtM = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—');
export const fmtInt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString() : '—');
