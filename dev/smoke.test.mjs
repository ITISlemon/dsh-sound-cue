import fs from 'node:fs';
import vm from 'node:vm';

const CLIENT = new URL('../client.js', import.meta.url);
const src = fs.readFileSync(CLIENT, 'utf8');

// ---------------------------------------------------------------------------
// Minimal hook runtime so the real client bundle can be mounted and driven.
// ---------------------------------------------------------------------------
function createRuntime() {
  const mounted = [];
  const runtime = { current: null, effects: [] };

  function useEffect(fn, deps) {
    const inst = runtime.current;
    const i = inst.cursor++;
    let cell = inst.cells[i];
    if (!cell) {
      cell = inst.cells[i] = { kind: 'effect', deps: undefined, cleanup: null };
    }
    const changed = deps === undefined || !cell.deps || deps.length !== cell.deps.length ||
      deps.some((value, index) => value !== cell.deps[index]);
    if (changed) {
      cell.deps = deps ? deps.slice() : undefined;
      runtime.effects.push({ cell, fn });
    }
  }

  const React = {
    useEffect,
    createElement(type, props, ...children) {
      return { type, props: props || {}, children };
    },
    useState(initial) {
      const inst = runtime.current;
      const i = inst.cursor++;
      let cell = inst.cells[i];
      if (!cell) cell = inst.cells[i] = { kind: 'state', value: typeof initial === 'function' ? initial() : initial };
      const set = (next) => {
        const value = typeof next === 'function' ? next(cell.value) : next;
        if (value === cell.value) return;
        cell.value = value;
        inst.dirty = true;
        flush();
      };
      return [cell.value, set];
    },
    useRef(initial) {
      const inst = runtime.current;
      const i = inst.cursor++;
      let cell = inst.cells[i];
      if (!cell) cell = inst.cells[i] = { kind: 'ref', value: { current: initial } };
      return cell.value;
    },
    useCallback(fn, deps) {
      const inst = runtime.current;
      const i = inst.cursor++;
      let cell = inst.cells[i];
      if (!cell) cell = inst.cells[i] = { kind: 'callback', deps: undefined, fn };
      const changed = deps === undefined || !cell.deps || deps.length !== cell.deps.length ||
        deps.some((value, index) => value !== cell.deps[index]);
      if (changed) {
        cell.deps = deps ? deps.slice() : undefined;
        cell.fn = fn;
      }
      return cell.fn;
    },
  };

  function renderInstance(inst) {
    runtime.current = inst;
    runtime.effects = [];
    inst.cursor = 0;
    inst.dirty = false;
    inst.output = inst.fn(inst.props);
    const effects = runtime.effects;
    runtime.current = null;
    for (const { cell, fn } of effects) {
      if (cell.cleanup) {
        try {
          cell.cleanup();
        } catch (err) {
          /* ignore */
        }
        cell.cleanup = null;
      }
      const cleanup = fn();
      cell.cleanup = typeof cleanup === 'function' ? cleanup : null;
    }
  }

  function flush() {
    let guard = 0;
    let again = true;
    while (again && guard++ < 100) {
      again = false;
      for (const inst of mounted) {
        if (inst.dirty) {
          renderInstance(inst);
          again = true;
        }
      }
    }
  }

  return {
    React,
    mount(fn, props) {
      const inst = { fn, props, cells: [], cursor: 0, dirty: false };
      mounted.push(inst);
      renderInstance(inst);
      flush();
      return {
        getOutput() {
          return inst.output;
        },
        update(nextProps) {
          inst.props = Object.assign({}, inst.props, nextProps);
          inst.dirty = true;
          flush();
        },
        unmount() {
          for (const cell of inst.cells) {
            if (cell && cell.cleanup) cell.cleanup();
          }
          const index = mounted.indexOf(inst);
          if (index >= 0) mounted.splice(index, 1);
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Browser-ish environment with an audio spy.
// ---------------------------------------------------------------------------
function createEnvironment({ stored = null, language = 'zh-CN' } = {}) {
  const storage = new Map();
  if (stored != null) storage.set('dsh-sound-cue:settings', stored);
  const audio = { oscillators: 0, resumes: 0, plays: 0 };
  const listeners = new Map();

  class FakeGain {
    constructor() {
      this.gain = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    }
    connect() {}
  }
  class FakeOscillator {
    constructor() {
      audio.oscillators += 1;
      this.frequency = { setValueAtTime() {} };
    }
    connect() {}
    start() {}
    stop() {}
  }
  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
    }
    createOscillator() {
      return new FakeOscillator();
    }
    createGain() {
      return new FakeGain();
    }
    resume() {
      audio.resumes += 1;
      return Promise.resolve();
    }
  }
  class FakeAudio {
    constructor(source) {
      this.src = source;
      this.volume = 1;
      this.listeners = {};
    }
    addEventListener(name, fn) {
      this.listeners[name] = fn;
    }
    play() {
      audio.plays += 1;
      return Promise.resolve();
    }
  }

  const window = {
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    AudioContext: FakeAudioContext,
    Audio: FakeAudio,
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },
    removeEventListener(name, fn) {
      const list = listeners.get(name) || [];
      const index = list.indexOf(fn);
      if (index >= 0) list.splice(index, 1);
    },
  };

  return {
    window,
    audio,
    storage,
    dispatch(name, event) {
      const list = (listeners.get(name) || []).slice();
      for (const fn of list) fn(event);
    },
    sandbox: {
      window,
      navigator: { language },
      Audio: FakeAudio,
      console,
      Map,
      Set,
      Date,
      JSON,
      Number,
      String,
      Object,
      Array,
      Math,
      Promise,
      setTimeout,
      clearTimeout,
      FileReader: class {},
    },
  };
}

function loadPlugin(env, runtime) {
  let definition = null;
  env.window.__ModuleLoader__ = {
    load(def) {
      definition = def;
    },
  };
  const context = vm.createContext(env.sandbox);
  vm.runInContext(src, context, { filename: 'dsh-sound-cue/client.js' });
  if (!definition) throw new Error('client bundle did not call __ModuleLoader__.load');
  const plugin = definition.factory(() => runtime.React);
  const registrations = [];
  const ctx = {
    get(name) {
      return ctx.services[name];
    },
    on() {
      return () => {};
    },
    services: {},
    slots: {
      inject(_name, callback) {
        callback();
      },
      register(spec, component) {
        registrations.push({ spec, component });
        return () => {};
      },
    },
  };
  plugin.apply(ctx);
  return { plugin, ctx, registrations };
}

function textOf(node) {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return (node.children || []).map(textOf).join('');
}

function findByType(node, type) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((child) => findByType(child, type));
  const found = node.type === type ? [node] : [];
  for (const child of node.children || []) found.push(...findByType(child, type));
  return found;
}

function findByPredicate(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((child) => findByPredicate(child, predicate));
  const found = predicate(node) ? [node] : [];
  for (const child of node.children || []) found.push(...findByPredicate(child, predicate));
  return found;
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  if (!ok) console.error('FAIL', name, detail === undefined ? '' : detail);
}

// --- 1. registration surface ------------------------------------------------
{
  const runtime = createRuntime();
  const env = createEnvironment();
  const { registrations } = loadPlugin(env, runtime);
  const ids = registrations.map((entry) => entry.spec.name + ':' + entry.spec.id).sort();
  check('registers composer dock', ids.includes('conversation.composer.dock:sound-cue'), ids);
  check('registers resident overlay', ids.includes('shell.overlay:sound-cue:resident'), ids);
  check('registers popover overlay', ids.includes('shell.overlay:sound-cue:popover'), ids);
  check('no settings tab registration', !ids.some((id) => id.indexOf('settings.plugins.tab:') === 0), ids);
}

// --- 2. resident listener cues on falling edge only -------------------------
{
  const runtime = createRuntime();
  const env = createEnvironment();
  const { registrations } = loadPlugin(env, runtime);
  const resident = registrations.find((entry) => entry.spec.id === 'sound-cue:resident');
  const byId = { main1: { origin: 'main' }, sub1: { origin: 'subagent' } };
  let statuses = new Map([['main1', { running: true }], ['sub1', { running: true }]]);
  const props = () => ({
    useSessions: (selector) => selector({ byId }),
    useSessionStatus: (selector) => selector(statuses),
  });

  const handle = runtime.mount(resident.component, props());
  check('resident renders nothing', handle.getOutput() === null, handle.getOutput());
  check('resident baseline is silent', env.audio.oscillators === 0, env.audio.oscillators);

  statuses = new Map([['main1', { running: false }], ['sub1', { running: true }]]);
  handle.update(props());
  check('resident cues when a main session finishes', env.audio.oscillators > 0, env.audio.oscillators);

  const afterFirst = env.audio.oscillators;
  statuses = new Map([['main1', { running: false }], ['sub1', { running: true }]]);
  handle.update(props());
  check('resident stays quiet on unchanged state', env.audio.oscillators === afterFirst, env.audio.oscillators);

  statuses = new Map([['main1', { running: false }], ['sub1', { running: false }]]);
  handle.update(props());
  check('resident ignores subagent sessions', env.audio.oscillators === afterFirst, env.audio.oscillators);

  statuses = new Map([['main1', { running: true }], ['sub1', { running: false }]]);
  handle.update(props());
  statuses = new Map([['main1', { running: false }], ['sub1', { running: false }]]);
  handle.update(props());
  check('resident cues on the next turn', env.audio.oscillators > afterFirst, env.audio.oscillators);
}

// --- 2b. resident alerts when an interaction waits on the user --------------
{
  const runtime = createRuntime();
  const env = createEnvironment();
  const { registrations } = loadPlugin(env, runtime);
  const resident = registrations.find((entry) => entry.spec.id === 'sound-cue:resident');
  const byId = { main1: { origin: 'main' } };
  const approval = { kind: 'approval', key: 'a1' };
  const question = { kind: 'question', key: 'q1' };
  let statuses = new Map([['main1', { running: true, pendingInteraction: undefined }]]);
  const props = () => ({
    useSessions: (selector) => selector({ byId }),
    useSessionStatus: (selector) => selector(statuses),
  });

  const handle = runtime.mount(resident.component, props());
  check('pending baseline is silent', env.audio.oscillators === 0, env.audio.oscillators);

  statuses = new Map([['main1', { running: true, pendingInteraction: approval }]]);
  handle.update(props());
  check('resident alerts on an approval', env.audio.oscillators === 3, env.audio.oscillators);
  const afterApproval = env.audio.oscillators;

  statuses = new Map([['main1', { running: true, pendingInteraction: approval }]]);
  handle.update(props());
  check('resident stays quiet on the same approval', env.audio.oscillators === afterApproval, env.audio.oscillators);

  statuses = new Map([['main1', { running: true, pendingInteraction: question }]]);
  handle.update(props());
  check('resident alerts on a following question', env.audio.oscillators > afterApproval, env.audio.oscillators);

  const beforeAnswer = env.audio.oscillators;
  statuses = new Map([['main1', { running: true, pendingInteraction: undefined }]]);
  handle.update(props());
  check('no cue when the interaction is answered', env.audio.oscillators === beforeAnswer, env.audio.oscillators);
}

// --- 2c. the action switch can suppress that alert -------------------------
{
  const runtime = createRuntime();
  const env = createEnvironment({ stored: JSON.stringify({ notifyActions: false }) });
  const { registrations } = loadPlugin(env, runtime);
  const resident = registrations.find((entry) => entry.spec.id === 'sound-cue:resident');
  const byId = { main1: { origin: 'main' } };
  let statuses = new Map([['main1', { running: true, pendingInteraction: undefined }]]);
  const props = () => ({
    useSessions: (selector) => selector({ byId }),
    useSessionStatus: (selector) => selector(statuses),
  });
  const handle = runtime.mount(resident.component, props());

  statuses = new Map([['main1', { running: true, pendingInteraction: { kind: 'approval' } }]]);
  handle.update(props());
  check('action switch off suppresses the alert', env.audio.oscillators === 0, env.audio.oscillators);

  statuses = new Map([['main1', { running: false, pendingInteraction: undefined }]]);
  handle.update(props());
  check('completion cue still plays with the action switch off', env.audio.oscillators > 0, env.audio.oscillators);
}


// --- 2d. the attention cue itself can be replaced --------------------------
{
  const runtime = createRuntime();
  // A single tone for every interaction replaces the two built-in alerts, so an
  // approval plays that tone (pop = 2 tones) instead of the 3-tone default.
  const env = createEnvironment({ stored: JSON.stringify({ attentionPreset: 'pop' }) });
  const { registrations } = loadPlugin(env, runtime);
  const resident = registrations.find((entry) => entry.spec.id === 'sound-cue:resident');
  const byId = { main1: { origin: 'main' } };
  let statuses = new Map([['main1', { running: true, pendingInteraction: undefined }]]);
  const props = () => ({
    useSessions: (selector) => selector({ byId }),
    useSessionStatus: (selector) => selector(statuses),
  });
  const handle = runtime.mount(resident.component, props());
  statuses = new Map([['main1', { running: true, pendingInteraction: { kind: 'approval' } }]]);
  handle.update(props());
  check('custom attention tone replaces the default alert', env.audio.oscillators === 2, env.audio.oscillators);
}

// --- 2e. a custom audio file can back the attention cue --------------------
{
  const runtime = createRuntime();
  const env = createEnvironment({
    stored: JSON.stringify({
      attentionCustom: { name: 'alert.mp3', dataUrl: 'data:audio/mpeg;base64,AAAA' },
    }),
  });
  const { registrations } = loadPlugin(env, runtime);
  const resident = registrations.find((entry) => entry.spec.id === 'sound-cue:resident');
  const byId = { main1: { origin: 'main' } };
  let statuses = new Map([['main1', { running: true, pendingInteraction: undefined }]]);
  const props = () => ({
    useSessions: (selector) => selector({ byId }),
    useSessionStatus: (selector) => selector(statuses),
  });
  const handle = runtime.mount(resident.component, props());
  statuses = new Map([['main1', { running: true, pendingInteraction: { kind: 'question' } }]]);
  handle.update(props());
  check('custom attention file plays instead of a tone', env.audio.plays === 1, env.audio.plays);
  check('custom attention file uses no oscillator', env.audio.oscillators === 0, env.audio.oscillators);
}

// --- 3. while resident listens, the dock stays silent -----------------------
{
  const runtime = createRuntime();
  const env = createEnvironment();
  const { ctx, registrations } = loadPlugin(env, runtime);
  let listener = null;
  const session = {
    running: false,
    getSnapshot() {
      return { running: this.running };
    },
    subscribe(fn) {
      listener = fn;
      return () => {
        listener = null;
      };
    },
  };
  ctx.services.sessions = { binding: () => ({ session }) };
  const dock = registrations.find((entry) => entry.spec.name === 'conversation.composer.dock');
  runtime.mount(dock.component, { sessionId: 'main1' });
  check('dock does not subscribe while resident listens', listener === null, typeof listener);
  session.running = true;
  session.running = false;
  check('dock is silent while resident listens', env.audio.oscillators === 0, env.audio.oscillators);
}

// --- 4. with resident off, the dock takes over ------------------------------
{
  const runtime = createRuntime();
  const env = createEnvironment({ stored: JSON.stringify({ resident: false }) });
  const { ctx, registrations } = loadPlugin(env, runtime);
  let listener = null;
  const session = {
    running: false,
    getSnapshot() {
      return { running: this.running };
    },
    subscribe(fn) {
      listener = fn;
      return () => {};
    },
  };
  ctx.services.sessions = { binding: () => ({ session }) };
  const dock = registrations.find((entry) => entry.spec.name === 'conversation.composer.dock');
  runtime.mount(dock.component, { sessionId: 'main1' });
  session.running = true;
  listener();
  session.running = false;
  listener();
  check('dock cues when resident is off', env.audio.oscillators > 0, env.audio.oscillators);
}

// --- 4b. with resident off, the dock still alerts on pending interactions ---
{
  const runtime = createRuntime();
  const env = createEnvironment({ stored: JSON.stringify({ resident: false }) });
  const { ctx, registrations } = loadPlugin(env, runtime);
  let statusListener = null;
  let statusSnapshot = new Map([['main1', { running: true, pendingInteraction: undefined }]]);
  ctx.services.sessions = {
    binding: () => ({
      session: { getSnapshot: () => ({ running: true }), subscribe: () => () => {} },
    }),
  };
  ctx.services.uiSession = {
    sessionStatus: {
      getSnapshot: () => statusSnapshot,
      subscribe(fn) {
        statusListener = fn;
        return () => {
          statusListener = null;
        };
      },
    },
  };
  const dock = registrations.find((entry) => entry.spec.name === 'conversation.composer.dock');
  runtime.mount(dock.component, { sessionId: 'main1' });
  check('dock subscribes to pending interactions', typeof statusListener === 'function', typeof statusListener);

  statusSnapshot = new Map([['main1', { running: true, pendingInteraction: { kind: 'question' } }]]);
  statusListener();
  check('dock alerts on a pending question', env.audio.oscillators === 3, env.audio.oscillators);
}

// --- 5. the chip opens a floating popover above the composer ----------------
{
  const runtime = createRuntime();
  const env = createEnvironment();
  const { registrations } = loadPlugin(env, runtime);
  const dock = registrations.find((entry) => entry.spec.id === 'sound-cue');
  const popoverReg = registrations.find((entry) => entry.spec.id === 'sound-cue:popover');
  check('registers the popover overlay', !!popoverReg, registrations.map((entry) => entry.spec.id));

  const popover = runtime.mount(popoverReg.component, {});
  check('popover is empty while closed', popover.getOutput() === null, popover.getOutput());

  const dockHandle = runtime.mount(dock.component, { sessionId: 'main1' });
  const chip = findByType(dockHandle.getOutput(), 'button')[0];
  check('dock renders a chip', !!chip, textOf(dockHandle.getOutput()));
  const chipText = textOf(chip);
  check('chip shows no sound name', chipText.indexOf('风铃') < 0 && chipText.indexOf('chime') < 0, chipText);

  const chipNode = {
    getBoundingClientRect: () => ({ left: 120, top: 600, bottom: 620, width: 40, height: 20 }),
    contains: () => false,
  };
  chip.props.onClick({ currentTarget: chipNode });

  const output = popover.getOutput();
  check('popover opens when the chip is clicked', !!output, output);
  const style = (output && output.props && output.props.style) || {};
  check('popover floats above the chip', style.position === 'fixed' && style.bottom === 176, style);
  check('popover sits beside the chip', style.left === 120 && style.width === 320, style);
  check('popover uses the room above the chip', style.maxHeight === 584, style.maxHeight);
  check('popover scrollbar stays visible', style.scrollbarWidth === 'thin' && style.scrollbarGutter === 'stable', style);

  const panelNode = findByPredicate(output, (node) => typeof node.type === 'function')[0];
  check('popover embeds the panel', !!panelNode, typeof panelNode);

  const panel = runtime.mount(panelNode.type, panelNode.props || {});
  const bareStyle = panel.getOutput().props.style;
  check('panel is bare inside the popover', !bareStyle.border, bareStyle);

  const panelText = textOf(panel.getOutput());
  check('panel shows the switches', panelText.includes('常驻监听') && panelText.includes('需要我操作时'), panelText);

  const checkboxes = findByType(panel.getOutput(), 'input').filter(
    (node) => node.props && node.props.type === 'checkbox',
  );
  check('panel has three checkboxes', checkboxes.length === 3, checkboxes.length);

  const residentSwitch = checkboxes[1];
  check('resident switch starts on', residentSwitch.props.checked === true, residentSwitch.props.checked);
  residentSwitch.props.onChange({ target: { checked: false } });

  const persisted = JSON.parse(env.storage.get('dsh-sound-cue:settings'));
  check('resident switch persists', persisted.resident === false, persisted);

  const actionSwitch = checkboxes[2];
  check('action switch starts on', actionSwitch.props.checked === true, actionSwitch.props.checked);
  actionSwitch.props.onChange({ target: { checked: false } });
  const persistedAgain = JSON.parse(env.storage.get('dsh-sound-cue:settings'));
  check('action switch persists', persistedAgain.notifyActions === false, persistedAgain);

  env.dispatch('pointerdown', { target: {} });
  check('outside click closes the popover', popover.getOutput() === null, popover.getOutput());

  chip.props.onClick({ currentTarget: chipNode });
  check('chip reopens the popover', popover.getOutput() !== null, popover.getOutput());

  dockHandle.unmount();
  check('leaving the conversation closes the popover', popover.getOutput() === null, popover.getOutput());
}

console.log(JSON.stringify(checks, null, 2));
const failed = checks.filter((entry) => !entry.ok);
if (failed.length) {
  console.error(failed.length + ' check(s) failed');
  process.exit(1);
}
console.log('smoke ok');
