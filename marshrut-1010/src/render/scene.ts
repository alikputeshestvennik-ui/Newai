import {
  Color, DirectionalLight, HemisphereLight, Scene, WebGLRenderer,
} from 'three';
import { createTicketQuest, type TicketProgress, type TicketState } from '../harbor/ticket';
import { bindHarborControls } from '../player/controls';
import { createWalker, steerWalker, updateWalker } from '../player/movement';
import { createFollowCamera } from './follow-camera';
import { loadMark } from './mark';
import { buildPier } from './pier';
import { buildTicket } from './ticket';

export interface HarborStats {
  fps: number;
  calls: number;
  triangles: number;
}

interface HarborOptions {
  ticketProgress: TicketProgress;
  onTicketChange: (state: TicketState) => void;
  onReady: () => void;
  onContextLost: () => void;
  onStats?: (stats: HarborStats) => void;
}

export async function showHarbor(canvas: HTMLCanvasElement, stick: HTMLElement, options: HarborOptions) {
  const { ticketProgress, onTicketChange, onReady, onContextLost, onStats } = options;
  const mark = await loadMark();
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  const scene = new Scene();
  scene.background = new Color(0x437a70);
  scene.add(new HemisphereLight(0xffecd5, 0x809b8a, 1.95));

  const sun = new DirectionalLight(0xffddb5, 1.5);
  sun.position.set(-9, 13, 6);
  scene.add(sun);

  const { pier, boats } = buildPier();
  const walker = createWalker();
  const ticketQuest = createTicketQuest(ticketProgress);
  const ticket = buildTicket();
  ticket.visible = ticketProgress === 'find';
  pier.add(ticket);
  scene.add(pier, mark.root);
  const follow = createFollowCamera();
  const controls = bindHarborControls(canvas, stick, schedule, (dx, dy, walking) => {
    if (walking) {
      steerWalker(walker, dx);
    } else {
      follow.look(dx, dy);
    }
  });

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let frameId = 0;
  let needsResize = true;
  let contextLost = false;
  let ready = false;
  let sampleStart = 0;
  let frames = 0;
  let lastFrame = 0;

  function schedule() {
    if (!frameId && !contextLost && !document.hidden) {
      frameId = requestAnimationFrame(draw);
    }
  }

  function resize() {
    needsResize = true;
    controls.reset();
    schedule();
  }

  function draw(now: number) {
    frameId = 0;
    if (needsResize) {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      follow.resize(width, height);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.setSize(width, height, false);
      needsResize = false;
    }

    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
    lastFrame = now;
    const { pointer, sideways } = controls.movement;
    const walking = pointer !== null;
    const { x, z } = walker;
    updateWalker(walker, walking, sideways, dt, motion.matches);
    if (ticketQuest.update(x, z, walker)) onTicketChange(ticketQuest.state);
    mark.root.position.set(walker.x, walker.y, walker.z);
    const posing = mark.pose(walker.heading, walker.x - x, walker.z - z, dt, motion.matches);
    const cameraMoving = follow.follow(walker.x, walker.y, walker.z, walker.heading, walking, dt);
    boats[0].position.y = motion.matches ? 0 : Math.sin(now / 1150) * 0.054;
    boats[1].position.y = motion.matches ? 0 : Math.sin(now / 1090 + 1.5) * 0.07;
    renderer.render(scene, follow.camera);
    if (!ready) {
      ready = true;
      onReady();
    }

    if (onStats) {
      if (!sampleStart) sampleStart = now;
      frames++;
      const elapsed = now - sampleStart;
      if (elapsed >= 1000) {
        const { calls, triangles } = renderer.info.render;
        onStats({ fps: Math.round((frames - 1) * 1000 / elapsed), calls, triangles });
        sampleStart = now;
        frames = 1;
      }
    }
    if (!motion.matches || walking || posing || cameraMoving || onStats) schedule();
    else lastFrame = 0;
  }

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    ready = false;
    cancelAnimationFrame(frameId);
    frameId = 0;
    lastFrame = 0;
    controls.reset();
    onContextLost();
  });

  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    resize();
  });

  new ResizeObserver(resize).observe(canvas);
  motion.addEventListener('change', schedule);
  document.addEventListener('visibilitychange', () => {
    sampleStart = 0;
    frames = 0;
    lastFrame = 0;
    if (document.hidden) {
      cancelAnimationFrame(frameId);
      frameId = 0;
      controls.reset();
    } else {
      resize();
    }
  });
  schedule();

  return {
    pickUpTicket() {
      if (!ready || !ticketQuest.pickUp()) return false;
      ticket.visible = false;
      onTicketChange(ticketQuest.state);
      schedule();
      return true;
    },
    stopWalking() {
      controls.reset();
      walker.forward = 0;
      walker.sideways = 0;
      walker.targetHeading = walker.heading;
      schedule();
    },
  };
}
