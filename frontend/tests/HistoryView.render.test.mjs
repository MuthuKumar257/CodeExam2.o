import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let vite;
let HistoryView;
const admin = { id: 'admin-1', name: 'Admin', email: 'admin@example.test', role: 'ADMIN' };

before(async () => {
  vite = await createServer({
    configFile: './vite.config.ts',
    configLoader: 'runner',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  ({ HistoryView } = await vite.ssrLoadModule('/src/components/common/HistoryView.tsx'));
});

after(async () => {
  await vite?.close();
});

test('HistoryView renders an assessment with and without a matching class', () => {
  const markup = renderToStaticMarkup(
    React.createElement(HistoryView, {
      assessments: [
        { id: 'assessment-classed', title: 'Classed exam', classId: 'class-1', category: '', status: 'ACTIVE' },
        { id: 'assessment-unassigned', title: 'Unassigned exam', status: 'ACTIVE' },
      ],
      sessions: [],
      classes: [{ id: 'class-1', name: 'CSE 2026', department: 'Computer Science' }],
      users: [],
      currentUser: admin,
      onInspectCandidate: () => {},
    })
  );

  assert.match(markup, /Classed exam/);
  assert.match(markup, /CSE 2026/);
  assert.match(markup, /Computer Science/);
  assert.match(markup, /Unassigned exam/);
  assert.match(markup, /All Assigned Classes/);
});

test('HistoryView renders the empty assessment state', () => {
  const markup = renderToStaticMarkup(
    React.createElement(HistoryView, {
      assessments: [],
      sessions: [],
      classes: [],
      users: [],
      currentUser: admin,
      onInspectCandidate: () => {},
    })
  );

  assert.match(markup, /No assessments match your current search and filter parameters/);
});
