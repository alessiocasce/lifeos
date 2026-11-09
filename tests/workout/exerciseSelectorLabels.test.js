import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

test('Training picker renders confirmed legacy and EZ IDs consistently in both languages', async () => {
  const server = await createServer({ configFile: false, plugins: [react()],
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, ws: false } });
  try {
    const { ExerciseSelector } = await server.ssrLoadModule('/src/components/ExerciseSelector.jsx');
    const cases = [
      ['a2bc1c95-14c7-558d-a56b-0973cc4793dd', 'en', 'Barbell Curl'],
      ['a2bc1c95-14c7-558d-a56b-0973cc4793dd', 'it', 'Curl con bilanciere EZ'],
      ['860c2371-8592-5ad9-aa43-805984020e52', 'en', 'Barbell Curl'],
      ['860c2371-8592-5ad9-aa43-805984020e52', 'it', 'Curl con bilanciere EZ'],
      [null, 'en', 'My straight bar curl'],
    ];
    for (const [exerciseId, language, expected] of cases) {
      const markup = renderToStaticMarkup(React.createElement(ExerciseSelector, {
        exerciseId, language, value: exerciseId ? 'Barbell Curl' : 'My straight bar curl', onCommit() {},
      }));
      assert.ok(markup.includes(expected), `saved ${exerciseId || 'custom'} in ${language} must display ${expected}`);
    }
  } finally { await server.close(); }
});
