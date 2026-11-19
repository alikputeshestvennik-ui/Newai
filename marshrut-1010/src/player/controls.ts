const deadZone = 0.12;
const lookSlop = 2;

export function bindHarborControls(
  canvas: HTMLCanvasElement,
  moveStick: HTMLElement,
  wake: () => void,
  onLook: (dx: number, dy: number) => void,
) {
  const movement = { pointer: null as number | null, centerX: 0, centerY: 0, radius: 1, x: 0, y: 0 };
  const look = { pointer: null as number | null, lastX: 0, lastY: 0 };

  function releasePointer(pointer: number) {
    if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  }

  function releaseMovement() {
    const { pointer } = movement;
    if (pointer === null) return;
    movement.pointer = null;
    movement.x = 0;
    movement.y = 0;
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
      movement.centerY = event.clientY;
      movement.pointer = event.pointerId;
      moveStick.style.setProperty('--stick-center-x', `${movement.centerX}px`);
      moveStick.style.setProperty('--stick-center-y', `${movement.centerY}px`);
      moveStick.style.removeProperty('--stick-x');
      moveStick.style.removeProperty('--stick-y');
      moveStick.hidden = false;
      movement.radius = moveStick.offsetWidth * 0.31;
    } else {
      if (look.pointer !== null || movement.x || movement.y) return;
      look.pointer = event.pointerId;
      look.lastX = event.clientX;
      look.lastY = event.clientY;
    }
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId === movement.pointer) {
      const dx = (event.clientX - movement.centerX) / movement.radius;
      const dy = (event.clientY - movement.centerY) / movement.radius;
      const length = Math.hypot(dx, dy);
      const strength = Math.max(0, (Math.min(length, 1) - deadZone) / (1 - deadZone));
      const scale = length > 0 ? strength / length : 0;
      movement.x = dx * scale;
      movement.y = dy * scale;
      moveStick.style.setProperty('--stick-x', `${movement.x * movement.radius}px`);
      moveStick.style.setProperty('--stick-y', `${movement.y * movement.radius}px`);
      if (movement.x || movement.y) releaseLook();
      wake();
    } else if (event.pointerId === look.pointer) {
      const dx = event.clientX - look.lastX;
      const dy = event.clientY - look.lastY;
      if (Math.hypot(dx, dy) <= lookSlop) return;
      look.lastX = event.clientX;
      look.lastY = event.clientY;
      onLook(dx, dy);
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
