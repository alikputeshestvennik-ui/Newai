import episode from '../../data/episode.json';

export type Phase = 'quay' | 'table' | 'inspect' | 'found' | 'aim' | 'won';
export type Contact = 'lion' | 'anchor' | 'water';
export const text = episode;
export const newGame = () => ({ phase: 'quay' as Phase, exposure: 0, attempts: 0, cooldown: 0 });
export type Game = ReturnType<typeof newGame>;

export function advance(game: Game) {
  switch (game.phase) {
    case 'quay': game.phase = 'table'; break;
    case 'table': game.phase = 'inspect'; break;
    case 'found': game.phase = 'aim'; break;
    case 'won': Object.assign(game, newGame()); break;
  }
}

export function tick(game: Game, dt: number, facing: number) {
  game.cooldown = Math.max(0, game.cooldown - dt);
  if (game.phase !== 'inspect') return;
  game.exposure = facing >= episode.rules.minimumFacing ? game.exposure + dt : 0;
  if (game.exposure >= episode.rules.exposureSeconds) game.phase = 'found';
}

export function signal(game: Game, contact: Contact) {
  if (game.phase !== 'aim' || game.cooldown > 0) return false;
  game.attempts++;
  game.cooldown = episode.rules.shotCooldown;
  if (contact === 'lion') game.phase = 'won';
  return true;
}
