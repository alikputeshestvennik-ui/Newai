import { expect, it } from 'vitest';
import { advance, newGame, signal, tick } from '../src/story/episode';
it('requires a steady view of the engraving before opening the balcony', () => {
  const g = newGame();
  advance(g); advance(g); advance(g);
  tick(g, 0.4, 1); tick(g, 0.1, 0); tick(g, 0.3, 1);
  expect(g.phase).toBe('inspect');
  tick(g, 0.3, 1); expect(g.phase).toBe('found');
  expect(signal(g, 'lion')).toBe(false);
  advance(g); expect(g.phase).toBe('aim');
});
it('permits immediate retries after cooldown and only the lion completes the encounter', () => {
  const g = newGame(); g.phase = 'aim';
  expect(signal(g, 'anchor')).toBe(true);
  expect(signal(g, 'lion')).toBe(false);
  tick(g, 1, 0); signal(g, 'water'); expect(g.phase).toBe('aim');
  tick(g, 1, 0); signal(g, 'lion'); expect(g.phase).toBe('won');
  expect(g.attempts).toBe(3); advance(g); expect(g).toEqual(newGame());
});
