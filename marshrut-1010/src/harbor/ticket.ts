import rules from '../../data/harbor-ticket.json';
import signs from '../../data/signs.json';
import { signFace } from './layout';

type Point = { x: number; z: number };
export type TicketProgress = 'find' | 'choose' | 'complete';

export const matchingSign = signs.find(({ id }) => id === rules.matchingSign)!;
const saveKey = 'route-1010:harbor-ticket:v1';

export function loadTicketProgress(): TicketProgress {
  try {
    const saved = localStorage.getItem(saveKey);
    if (saved === 'choose' || saved === 'complete') return saved;
  } catch {
    // The puzzle is still playable when storage is unavailable.
  }
  return 'find';
}

export function saveTicketProgress(progress: TicketProgress) {
  try {
    localStorage.setItem(saveKey, progress);
  } catch {
    // Keep progress for the current session.
  }
}

export function createTicketQuest(progress: TicketProgress) {
  let nearTicket = false;
  let wrongSign: string | undefined;

  return {
    get state() {
      return { progress, nearTicket, wrongSign };
    },
    update(previousX: number, previousZ: number, { x, z }: Point) {
      if (progress === 'find') {
        const { pickup } = rules;
        const inReach = Math.hypot(x - pickup.x, z - pickup.z) <= pickup.radius;
        if (inReach === nearTicket) return false;
        nearTicket = inReach;
        return true;
      }
      if (progress === 'complete') return false;
      if (wrongSign && z >= rules.returnLine) {
        wrongSign = undefined;
        return true;
      }
      if (previousZ <= signFace.z || z > signFace.z) return false;

      const gateX = previousX + (x - previousX) * (previousZ - signFace.z) / (previousZ - z);
      const sign = signs.find((sign) => Math.abs(sign.x - gateX) <= rules.gateWidth / 2);
      if (!sign) return false;

      if (sign === matchingSign) {
        progress = 'complete';
        wrongSign = undefined;
      } else {
        wrongSign = sign.id;
      }
      return true;
    },
    pickUp() {
      if (progress !== 'find' || !nearTicket) return false;
      progress = 'choose';
      nearTicket = false;
      return true;
    },
  };
}

export type TicketState = ReturnType<typeof createTicketQuest>['state'];
