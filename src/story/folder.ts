import chapters from '../../data/story/folder.json' with { type: 'json' };
import { coverage } from '../sim/goals';
import type { World, Result } from '../sim/types';

export { chapters };
export const nextChapter = (world: World) => chapters.at(world.story.length);
export function isReady(world: World) {
  const chapter = nextChapter(world);
  return !!chapter && !world.gameOver && world.served >= chapter.served && coverage(world) >= chapter.coverage;
}
export function validStory(history: unknown): history is string[] {
  return Array.isArray(history) && history.length <= chapters.length && history.every((id, index) => chapters[index].choices.some(choice => choice.id === id));
}
export function decide(world: World, id: string): Result {
  const choice = nextChapter(world)?.choices.find(option => option.id === id);
  if (!choice || !isReady(world)) return {ok:false,error:'storyLocked'};
  if (choice.cash < 0 && world.money < -choice.cash) return {ok:false,error:'noMoney'};
  world.story.push(id);
  world.money += choice.cash;
  if (choice.cash > 0) { world.income += choice.cash; world.ledger.storyReceipts += choice.cash; }
  if (choice.cash < 0) { world.expenses -= choice.cash; world.ledger.storyPayments -= choice.cash; }
  world.trust = Math.max(0, Math.min(100, world.trust + choice.trust));
  return {ok:true};
}
export function ending(history: string[]) {
  if (history.length !== chapters.length) return null;
  if (history.includes('leave')) return 'walkAway';
  if (history.includes('publish') && history.includes('publicBoard')) return 'citizens';
  return history.includes('takeGrant') && history.includes('seal') ? 'deal' : 'machine';
}
