import { describe, expect, it } from 'vitest';
import { harborFrame } from '../src/render/framing';

describe('pier camera framing', () => {
  it.each([[360, 800], [800, 360], [768, 768], [320, 960]])(
    'keeps the pier in frame without stretching it at %d × %d',
    (width, height) => {
      const { halfHeight, halfWidth } = harborFrame(width, height);
      expect(halfHeight).toBeGreaterThanOrEqual(9.5);
      expect(halfWidth).toBeGreaterThanOrEqual(6.5);
      expect(halfWidth / halfHeight).toBeCloseTo(width / height);
    },
  );
});
