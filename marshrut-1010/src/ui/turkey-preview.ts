import chapter from '../../data/turkey-preview.json';
import ru from '../../data/ru.json';
import type { PreviewFrame } from '../render/preview';
import {
  advanceRun, checkSignal, createRun, loadCheckpoint, saveCheckpoint, shiftLane,
  type Checkpoint, type Cutscene, type PreviewTarget,
} from '../story/turkey-preview';

const words = ru.preview;
const targets = ['ring', 'board', 'lamp'] as const;

export function createTurkeyPreview(root: HTMLElement, canvas: HTMLCanvasElement, refresh: () => void) {
  const panel = root.querySelector<HTMLElement>('#preview')!;
  const enter = root.querySelector<HTMLButtonElement>('#start-preview')!;
  const title = panel.querySelector<HTMLElement>('#preview-title')!;
  const speaker = panel.querySelector<HTMLElement>('#preview-speaker')!;
  const message = panel.querySelector<HTMLElement>('#preview-message')!;
  const main = panel.querySelector<HTMLButtonElement>('#preview-main')!;
  const skip = panel.querySelector<HTMLButtonElement>('#preview-skip')!;
  const back = panel.querySelector<HTMLButtonElement>('#preview-back')!;
  const lanes = panel.querySelector<HTMLElement>('#run-controls')!;
  const aim = panel.querySelector<HTMLElement>('#preview-targets')!;
  const buttons = new Map(targets.map((id) => {
    const button = aim.querySelector<HTMLButtonElement>(`[data-target="${id}"]`)!;
    button.textContent = words.targets[id];
    button.addEventListener('click', () => {
      selected = id;
      wrongTarget = false;
      display();
    });
    return [id, button];
  }));
  const frame: PreviewFrame = { stage: loadCheckpoint(), line: 0, signaled: false, run: createRun() };
  let active = false;
  let available = false;
  let selected: PreviewTarget | undefined;
  let wrongTarget = false;

  back.textContent = words.back;
  skip.textContent = words.skip;
  for (const [id, direction] of [['left', -1], ['right', 1]] as const) {
    const button = lanes.querySelector<HTMLButtonElement>(`#run-${id}`)!;
    button.setAttribute('aria-label', words[id]);
    button.addEventListener('click', () => shiftLane(frame.run, direction));
  }

  function display() {
    if (!active) {
      enter.hidden = !available;
      enter.textContent = frame.stage === 'intro' ? words.enter : words.resume;
      return;
    }
    const { stage, line, signaled, run } = frame;
    const cutscene = stage === 'intro' || stage === 'outro';
    const viewfinder = stage === 'aim';
    panel.dataset.stage = stage;
    title.textContent = words.titles[stage];
    skip.hidden = !cutscene;
    aim.hidden = !viewfinder || signaled;
    lanes.hidden = stage !== 'runner' || run.result !== 'running';
    main.hidden = !lanes.hidden;
    main.disabled = viewfinder && !signaled && !selected;
    speaker.hidden = !cutscene;
    for (const [id, button] of buttons) button.setAttribute('aria-pressed', String(selected === id));

    if (cutscene) {
      const beat = chapter[stage][line];
      speaker.textContent = beat.speaker;
      message.textContent = beat.line;
      main.textContent = line < chapter[stage].length - 1
        ? words.next : stage === 'intro' ? words.aim : words.finish;
    } else if (viewfinder) {
      message.textContent = signaled ? words.signalOk : wrongTarget ? words.signalWrong : words.signalHint;
      main.textContent = signaled ? words.toRun : words.confirm;
    } else if (stage === 'runner' && run.result !== 'finish') {
      message.textContent = run.result === 'running' ? words.runGates[run.gate] : words.run[run.result];
      main.textContent = run.result === 'ready' ? words.runStart : words.retry;
    } else {
      message.textContent = words.summary;
      main.textContent = words.replay;
    }
  }

  function goTo(stage: Checkpoint) {
    frame.stage = stage;
    frame.line = 0;
    frame.signaled = false;
    frame.run = createRun();
    selected = undefined;
    wrongTarget = false;
    saveCheckpoint(stage);
    display();
    refresh();
  }

  function endCutscene(stage: Cutscene) {
    goTo(stage === 'intro' ? 'aim' : 'complete');
  }

  enter.addEventListener('click', () => {
    if (!available || active) return;
    active = true;
    root.classList.add('playing-preview');
    enter.hidden = true;
    panel.hidden = false;
    display();
    refresh();
  });

  back.addEventListener('click', () => {
    active = false;
    if (frame.stage === 'aim' && frame.signaled) {
      frame.stage = 'runner';
      frame.signaled = false;
    }
    frame.line = 0;
    frame.run = createRun();
    selected = undefined;
    wrongTarget = false;
    cancelSwipe();
    panel.hidden = true;
    root.classList.remove('playing-preview');
    display();
    refresh();
    enter.focus();
  });

  skip.addEventListener('click', () => {
    if (frame.stage === 'intro' || frame.stage === 'outro') endCutscene(frame.stage);
  });
  main.addEventListener('click', () => {
    const { stage, signaled, run } = frame;
    if (stage === 'intro' || stage === 'outro') {
      if (frame.line + 1 === chapter[stage].length) {
        endCutscene(stage);
        return;
      }
      frame.line++;
    } else if (stage === 'aim') {
      if (signaled) {
        goTo('runner');
        return;
      }
      if (checkSignal(selected)) {
        frame.signaled = true;
        saveCheckpoint('runner');
      } else {
        wrongTarget = true;
      }
    } else if (stage === 'runner') {
      if (run.result === 'running') return;
      frame.run = createRun();
      frame.run.result = 'running';
    } else {
      goTo('intro');
      return;
    }
    display();
    refresh();
  });

  let swipe: { id: number; x: number } | undefined;
  canvas.addEventListener('pointerdown', (event) => {
    if (!active || frame.stage !== 'runner' || frame.run.result !== 'running' || swipe || event.button !== 0) return;
    swipe = { id: event.pointerId, x: event.clientX };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (swipe?.id !== event.pointerId || !active || frame.stage !== 'runner') return;
    const dx = event.clientX - swipe.x;
    if (Math.abs(dx) < 28) return;
    shiftLane(frame.run, dx > 0 ? 1 : -1);
    swipe.x = event.clientX;
  });
  function cancelSwipe() {
    const pointer = swipe?.id;
    swipe = undefined;
    if (pointer !== undefined && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    canvas.addEventListener(event, ({ pointerId }) => {
      if (pointerId === swipe?.id) cancelSwipe();
    });
  }
  window.addEventListener('blur', cancelSwipe);
  window.addEventListener('keydown', (event) => {
    if (!active || frame.stage !== 'runner' || frame.run.result !== 'running' || event.repeat) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      shiftLane(frame.run, event.key === 'ArrowLeft' ? -1 : 1);
    }
  });

  return {
    frame,
    get active() { return active; },
    setAvailable(value: boolean) {
      available = value;
      display();
    },
    cancelSwipe,
    update(dt: number) {
      const { run } = frame;
      if (frame.stage !== 'runner' || run.result !== 'running') return;
      const gate = run.gate;
      const result = advanceRun(run, dt);
      if (result !== 'running') cancelSwipe();
      if (result === 'finish') goTo('outro');
      else if (result !== 'running' || gate !== run.gate) display();
    },
    placeTarget(id: PreviewTarget, x: number, y: number) {
      const button = buttons.get(id)!;
      button.style.left = `${100 * x}%`;
      button.style.top = `${100 * y}%`;
    },
  };
}
