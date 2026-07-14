import test from 'node:test';
import assert from 'node:assert/strict';

import {
  includeLessonPly,
  isUserMovePly,
  notationAnnotation,
} from '../src/learn-annotations.js';

test('lesson queue defaults to user moves and can include computer moves', () => {
  assert.equal(isUserMovePly(1, 'white'), true);
  assert.equal(isUserMovePly(2, 'white'), false);
  assert.equal(isUserMovePly(1, 'black'), false);
  assert.equal(isUserMovePly(2, 'black'), true);
  assert.equal(includeLessonPly(2, 'white', false), false);
  assert.equal(includeLessonPly(2, 'white', true), true);
  assert.equal(includeLessonPly(2, null, false), true);
});

test('notation uses standard marks and distinguishes selected small misses', () => {
  assert.deepEqual(notationAnnotation(0.21, 6), {
    severity: 'blunder', mark: '??', label: 'Blunder',
  });
  assert.deepEqual(notationAnnotation(0.13, 6), {
    severity: 'mistake', mark: '?', label: 'Mistake',
  });
  assert.deepEqual(notationAnnotation(0.07, 6), {
    severity: 'inaccuracy', mark: '?!', label: 'Inaccuracy',
  });
  assert.equal(notationAnnotation(0.045, 6), null);
  assert.deepEqual(notationAnnotation(0.045, 4), {
    severity: 'small-miss', mark: '△', label: 'Small miss',
  });
});

