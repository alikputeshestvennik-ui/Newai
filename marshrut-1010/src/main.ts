import ru from '../data/ru.json';
import { loadTicketProgress, saveTicketProgress, type TicketState } from './harbor/ticket';
import { showHarbor, type HarborStats } from './render/scene';
import { paintTicket } from './render/ticket';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#harbor')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const stats = document.querySelector<HTMLOutputElement>('#stats')!;
const stick = document.querySelector<HTMLElement>('#move-stick')!;
const objective = document.querySelector<HTMLParagraphElement>('#objective')!;
const pickUp = document.querySelector<HTMLButtonElement>('#pick-up-ticket')!;
const open = document.querySelector<HTMLButtonElement>('#open-ticket')!;
const dialog = document.querySelector<HTMLDialogElement>('#ticket-dialog')!;
const symbol = document.querySelector<HTMLCanvasElement>('#ticket-symbol')!;
const words = ru.ticket;
let ticket: TicketState = { progress: loadTicketProgress(), nearTicket: false, wrongSign: undefined };
let harbor: Awaited<ReturnType<typeof showHarbor>> | undefined;

document.querySelector('#title')!.textContent = ru.title;
document.querySelector('#place')!.textContent = ru.place;
document.querySelector('#rotate-hint')!.textContent = ru.rotateHint;
status.textContent = ru.loading;
stick.setAttribute('aria-label', ru.moveStick);
pickUp.textContent = words.pickUp;
open.textContent = words.open;
dialog.querySelector('h2')!.textContent = words.title;
dialog.querySelector('p')!.textContent = words.clue;
dialog.querySelector('button')!.textContent = words.close;
symbol.setAttribute('aria-label', words.symbol);
paintTicket(symbol);

function displayObjective() {
  const wrong = ticket.wrongSign as keyof typeof words.wrong | undefined;
  objective.textContent = (wrong && words.wrong[wrong]) || words[ticket.progress];
  objective.hidden = false;
  objective.classList.toggle('objective-complete', ticket.progress === 'complete');
  pickUp.hidden = !ticket.nearTicket;
  open.hidden = ticket.progress === 'find';
}

function openTicket() {
  harbor?.stopWalking();
  dialog.showModal();
}

pickUp.addEventListener('click', () => {
  if (harbor?.pickUpTicket()) openTicket();
});
open.addEventListener('click', openTicket);
dialog.addEventListener('close', () => open.focus());
matchMedia('(orientation: portrait)').addEventListener('change', ({ matches }) => {
  if (matches && dialog.open) dialog.close();
});

const showStats = new URLSearchParams(location.search).has('stats');

function updateStats({ fps, calls, triangles }: HarborStats) {
  stats.hidden = false;
  stats.value = ru.stats
    .replace('{fps}', String(fps))
    .replace('{calls}', String(calls))
    .replace('{triangles}', String(triangles));
}

void showHarbor(canvas, stick, {
  ticketProgress: ticket.progress,
  onTicketChange(next) {
    if (next.progress !== ticket.progress) saveTicketProgress(next.progress);
    ticket = next;
    displayObjective();
  },
  onReady() {
    status.textContent = ru.ready;
    displayObjective();
  },
  onContextLost() {
    status.textContent = ru.contextLost;
    stats.hidden = true;
    objective.hidden = true;
    pickUp.hidden = true;
    open.hidden = true;
    if (dialog.open) dialog.close();
  },
  onStats: showStats ? updateStats : undefined,
}).then((scene) => {
  harbor = scene;
}).catch((error) => {
  status.textContent = ru.unavailable;
  console.error(error);
});
