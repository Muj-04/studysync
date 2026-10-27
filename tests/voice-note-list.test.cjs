const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');

test('voice-note playback supports seeking, pause/resume, and page cleanup', t => {
  let harness = createHookHarness();
  const audios = [];
  const previousAudio = global.Audio;
  global.Audio = class {
    constructor() { this.paused = true; this.currentTime = 0; this.src = ''; audios.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  };
  t.after(() => { harness.unmount(); if (previousAudio === undefined) delete global.Audio; else global.Audio = previousAudio; });
  const jsx = (type, props, key) => ({ type, props, key });
  const { default: List } = loadSource('src/components/VoiceNoteList.tsx', {
    react: {
      useState: (...args) => harness.react.useState(...args),
      useRef: (...args) => harness.react.useRef(...args),
      useCallback: (...args) => harness.react.useCallback(...args),
      useEffect: (...args) => harness.react.useEffect(...args),
      forwardRef: fn => fn,
      useImperativeHandle: (ref, create) => { ref.current = create(); },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
  });
  const note = { id: 'note', audioUrl: 'blob:note', duration: 12, timestamp: new Date() };
  const ref = { current: null };
  let session;
  const render = pageKey => {
    const next = List({ notes: [note], pageKey, onDelete() {}, onUpdateTitle() {} }, ref);
    if (session && session.key !== next.key) {
      harness.unmount();
      harness = createHookHarness();
    }
    session = next;
    return harness.render(() => session.type(session.props, session.props.ref));
  };
  let tree = render('page-a');
  ref.current.playPause();
  tree = render('page-a');
  assert.equal(tree.props.children[0].props.isPlaying, true);
  tree.props.children[0].props.onSeek(7);
  assert.equal(audios[0].currentTime, 7);
  ref.current.playPause();
  tree = render('page-a');
  assert.equal(audios[0].paused, true);
  assert.equal(tree.props.children[0].props.isPlaying, false);
  ref.current.playPause();
  assert.equal(audios[0].paused, false);
  tree = render('page-b');
  assert.equal(audios[0].paused, true);
  assert.equal(audios[0].src, '');
  assert.equal(audios[0].onended, null);
  assert.equal(audios[0].onerror, null);
  assert.equal(tree.props.children[0].props.isActive, false);
  ref.current.playPause();
  assert.equal(audios.length, 2);
  harness.unmount();
  assert.equal(audios[1].paused, true);
  assert.equal(audios[1].src, '');
});
