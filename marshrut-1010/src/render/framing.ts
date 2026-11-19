export function harborFrame(width: number, height: number) {
  const aspect = width / height;
  const halfHeight = Math.max(9.5, 6.5 / aspect);

  return { halfWidth: halfHeight * aspect, halfHeight };
}
