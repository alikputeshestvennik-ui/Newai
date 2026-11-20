import { describe, expect, it } from 'vitest';
import rules from '../data/harbor-ticket.json';
import signs from '../data/signs.json';
import { signFace } from '../src/harbor/layout';
import { createTicketQuest, matchingSign } from '../src/harbor/ticket';
import { canWalk } from '../src/player/movement';

const approach = { x: 0, z: signFace.z + 0.1 };
const through = (x: number) => ({ x, z: signFace.z - 0.1 });

describe('harbor ticket', () => {
  it('requires Mark to reach and pick up the ticket before the correct passage counts', () => {
    const quest = createTicketQuest('find');
    expect(quest.pickUp()).toBe(false);
    quest.update(approach.x, approach.z, through(matchingSign.x));
    expect(quest.state.progress).toBe('find');

    const nearby = { x: 0, z: rules.pickup.z };
    expect(canWalk(nearby.x, nearby.z)).toBe(true);
    expect(quest.update(0, 3.5, nearby)).toBe(true);
    expect(quest.state.nearTicket).toBe(true);
    expect(quest.pickUp()).toBe(true);
    expect(quest.pickUp()).toBe(false);
    expect(quest.state.progress).toBe('choose');
    expect(quest.update(approach.x, approach.z, through(matchingSign.x))).toBe(true);
    expect(quest.state.progress).toBe('complete');
  });

  it.each(signs.filter(({ id }) => id !== matchingSign.id))('lets Mark return from passage $id', ({ id, x }) => {
    const quest = createTicketQuest('choose');
    expect(canWalk(x, signFace.z - 0.1)).toBe(true);
    expect(quest.update(x, approach.z, through(x))).toBe(true);
    expect(quest.state).toMatchObject({ progress: 'choose', wrongSign: id });
    expect(quest.update(x, signFace.z - 0.1, { x, z: rules.returnLine })).toBe(true);
    expect(quest.state.wrongSign).toBeUndefined();
    expect(quest.update(x, approach.z, { x, z: approach.z })).toBe(false);
    expect(quest.update(matchingSign.x, approach.z, through(matchingSign.x))).toBe(true);
    expect(quest.state.progress).toBe('complete');
  });

  it('only accepts a crossing toward the pavilion inside a gate', () => {
    const quest = createTicketQuest('choose');
    const x = matchingSign.x;
    expect(quest.update(x, signFace.z - 0.1, { x, z: approach.z })).toBe(false);
    expect(quest.update(x + 1, approach.z, through(x + 1))).toBe(false);
    expect(quest.update(x + 1, approach.z, through(x - 1))).toBe(true);
    expect(quest.state.progress).toBe('complete');
    expect(quest.update(-2.27, approach.z, through(-2.27))).toBe(false);
  });
});
