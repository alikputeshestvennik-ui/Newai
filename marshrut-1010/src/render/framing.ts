export const harborFieldOfView = 50;

export function followCameraDistance(aspect: number) {
  return 5.6 + Math.min(1.5, Math.max(0, (0.75 - aspect) * 4));
}
