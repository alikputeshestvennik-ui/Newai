import tuning from '../../data/player.json';

const lookSlop = 2;

export function bindHarborControls(
  canvas: HTMLCanvasElement,
  moveStick: HTMLElement,
  wake: () => void,
  onLook: (dx: number, dy: number, walking: boolean) => void,
) {
  const movement = { pointer: null as number | null, centerX: 0, radius: 1, sideways: 0 };
  const look = { pointer: null as number | null, lastX: 0, lastY: 0 };

  function releasePointer(pointer: number) {
    if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  }

  function releaseMovement() {
    const { pointer } = movement;
    if (pointer === null) return;
    movement.pointer = null;
    movement.sideways = 0;
    releasePointer(pointer);
    moveStick.hidden = true;
    wake();
  }

  function releaseLook() {
    const { pointer } = look;
    if (pointer === null) return;
    look.pointer = null;
    releasePointer(pointer);
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const bounds = canvas.getBoundingClientRect();
    if (event.clientX < bounds.left + bounds.width / 2) {
      if (movement.pointer !== null) return;
      movement.centerX = event.clientX;
      movement.pointer = event.pointerId;
      moveStick.style.setProperty('--stick-center-x', `${movement.centerX}px`);
      moveStick.style.setProperty('--stick-center-y', `${event.clientY}px`);
      moveStick.style.removeProperty('--stick-x');
      moveStick.hidden = false;
      movement.radius = moveStick.offsetWidth * 0.31;
      wake();
    } else {
      if (look.pointer !== null) return;
      look.pointer = event.pointerId;
      look.lastX = event.clientX;
      look.lastY = event.clientY;
    }
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId === movement.pointer) {
      const dx = (event.clientX - movement.centerX) / movement.radius;
      movement.sideways = Math.abs(dx) >= tuning.strafeThreshold ? Math.sign(dx) : 0;
      moveStick.style.setProperty('--stick-x', `${movement.sideways * movement.radius}px`);
      wake();
    } else if (event.pointerId === look.pointer) {
      const dx = event.clientX - look.lastX;
      const dy = event.clientY - look.lastY;
      const walking = movement.pointer !== null;
      if (walking) {
        look.lastY = event.clientY;
        if (Math.abs(dx) <= lookSlop) return;
      } else if (Math.hypot(dx, dy) <= lookSlop) return;
      look.lastX = event.clientX;
      look.lastY = event.clientY;
      onLook(dx, walking ? 0 : dy, walking);
      wake();
    }
  });

  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    canvas.addEventListener(event, ({ pointerId }) => {
      if (pointerId === movement.pointer) releaseMovement();
      if (pointerId === look.pointer) releaseLook();
    });
  }

  function reset() {
    releaseMovement();
    releaseLook();
  }
  window.addEventListener('blur', reset);

  return { movement, reset };
}
