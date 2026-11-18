import { D } from '../sim/config';
import { alignment, railway } from '../sim/alignment';
import type { RoadPoint } from '../sim/roads';
import type { World, Mode } from '../sim/types';

type Segment = { start: RoadPoint; end: RoadPoint; key: string; direction: number; lane: number };
export function layoutNetwork(world: Pick<World, 'districts' | 'routes'>, draft: number[], draftMode:Mode='marshrutka') {
  const corridors = new Map<string, Set<number>>();
  const routes = [...world.routes, { id: 0, stops: draft, mode:draftMode }].filter(route => route.stops.length > 1).map(route => {
    const segments: Segment[] = [];
    for (let index = 1; index < route.stops.length; index++) {
      const points = alignment(route.mode,world.districts[route.stops[index - 1]], world.districts[route.stops[index]]);
      for (let step = 1; step < points.length; step++) {
        const start = points[step - 1], end = points[step];
        const direction = Math.sign(start[0] - end[0] || start[1] - end[1]);
        if (!direction) continue;
        const key = direction > 0 ? `${start}:${end}` : `${end}:${start}`;
        if (!corridors.has(key)) corridors.set(key, new Set());
        corridors.get(key)!.add(route.id);
        segments.push({ start, end, key, direction, lane: 0 });
      }
    }
    return { id: route.id, mode: route.mode, segments };
  });
  for (const route of routes) for (const segment of route.segments) {
    const ids = [...corridors.get(segment.key)!].sort((first, second) => first - second);
    segment.lane = segment.direction * (ids.indexOf(route.id) - (ids.length - 1) / 2);
  }
  return routes;
}

function svgElement<Tag extends keyof SVGElementTagNameMap>(name: Tag) {
  return document.createElementNS('http://www.w3.org/2000/svg', name);
}

export class NetworkInk {
  readonly svg = svgElement('svg');
  private tracks: { segments: Segment[]; ink: SVGPathElement; rim: SVGPathElement }[] = [];
  private stops: { point: RoadPoint; dot: SVGCircleElement }[] = [];
  constructor(host: HTMLElement) {
    this.svg.classList.add('network-ink'); this.svg.setAttribute('aria-hidden', 'true'); host.append(this.svg);
  }
  update(world: World, draft: number[], focus?: number, draftMode:Mode='marshrutka') {
    this.svg.replaceChildren(); this.tracks = []; this.stops = [];
    const visible = focus ? world.routes.filter(route => route.id === focus) : world.routes;
    for (const route of layoutNetwork({ districts: world.districts, routes: visible }, draft,draftMode)) {
      const rim = svgElement('path'), ink = svgElement('path');
      rim.setAttribute('stroke', '#17303c'); rim.setAttribute('stroke-width', '5.6');
      ink.setAttribute('stroke', route.id ? D.colors[(route.id - 1) % D.colors.length] : '#ffdf80');
      ink.setAttribute('stroke-width', '3.3'); ink.dataset.route = String(route.id);
      if (!route.id) ink.setAttribute('stroke-dasharray', '5 5');
      else if (route.mode==='metro') ink.setAttribute('stroke-dasharray','9 3');
      this.svg.append(rim, ink); this.tracks.push({ segments: route.segments, rim, ink });
    }
    for (const district of world.districts) {
      const serving = visible.filter(route => route.stops.includes(district.id));
      if (!serving.length && !draft.includes(district.id)) continue;
      const dot = svgElement('circle'); dot.setAttribute('r', serving.length > 1 ? '5.3' : '3.4');
      dot.setAttribute('fill', draft.includes(district.id) ? '#ffdf80' : '#fff9e8');
      dot.setAttribute('stroke', '#17303c'); dot.setAttribute('stroke-width', serving.length > 1 ? '2.8' : '1.6');
      const modes=serving.map(route=>route.mode);
      if(draft.includes(district.id))modes.push(draftMode);
      const heights=new Set(modes.map(mode=>mode==='suburban'?railway.trackZ:district.y));
      for(const height of heights){const marker=dot.cloneNode(false) as SVGCircleElement;this.svg.append(marker);this.stops.push({point:[district.x,height],dot:marker});}
    }
  }
  project(project: (point: RoadPoint) => RoadPoint) {
    for (const { segments, rim, ink } of this.tracks) {
      let path = '';
      for (const { start, end, lane } of segments) {
        const [ax, ay] = project(start), [bx, by] = project(end);
        const scale = 5.8 * lane / (Math.hypot(bx - ax, by - ay) || 1);
        const dx = (ay - by) * scale, dy = (bx - ax) * scale;
        path += `${path ? 'L' : 'M'}${(ax + dx).toFixed(1)} ${(ay + dy).toFixed(1)}L${(bx + dx).toFixed(1)} ${(by + dy).toFixed(1)}`;
      }
      rim.setAttribute('d', path); ink.setAttribute('d', path);
    }
    for (const { point, dot } of this.stops) {
      const [x, y] = project(point); dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1));
    }
  }
}
