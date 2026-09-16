/**
 * Test dell'algoritmo di selezione. Eseguibile con `node --test`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { selectContent, isActive } from '../src/utils/schedule.js';

const DEFAULT_ITEM = {
  id: 'default',
  type: 'markdown',
  source: '/content/default/content.md',
  start: '2000-01-01T00:00:00+00:00',
  priority: 0,
};

const at = (iso) => new Date(iso);

test('un item non ancora iniziato non è attivo', () => {
  const item = { ...DEFAULT_ITEM, start: '2026-09-10T08:00:00+00:00' };
  assert.equal(isActive(item, at('2026-09-10T07:59:59+00:00')), false);
  assert.equal(isActive(item, at('2026-09-10T08:00:00+00:00')), true);
});

test('end è esclusivo', () => {
  const item = { ...DEFAULT_ITEM, start: '2026-09-10T08:00:00Z', end: '2026-09-10T12:00:00Z' };
  assert.equal(isActive(item, at('2026-09-10T11:59:59Z')), true);
  assert.equal(isActive(item, at('2026-09-10T12:00:00Z')), false);
});

test('enabled false esclude l\'item', () => {
  assert.equal(isActive({ ...DEFAULT_ITEM, enabled: false }, at('2026-09-10T10:00:00Z')), false);
});

test('senza contenuti attivi ricade sul default', () => {
  const schedule = {
    items: [
      DEFAULT_ITEM,
      { ...DEFAULT_ITEM, id: 'future', start: '2030-01-01T00:00:00Z', priority: 99 },
    ],
  };
  assert.equal(selectContent(schedule, at('2026-09-10T10:00:00Z')).id, 'default');
});

test('vince lo start più recente, non la priority più alta', () => {
  const schedule = {
    items: [
      DEFAULT_ITEM,
      { ...DEFAULT_ITEM, id: 'vecchio-prioritario', start: '2026-09-01T00:00:00Z', priority: 100 },
      { ...DEFAULT_ITEM, id: 'recente', start: '2026-09-09T00:00:00Z', priority: 1 },
    ],
  };
  assert.equal(selectContent(schedule, at('2026-09-10T10:00:00Z')).id, 'recente');
});

test('a parità di start vince la priority più alta', () => {
  const schedule = {
    items: [
      DEFAULT_ITEM,
      { ...DEFAULT_ITEM, id: 'bassa', start: '2026-09-09T00:00:00Z', priority: 1 },
      { ...DEFAULT_ITEM, id: 'alta', start: '2026-09-09T00:00:00Z', priority: 10 },
    ],
  };
  assert.equal(selectContent(schedule, at('2026-09-10T10:00:00Z')).id, 'alta');
});

test('schedule vuoto non seleziona nulla', () => {
  assert.equal(selectContent({ items: [] }, at('2026-09-10T10:00:00Z')), null);
  assert.equal(selectContent({}, at('2026-09-10T10:00:00Z')), null);
});

test('una finestra attiva vince sul default', () => {
  const schedule = {
    items: [
      DEFAULT_ITEM,
      { ...DEFAULT_ITEM, id: 'morning', start: '2026-09-10T08:00:00Z', end: '2026-09-10T12:00:00Z', priority: 10 },
    ],
  };
  assert.equal(selectContent(schedule, at('2026-09-10T09:00:00Z')).id, 'morning');
});
