export function bindHarborControls(
  canvas: HTMLCanvasElement,
  stick: HTMLElement,
  look: (dx: number, dy: number) => void,
  wake: () => void,
) {
  const movement = { sideways: 0, forward: 0 };
  let stickPointer: number | null = null;
  let lookPointer: number | null = null;
  let lastX = 0;
  let lastY = 0;
  let centerX = 0;
  let centerY = 0;
  let radius = 1;

  function updateStick(event: PointerEvent) {
    const x = (event.clientX - centerX) / radius;
    const y = (event.clientY - centerY) / radius;
    const length = Math.hypot(x, y);
    const scale = Math.max(1, length);
    const strength = Math.max(0, (Math.min(length, 1) - 0.12) / 0.88);
    movement.sideways = length ? x / length * strength : 0;
    movement.forward = length ? -y / length * strength : 0;
    stick.style.setProperty('--stick-x', `${x / scale * radius}px`);
    stick.style.setProperty('--stick-y', `${y / scale * radius}px`);
    wake();
  }

  function releaseStick(pointer: number | null) {
    if (pointer === null || pointer !== stickPointer) return;
    stickPointer = null;
    movement.sideways = 0;
    movement.forward = 0;
    stick.style.removeProperty('--stick-x');
    stick.style.removeProperty('--stick-y');
    stick.classList.remove('held');
    if (stick.hasPointerCapture(pointer)) stick.releasePointerCapture(pointer);
    wake();
  }

  function releaseLook(pointer: number | null) {
    if (pointer === null || pointer !== lookPointer) return;
    lookPointer = null;
    if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  }

  stick.addEventListener('pointerdown', (event) => {
    if (stickPointer !== null || event.button !== 0) return;
    const bounds = stick.getBoundingClientRect();
    centerX = bounds.left + bounds.width / 2;
    centerY = bounds.top + bounds.height / 2;
    radius = bounds.width * 0.31;
    stickPointer = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    stick.classList.add('held');
    updateStick(event);
  });
  stick.addEventListener('pointermove', (event) => {
    if (event.pointerId === stickPointer) updateStick(event);
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (lookPointer !== null || event.button !== 0 || event.offsetX < canvas.clientWidth / 2) return;
    lookPointer = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== lookPointer) return;
    look(event.clientX - lastX, event.clientY - lastY);
    lastX = event.clientX;
    lastY = event.clientY;
    wake();
  });

  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    stick.addEventListener(event, ({ pointerId }) => releaseStick(pointerId));
    canvas.addEventListener(event, ({ pointerId }) => releaseLook(pointerId));
  }

  function reset() {
    releaseStick(stickPointer);
    releaseLook(lookPointer);
  }
  window.addEventListener('blur', reset);

  return { movement, reset };
}
