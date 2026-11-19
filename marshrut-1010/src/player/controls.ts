const deadZone = 0.12;
const lookRadius = 44;

function createStick(radius: number) {
  return { pointer: null as number | null, centerX: 0, centerY: 0, radius, x: 0, y: 0 };
}

function deflect(stick: ReturnType<typeof createStick>, event: PointerEvent) {
  const dx = (event.clientX - stick.centerX) / stick.radius;
  const dy = (event.clientY - stick.centerY) / stick.radius;
  const length = Math.hypot(dx, dy);
  const strength = Math.max(0, (Math.min(length, 1) - deadZone) / (1 - deadZone));
  const scale = length > 0 ? strength / length : 0;
  stick.x = dx * scale;
  stick.y = dy * scale;
}

export function bindHarborControls(
  canvas: HTMLCanvasElement,
  moveStick: HTMLElement,
  wake: () => void,
) {
  const movement = createStick(1);
  const look = createStick(lookRadius);

  function isMoving() {
    return movement.x !== 0 || movement.y !== 0;
  }

  function release(stick: typeof movement) {
    const { pointer } = stick;
    if (pointer === null) return;
    stick.pointer = null;
    stick.x = 0;
    stick.y = 0;
    if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    if (stick === movement) moveStick.hidden = true;
    wake();
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const bounds = canvas.getBoundingClientRect();
    const stick = event.clientX < bounds.left + bounds.width / 2 ? movement : look;
    if (stick.pointer !== null || (stick === look && isMoving())) return;

    stick.centerX = event.clientX;
    stick.centerY = event.clientY;
    stick.pointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    if (stick === movement) {
      moveStick.style.setProperty('--stick-center-x', `${stick.centerX}px`);
      moveStick.style.setProperty('--stick-center-y', `${stick.centerY}px`);
      moveStick.style.removeProperty('--stick-x');
      moveStick.style.removeProperty('--stick-y');
      moveStick.hidden = false;
      stick.radius = moveStick.offsetWidth * 0.31;
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId === movement.pointer) {
      deflect(movement, event);
      moveStick.style.setProperty('--stick-x', `${movement.x * movement.radius}px`);
      moveStick.style.setProperty('--stick-y', `${movement.y * movement.radius}px`);
      if (isMoving()) release(look);
    } else if (event.pointerId === look.pointer) {
      deflect(look, event);
    } else {
      return;
    }
    wake();
  });

  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    canvas.addEventListener(event, ({ pointerId }) => {
      if (pointerId === movement.pointer) release(movement);
      if (pointerId === look.pointer) release(look);
    });
  }

  function reset() {
    release(movement);
    release(look);
  }
  window.addEventListener('blur', reset);

  return { movement, look, reset };
}
