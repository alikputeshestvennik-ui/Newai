import ru from '../data/ru.json';
import { showHarbor, type HarborStats } from './render/scene';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#harbor')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const stats = document.querySelector<HTMLOutputElement>('#stats')!;
const stick = document.querySelector<HTMLElement>('#move-stick')!;

document.querySelector('#title')!.textContent = ru.title;
document.querySelector('#place')!.textContent = ru.place;
status.textContent = ru.loading;
stick.setAttribute('aria-label', ru.moveStick);
const showStats = new URLSearchParams(location.search).has('stats');

function updateStats({ fps, calls, triangles }: HarborStats) {
  stats.hidden = false;
  stats.value = ru.stats
    .replace('{fps}', String(fps))
    .replace('{calls}', String(calls))
    .replace('{triangles}', String(triangles));
}

try {
  showHarbor(
    canvas,
    stick,
    () => {
      status.textContent = ru.ready;
      stick.hidden = false;
    },
    () => {
      status.textContent = ru.contextLost;
      stick.hidden = true;
      stats.hidden = true;
    },
    showStats ? updateStats : undefined,
  );
} catch (error) {
  status.textContent = ru.unavailable;
  console.error(error);
}
