import tuning from '../../data/player.json';

const lookSlop = 2;

export function bindHarborControls(
  canvas: HTMLCanvasElement,
  moveStick: HTMLElement,
  wake: () => void,
  onLook: (dx: number, dy: number, walking: boolean) => void,
  enabled: () => boolean,
) {
  const movement = { pointer: null as number | null, centerX: 0, radius: 1, sideways: 0 };
  const look = { pointer: null as number | null, x: 0, y: 0, dx: 0, dy: 0, scale: 1 };

  function clearLookDelta() {
    look.dx = 0;
    look.dy = 0;
  }

  function releasePointer(pointer: number) {
    if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  }

  function releaseMovement() {
    const { pointer } = movement;
    if (pointer === null) return;
    movement.pointer = null;
    movement.sideways = 0;
    clearLookDelta();
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
    if (!enabled() || event.button !== 0) return;
    const bounds = canvas.getBoundingClientRect();
    if (event.clientX < bounds.left + bounds.width / 2) {
      if (movement.pointer !== null) return;
      movement.centerX = event.clientX;
      movement.pointer = event.pointerId;
      clearLookDelta();
      moveStick.style.setProperty('--stick-center-x', `${movement.centerX}px`);
      moveStick.style.setProperty('--stick-center-y', `${event.clientY}px`);
      moveStick.style.removeProperty('--stick-x');
      moveStick.hidden = false;
      movement.radius = moveStick.offsetWidth * 0.31;
      wake();
    } else {
      if (look.pointer !== null) return;
      look.pointer = event.pointerId;
      look.x = event.clientX;
      look.y = event.clientY;
      look.scale = tuning.camera.lookReferenceHeight / bounds.height;
      clearLookDelta();
    }
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId === movement.pointer) {
      const dx = (event.clientX - movement.centerX) / movement.radius;
      const threshold = Math.sign(dx) === movement.sideways ? tuning.strafeExit : tuning.strafeEnter;
      movement.sideways = Math.abs(dx) >= threshold ? Math.sign(dx) : 0;
      moveStick.style.setProperty('--stick-x', `${movement.sideways * movement.radius}px`);
      wake();
    } else if (event.pointerId === look.pointer) {
      const walking = movement.pointer !== null;
      look.dx += (event.clientX - look.x) * look.scale;
      if (!walking) look.dy += (event.clientY - look.y) * look.scale;
      look.x = event.clientX;
      look.y = event.clientY;
      if (Math.hypot(look.dx, look.dy) <= lookSlop) return;
      onLook(look.dx, look.dy, walking);
      clearLookDelta();
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
