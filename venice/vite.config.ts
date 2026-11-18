import { defineConfig } from 'vitest/config';
export default defineConfig({ base: './', test: { maxWorkers: 1, include: ['tests/**/*.test.ts'] } });
