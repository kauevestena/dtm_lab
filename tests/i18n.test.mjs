import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { words, detectLanguage, setLanguage, t } from '../i18n.mjs';
import { FILTERS } from '../core/filters/index.mjs';
import { INTERPOLATORS } from '../core/interp/index.mjs';
import { ZONES } from '../core/pipeline.mjs';
import { PRESETS } from '../config.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('language precedence is URL, shared monorepo preference, then browser', () => {
  assert.equal(detectLanguage({ query: '?lang=en', stored: 'pt-BR', browser: 'pt-BR' }), 'en');
  assert.equal(detectLanguage({ query: '?lang=pt', stored: 'en', browser: 'en-US' }), 'pt-BR');
  assert.equal(detectLanguage({ query: '?lang=pt-BR', browser: 'en-US' }), 'pt-BR');
  assert.equal(detectLanguage({ stored: 'en', browser: 'pt-BR' }), 'en');
  assert.equal(detectLanguage({ browser: 'pt-PT' }), 'pt-BR');
  assert.equal(detectLanguage({ browser: 'de-DE' }), 'en');
});

test('every entry has a non-empty PT and EN string with the same placeholders', () => {
  for (const [key, pair] of Object.entries(words)) {
    assert.equal(pair.length, 2, key);
    assert.ok(pair.every((s) => typeof s === 'string' && s.length > 0), key);
    const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    assert.equal(ph(pair[0]), ph(pair[1]), `${key}: placeholders differ`);
  }
});

const SOURCES = ['index.html', 'comparacao.html', 'teoria.html', 'app.mjs', 'compare.mjs', 'ui.mjs', 'views/maps.mjs', 'views/profile.mjs'];

test('every key referenced by the pages and modules exists in both languages', () => {
  for (const file of SOURCES) {
    const src = read(file);
    for (const m of src.matchAll(/data-(?:t|t-html|label|ph)="([^"]+)"/g)) assert.ok(words[m[1]], `${file}: ${m[1]}`);
    for (const m of src.matchAll(/\b(?:t|plain)\('([^']+)'/g)) assert.ok(words[m[1]], `${file}: ${m[1]}`);
  }
});

test('dynamic key families are complete: algorithms, parameters, zones, presets', () => {
  const need = [];
  for (const f of FILTERS) { need.push(`flt.${f.id}`, `fd.${f.id}`); f.params.forEach((p) => need.push(`p.${f.id}.${p.key}`)); }
  for (const m of INTERPOLATORS) { need.push(`int.${m.id}`, `id.${m.id}`); m.params.forEach((p) => need.push(`p.${m.id}.${p.key}`)); }
  ZONES.forEach((z) => need.push(`z.${z}`));
  PRESETS.forEach((p) => need.push(`preset.${p.id}`));
  ['dtm', 'dz', 't1', 't2', 'ref', 'zones'].forEach((l) => need.push(`cmp.l.${l}`));
  ['objectOk', 'groundOk', 'typeI', 'typeII'].forEach((o) => need.push(`out.${o}`));
  need.forEach((k) => assert.ok(words[k], k));
});

test('switching language changes the strings', () => {
  assert.equal(t('portal'), '← Simuladores');
  const prev = globalThis.document; globalThis.document = undefined;
  setLanguage('en'); assert.equal(t('portal'), '← Simulators');
  setLanguage('pt-BR'); assert.equal(t('portal'), '← Simuladores');
  globalThis.document = prev;
});

test('theory page: every Portuguese block has an English twin of the same kind, and vice versa', () => {
  const html = read('teoria.html');
  const body = html.slice(html.indexOf('<nav class="toc"'));
  const tags = (cls) => [...body.matchAll(new RegExp(`<(p|li|span|strong)\\s+class="${cls}"`, 'g'))].map((m) => m[1]);
  const pt = tags('pt'), en = tags('en');
  assert.ok(pt.length > 40, `found ${pt.length} Portuguese blocks`);
  assert.deepEqual(pt, en);
  const seq = [...body.matchAll(/class="(pt|en)"/g)].map((m) => m[1]);
  for (let i = 0; i < seq.length; i += 2) assert.deepEqual(seq.slice(i, i + 2), ['pt', 'en'], `pair ${i / 2}`);
});
