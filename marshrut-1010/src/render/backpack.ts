import {
  BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Mesh, MeshStandardMaterial,
  TubeGeometry, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function buildBackpack() {
  const parts: BufferGeometry[] = [];

  function add(geometry: BufferGeometry, tint: number) {
    const vertices = geometry.index ? geometry.toNonIndexed() : geometry;
    vertices.deleteAttribute('uv');
    const color = new Color(tint);
    const colors = new Float32Array(vertices.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    vertices.setAttribute('color', new Float32BufferAttribute(colors, 3));
    parts.push(vertices);
    if (geometry !== vertices) geometry.dispose();
  }

  function panel(color: number, width: number, height: number, depth: number,
    radius: number, x: number, y: number, z: number) {
    add(new RoundedBoxGeometry(width, height, depth, 2, radius).translate(x, y, z), color);
  }

  panel(0x746347, 0.30, 0.39, 0.15, 0.045, 0, -0.031, -0.17);
  panel(0xb29867, 0.275, 0.342, 0.08, 0.04, 0, -0.023, -0.218);
  panel(0x8d724e, 0.225, 0.16, 0.047, 0.019, 0, -0.121, -0.251);
  panel(0x433f37, 0.184, 0.008, 0.011, 0.004, 0, -0.066, -0.275);
  panel(0xbca989, 0.018, 0.02, 0.012, 0.004, 0.069, -0.073, -0.279);
  panel(0x654f39, 0.055, 0.035, 0.009, 0.004, 0, 0.055, -0.26);

  for (const side of [-1, 1]) {
    const x = side * 0.122;
    const path = new CatmullRomCurve3([
      new Vector3(x, 0.087, -0.18),
      new Vector3(x, 0.168, -0.071),
      new Vector3(x, 0.165, 0.051),
      new Vector3(x, 0.085, 0.162),
      new Vector3(x, -0.081, 0.185),
      new Vector3(side * 0.165, -0.164, 0.087),
      new Vector3(side * 0.134, -0.205, -0.156),
    ]);
    // Flat webbing follows the jacket over the shoulder.
    const strap = new TubeGeometry(path, 16, 0.019, 6, false);
    const positions = strap.attributes.position;
    for (let segment = 0; segment <= 16; segment++) {
      const start = segment * 7;
      const center = path.getPointAt(segment / 16);
      for (let j = start; j < start + 7; j++) {
        positions.setXYZ(j, positions.getX(j), center.y + (positions.getY(j) - center.y) * 0.42,
          center.z + (positions.getZ(j) - center.z) * 0.42);
      }
    }
    strap.computeVertexNormals();
    add(strap, 0x584c36);
  }

  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, roughness: 0.94 }));
}
