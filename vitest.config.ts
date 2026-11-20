import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Design §13.1 / task 1.2: two Vitest projects.
// - `sim`: Node environment, no DOM (Req 15 c5). Pure simulation, loop, input sampler,
//   camera math, and the architecture checks.
// - `ui`:  jsdom environment for React components and R3F scene-graph tests.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'sim',
          environment: 'node',
          include: [
            'src/sim/**/*.test.ts',
            'src/loop/**/*.test.ts',
            'src/input/inputSampler*.test.ts',
            'src/render/cameraMath*.test.ts',
            'src/test/**/*.test.ts',
          ],
          setupFiles: ['./src/test/fc.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/ui/**/*.test.{ts,tsx}', 'src/app/**/*.test.{ts,tsx}', 'src/render/**/*.test.tsx'],
          setupFiles: ['./src/test/fc.ts'],
        },
      },
    ],
  },
});
