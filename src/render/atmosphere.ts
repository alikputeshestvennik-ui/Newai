import * as THREE from 'three';
import type { TimeOfDay } from '../core/settings';

/** Visual time follows the saved simulation clock; it never changes the simulation. */
export function daylight(minute: number, mode: TimeOfDay): number {
  if (mode === 'day') return 1;
  if (mode === 'night') return 0;
  return THREE.MathUtils.smoothstep(Math.sin(((minute / 60 + 8) % 24 - 6) / 24 * Math.PI * 2), -0.18, 0.3);
}
export class Atmosphere {
  readonly ambient = new THREE.HemisphereLight('#e5f4ff', '#7e9163', 2);
  readonly sun = new THREE.DirectionalLight('#fff0cf', 2.4);
  private sky = new THREE.Color();
  private day = new THREE.Color('#b9d9de');
  private night = new THREE.Color('#152639');
  private warm = new THREE.Color('#ffc09a');
  private horizon = new THREE.Color('#f0b79a');
  private noon = new THREE.Color('#fff0cf');
  private moon = new THREE.Color('#9bb8f3');
  private litWindow = new THREE.Color('#ffdb89');
  private unlitWindow = new THREE.Color('#658b95');
  private value: number | undefined;
  private weatherTint = 0;
  private fog = new THREE.Fog('#b9d9de', 35, 65);
  constructor(private scene: THREE.Scene, private windows: THREE.MeshBasicMaterial) {
    this.sun.position.set(-8, 17, 9); scene.add(this.ambient, this.sun); scene.background = this.sky; scene.fog = this.fog;
  }
  update(minute: number, mode: TimeOfDay, weather = '', dt = 1 / 60) {
    const target = daylight(minute, mode), blend = 1 - Math.exp(-2 * dt);
    this.value = this.value === undefined ? target : this.value + (target - this.value) * blend;
    const value = this.value;
    this.weatherTint += ((weather === 'rain' ? .35 : weather === 'snow' ? .15 : 0) - this.weatherTint) * blend;
    this.sky.copy(this.night).lerp(this.day, value).lerp(this.horizon, 2 * value * (1 - value) * (1 - this.weatherTint));
    this.sky.lerp(this.night,this.weatherTint);this.fog.color.copy(this.sky);
    this.ambient.intensity = 0.7 + value * 1.5; this.sun.intensity = 0.2 + value * 2.2;
    this.sun.color.copy(this.moon).lerp(this.warm, THREE.MathUtils.smoothstep(value, 0, .45)).lerp(this.noon, THREE.MathUtils.smoothstep(value, .45, 1));
    this.windows.color.copy(this.litWindow).lerp(this.unlitWindow, THREE.MathUtils.smoothstep(value, .15, .85));
    return value;
  }
}
