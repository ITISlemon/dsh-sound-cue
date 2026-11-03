window.__ModuleLoader__.load({
  id: 'dsh-sound-cue',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const useState = React.useState;
    const useEffect = React.useEffect;
    const useRef = React.useRef;
    const useCallback = React.useCallback;

    const STORAGE_KEY = 'dsh-sound-cue:settings';
    const MAX_FILE_BYTES = 3 * 1024 * 1024;
    const PRESETS = ['chime', 'bell', 'marimba', 'pop', 'ding'];
    // 'kind' keeps the two built-in alerts apart (a lower one for approvals, a
    // brighter one for questions); any other value plays that tone for both.
    const ATTENTION_PRESETS = ['kind'].concat(PRESETS);
    const DEFAULTS = {
      enabled: true,
      resident: true,
      preset: 'chime',
      volume: 0.6,
      custom: null,
      notifyActions: true,
      attentionPreset: 'kind',
      attentionCustom: null,
    };

    const TEXT = {
      en: {
        button: 'Sound',
        title: 'Turn sound',
        enabled: 'Play a sound when a reply finishes',
        resident: 'Keep listening on other pages',
        residentHint: 'When this is on, the cue also plays while Settings, the plugin market, or another panel is open.',
        actions: 'Also sound when my input is needed',
        actionsHint: 'A different cue plays when an approval, a question, or a plan review is waiting for you.',
        preset: 'Sound',
        attentionLabel: 'Sound for input needed',
        'attention.kind': 'Different per type',
        attentionHint: 'Approvals play a lower alert and questions a brighter one. Pick a tone or your own file to use one sound for both.',
        volume: 'Volume',
        preview: 'Preview',
        previewAction: 'Preview alert',
        customLabel: 'Custom audio file',
        choose: 'Choose file',
        clear: 'Use built-in sound',
        playing: 'Playing…',
        loaded: 'Custom sound loaded',
        tooBig: 'That file is larger than 3 MB',
        readFailed: 'Could not read that file',
        hint: 'One cue per finished turn. Custom files stay in this browser.',
        'preset.chime': 'Chime',
        'preset.bell': 'Bell',
        'preset.marimba': 'Marimba',
        'preset.pop': 'Pop',
        'preset.ding': 'Ding',
      },
      zh: {
        button: '音效',
        title: '完成音效',
        enabled: '每轮回复结束时播放音效',
        resident: '常驻监听（切换页面也响）',
        residentHint: '打开后，停留在设置、插件市场或其他面板时，本轮结束同样会响。',
        actions: '需要我操作时也提示',
        actionsHint: '出现审批请求、提问、计划确认等需要你处理的内容时，播放另一种提示音。',
        preset: '音色',
        attentionLabel: '需要操作时的音效',
        'attention.kind': '按类型区分',
        attentionHint: '审批用较低的三连音、提问用较亮的三连音；选一个音色或自定义文件则两者统一。',
        volume: '音量',
        preview: '试听',
        previewAction: '试听提示音',
        customLabel: '自定义音频文件',
        choose: '选择文件',
        clear: '改用内置音色',
        playing: '播放中…',
        loaded: '已载入自定义音效',
        tooBig: '文件超过 3 MB',
        readFailed: '无法读取该文件',
        hint: '每轮任务结束时响一次；自定义音频只保存在本浏览器。',
        'preset.chime': '风铃',
        'preset.bell': '钟声',
        'preset.marimba': '木琴',
        'preset.pop': '气泡',
        'preset.ding': '叮咚',
      },
    };

    function normalize(settings) {
      if (PRESETS.indexOf(settings.preset) < 0) settings.preset = DEFAULTS.preset;
      settings.volume = clamp01(typeof settings.volume === 'number' ? settings.volume : DEFAULTS.volume);
      settings.enabled = settings.enabled !== false;
      settings.resident = settings.resident !== false;
      settings.notifyActions = settings.notifyActions !== false;
      if (ATTENTION_PRESETS.indexOf(settings.attentionPreset) < 0) {
        settings.attentionPreset = DEFAULTS.attentionPreset;
      }
      if (!settings.custom || typeof settings.custom.dataUrl !== 'string') settings.custom = null;
      if (!settings.attentionCustom || typeof settings.attentionCustom.dataUrl !== 'string') {
        settings.attentionCustom = null;
      }
      return settings;
    }

    function readSettings() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return Object.assign({}, DEFAULTS);
        return normalize(Object.assign({}, DEFAULTS, JSON.parse(raw)));
      } catch (err) {
        return Object.assign({}, DEFAULTS);
      }
    }

    function writeSettings(settings) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch (err) {
        /* storage may be full or blocked; the in-memory value still applies */
      }
    }

    function clamp01(value) {
      if (!(value > 0)) return 0;
      return value > 1 ? 1 : value;
    }

    // One settings instance shared by every registration in this page, so a
    // toggle in the composer dock is immediately visible to the resident
    // listener and to the settings page.
    let currentSettings = readSettings();
    const settingsListeners = new Set();

    function getSettings() {
      return currentSettings;
    }

    function updateSettings(patch) {
      currentSettings = normalize(Object.assign({}, currentSettings, patch));
      writeSettings(currentSettings);
      settingsListeners.forEach(function (listener) {
        try {
          listener();
        } catch (err) {
          /* a broken subscriber must not break the others */
        }
      });
    }

    function subscribeSettings(listener) {
      settingsListeners.add(listener);
      return function () {
        settingsListeners.delete(listener);
      };
    }

    function useSettingsState() {
      const [snapshot, setSnapshot] = useState(getSettings);
      useEffect(function () {
        return subscribeSettings(function () {
          setSnapshot(getSettings());
        });
      }, []);
      return snapshot;
    }

    function activeLocale(ctx) {
      try {
        const locale = typeof ctx.get === 'function' ? ctx.get('locale') : ctx.locale;
        if (locale && typeof locale.getLocale === 'function') {
          const snapshot = locale.getLocale();
          if (snapshot && typeof snapshot.active === 'string' && snapshot.active) return snapshot.active;
        }
      } catch (err) {
        /* fall through to the browser language */
      }
      const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
      return nav || 'en';
    }

    function translate(ctx, key) {
      const locale = String(activeLocale(ctx) || '').toLowerCase();
      const dict = locale.indexOf('zh') === 0 ? TEXT.zh : TEXT.en;
      if (dict[key]) return dict[key];
      if (TEXT.en[key]) return TEXT.en[key];
      return key;
    }

    function useT(ctx) {
      const [revision, setRevision] = useState(0);
      useEffect(function () {
        if (typeof ctx.on !== 'function') return undefined;
        const off = ctx.on('locale/change', function () {
          setRevision(function (n) {
            return n + 1;
          });
        });
        return function () {
          if (typeof off === 'function') off();
        };
      }, []);
      return useCallback(function (key) {
        return translate(ctx, key);
      }, [revision]);
    }

    let audioContext = null;

    function ensureAudioContext() {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      if (!audioContext) {
        try {
          audioContext = new Ctor();
        } catch (err) {
          return null;
        }
      }
      if (audioContext.state === 'suspended') {
        try {
          audioContext.resume().catch(function () {});
        } catch (err) {
          /* ignore */
        }
      }
      return audioContext;
    }

    function tone(ac, freq, start, dur, type, peak) {
      const t0 = ac.currentTime + start;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0005), t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    function playPreset(name, volume) {
      const ac = ensureAudioContext();
      if (!ac) return;
      const v = clamp01(volume);
      if (v <= 0) return;
      const g = 0.22 * v;
      if (name === 'bell') {
        tone(ac, 659.25, 0, 1.0, 'sine', g);
        tone(ac, 1318.5, 0, 0.6, 'sine', g * 0.35);
        tone(ac, 1975.5, 0, 0.35, 'sine', g * 0.12);
        return;
      }
      if (name === 'marimba') {
        tone(ac, 392.0, 0, 0.45, 'triangle', g * 0.9);
        tone(ac, 523.25, 0.1, 0.45, 'triangle', g * 0.9);
        tone(ac, 659.25, 0.2, 0.55, 'triangle', g * 0.9);
        return;
      }
      if (name === 'pop') {
        tone(ac, 320, 0, 0.16, 'triangle', g * 1.1);
        tone(ac, 640, 0.03, 0.14, 'sine', g * 0.5);
        return;
      }
      if (name === 'ding') {
        tone(ac, 1046.5, 0, 0.75, 'sine', g);
        tone(ac, 1568.0, 0, 0.4, 'sine', g * 0.25);
        return;
      }
      // chime (default)
      tone(ac, 880.0, 0, 0.5, 'sine', g);
      tone(ac, 1318.5, 0.11, 0.6, 'sine', g * 0.8);
    }

    // Attention cue for anything that waits on the user. By default it
    // deliberately has a different shape from the completion cue so the two are
    // easy to tell apart without looking at the screen; both the tone and a
    // custom file can be replaced from the panel.
    function playAttention(kind, settings) {
      const volume = settings && typeof settings.volume === 'number' ? settings.volume : DEFAULTS.volume;
      const preset = (settings && settings.attentionPreset) || DEFAULTS.attentionPreset;
      const custom = settings && settings.attentionCustom;
      if (custom && custom.dataUrl) {
        playCustom(custom.dataUrl, volume, preset === 'kind' ? DEFAULTS.preset : preset);
        return;
      }
      if (preset !== 'kind') {
        playPreset(preset, volume);
        return;
      }
      const ac = ensureAudioContext();
      if (!ac) return;
      const v = clamp01(volume);
      if (v <= 0) return;
      const g = 0.22 * v;
      if (kind === 'approval') {
        tone(ac, 587.33, 0, 0.16, 'triangle', g);
        tone(ac, 783.99, 0.15, 0.2, 'triangle', g);
        tone(ac, 587.33, 0.33, 0.16, 'triangle', g * 0.85);
        return;
      }
      tone(ac, 880.0, 0, 0.16, 'sine', g);
      tone(ac, 1174.66, 0.15, 0.2, 'sine', g);
      tone(ac, 1567.98, 0.33, 0.18, 'sine', g * 0.8);
    }

    function playCustom(dataUrl, volume, fallbackPreset) {
      try {
        const el = new Audio(dataUrl);
        el.volume = clamp01(volume);
        const failed = function () {
          playPreset(fallbackPreset, volume);
        };
        el.addEventListener('error', failed, { once: true });
        const started = el.play();
        if (started && typeof started.catch === 'function') {
          started.catch(function () {
            /* the error listener above already covers decode failures */
          });
        }
      } catch (err) {
        playPreset(fallbackPreset, volume);
      }
    }

    function playCue(settings) {
      if (!settings || !settings.enabled) return;
      if (settings.custom && settings.custom.dataUrl) {
        playCustom(settings.custom.dataUrl, settings.volume, settings.preset);
        return;
      }
      playPreset(settings.preset, settings.volume);
    }

    function useAudioUnlock() {
      useEffect(function () {
        const unlock = function () {
          ensureAudioContext();
        };
        window.addEventListener('pointerdown', unlock, true);
        window.addEventListener('keydown', unlock, true);
        return function () {
          window.removeEventListener('pointerdown', unlock, true);
          window.removeEventListener('keydown', unlock, true);
        };
      }, []);
    }

    // The shared control surface, rendered both in the composer dock and in
    // the Plugins settings page.
    function createPanel(ctx) {
      return function SoundCuePanel(props) {
        const compact = !(props && props.compact === false);
        const t = useT(ctx);
        const settings = useSettingsState();
        const [note, setNote] = useState('');
        useAudioUnlock();

        const update = function (patch) {
          updateSettings(patch);
        };

        const preview = function () {
          playCue(Object.assign({}, settings, { enabled: true }));
          setNote(t('playing'));
        };

        const readAudio = function (event, apply) {
          const file = event.target.files && event.target.files[0];
          event.target.value = '';
          if (!file) return;
          if (file.size > MAX_FILE_BYTES) {
            setNote(t('tooBig'));
            return;
          }
          const reader = new FileReader();
          reader.onload = function () {
            if (typeof reader.result !== 'string') {
              setNote(t('readFailed'));
              return;
            }
            apply({ name: file.name || 'custom', dataUrl: reader.result });
            setNote(t('loaded'));
          };
          reader.onerror = function () {
            setNote(t('readFailed'));
          };
          reader.readAsDataURL(file);
        };

        const onFile = function (event) {
          readAudio(event, function (custom) {
            update({ custom: custom });
          });
        };

        const onAttentionFile = function (event) {
          readAudio(event, function (custom) {
            update({ attentionCustom: custom });
          });
        };

        const bare = !!(props && props.bare);
        const panelStyle = bare
          ? { display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, textAlign: 'left' }
          : compact
          ? {
              display: 'flex', flexDirection: 'column', gap: 9, marginTop: 8, padding: '10px 12px',
              borderRadius: 10, border: '1px solid rgba(128,128,128,0.3)',
              background: 'rgba(127,127,127,0.07)', width: 250, maxWidth: '80vw',
              fontSize: 12, textAlign: 'left',
            }
          : { display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, textAlign: 'left' };
        const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 };
        const chipStyle = {
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px',
          borderRadius: 999, border: '1px solid rgba(128,128,128,0.35)',
          background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer',
          lineHeight: 1.5,
        };
        const controlStyle = {
          font: 'inherit', color: 'inherit', background: 'transparent',
          border: '1px solid rgba(128,128,128,0.35)', borderRadius: 6, padding: '2px 6px',
        };
        const hintStyle = { opacity: 0.6, fontSize: 11 };
        const nameStyle = {
          opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', maxWidth: 150,
        };

        return h('div', { style: panelStyle },
          h('label', { style: Object.assign({}, rowStyle, { cursor: 'pointer' }) },
            h('span', null, t('enabled')),
            h('input', {
              type: 'checkbox',
              checked: settings.enabled,
              onChange: function (e) { update({ enabled: !!e.target.checked }); },
            })),
          h('label', { style: Object.assign({}, rowStyle, { cursor: 'pointer' }) },
            h('span', null, t('resident')),
            h('input', {
              type: 'checkbox',
              checked: settings.resident,
              onChange: function (e) { update({ resident: !!e.target.checked }); },
            })),
          h('div', { style: hintStyle }, t('residentHint')),
          h('label', { style: Object.assign({}, rowStyle, { cursor: 'pointer' }) },
            h('span', null, t('actions')),
            h('input', {
              type: 'checkbox',
              checked: settings.notifyActions,
              onChange: function (e) { update({ notifyActions: !!e.target.checked }); },
            })),
          h('div', { style: hintStyle }, t('actionsHint')),
          h('div', { style: rowStyle },
            h('span', { style: { opacity: 0.8 } }, t('preset')),
            h('select', {
              style: controlStyle,
              value: settings.preset,
              disabled: !!settings.custom,
              onChange: function (e) { update({ preset: e.target.value }); },
            }, PRESETS.map(function (id) {
              return h('option', { key: id, value: id }, t('preset.' + id));
            }))),
          h('div', { style: rowStyle },
            h('span', { style: { opacity: 0.8 } }, t('volume')),
            h('input', {
              type: 'range', min: 0, max: 1, step: 0.05,
              value: settings.volume,
              style: { flex: '1 1 auto', accentColor: 'currentColor' },
              onChange: function (e) {
                update({ volume: clamp01(Number(e.target.value)) });
              },
            })),
          h('div', { style: rowStyle },
            h('button', { type: 'button', style: chipStyle, onClick: preview }, '▶ ' + t('preview')),
            h('label', { style: Object.assign({}, chipStyle, { cursor: 'pointer' }) },
              t('choose'),
              h('input', {
                type: 'file', accept: 'audio/*', style: { display: 'none' }, onChange: onFile,
              }))),
          settings.custom
            ? h('div', { style: rowStyle },
              h('span', { style: nameStyle }, settings.custom.name),
              h('button', {
                type: 'button', style: chipStyle,
                onClick: function () { update({ custom: null }); },
              }, t('clear')))
            : null,
          h('div', { style: { height: 1, background: 'rgba(128,128,128,0.25)', margin: '2px 0' } }),
          h('div', { style: rowStyle },
            h('span', { style: { opacity: 0.8 } }, t('attentionLabel')),
            h('select', {
              style: controlStyle,
              value: settings.attentionPreset,
              disabled: !!settings.attentionCustom,
              onChange: function (e) { update({ attentionPreset: e.target.value }); },
            }, ATTENTION_PRESETS.map(function (id) {
              return h('option', { key: id, value: id },
                id === 'kind' ? t('attention.kind') : t('preset.' + id));
            }))),
          h('div', { style: rowStyle },
            h('button', {
              type: 'button', style: chipStyle,
              onClick: function () {
                playAttention('question', settings);
                setNote(t('playing'));
              },
            }, '▶ ' + t('previewAction')),
            h('label', { style: Object.assign({}, chipStyle, { cursor: 'pointer' }) },
              t('choose'),
              h('input', {
                type: 'file', accept: 'audio/*', style: { display: 'none' }, onChange: onAttentionFile,
              }))),
          settings.attentionCustom
            ? h('div', { style: rowStyle },
              h('span', { style: nameStyle }, settings.attentionCustom.name),
              h('button', {
                type: 'button', style: chipStyle,
                onClick: function () { update({ attentionCustom: null }); },
              }, t('clear')))
            : null,
          h('div', { style: hintStyle }, t('attentionHint')),
          h('div', { style: hintStyle }, note || t('hint')));
      };
    }

    // The chip opens one frame-wide popover instead of an in-flow panel: the
    // conversation layout must not move while the settings are open, so the
    // panel is rendered by the overlay slot, fixed just above the chip.
    let popover = { open: false, chip: null, anchor: null };
    const popoverListeners = new Set();

    function readAnchor(node) {
      if (!node || typeof node.getBoundingClientRect !== 'function') return null;
      const rect = node.getBoundingClientRect();
      if (!rect) return null;
      return { left: rect.left, top: rect.top, bottom: rect.bottom };
    }

    function setPopover(next) {
      popover = next;
      popoverListeners.forEach(function (listener) {
        listener(popover);
      });
    }

    function closePopover() {
      if (!popover.open) return;
      setPopover({ open: false, chip: null, anchor: null });
    }

    function usePopover() {
      const [state, setState] = useState(popover);
      useEffect(function () {
        popoverListeners.add(setState);
        setState(popover);
        return function () {
          popoverListeners.delete(setState);
        };
      }, []);
      return state;
    }

    // The panel scrolls only when the viewport cannot show it whole; make that
    // scrollbar permanent and visible instead of the OS overlay style.
    const STYLE_ID = 'sound-cue-styles';

    function installStyles() {
      if (typeof document === 'undefined' || !document.head) return;
      if (typeof document.getElementById === 'function' && document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = [
        '[data-sound-cue="popover"]::-webkit-scrollbar{width:10px;height:10px}',
        '[data-sound-cue="popover"]::-webkit-scrollbar-track{background:transparent}',
        '[data-sound-cue="popover"]::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2, rgba(128,128,128,0.5));border-radius:6px;border:2px solid transparent;background-clip:content-box}',
        '[data-sound-cue="popover"]::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-secondary, rgba(128,128,128,0.75));border:2px solid transparent;background-clip:content-box}',
      ].join('');
      document.head.appendChild(style);
    }

    function createPopover(ctx) {
      const SoundCuePanel = createPanel(ctx);
      return function SoundCuePopover() {
        const state = usePopover();
        const t = useT(ctx);
        const panelRef = useRef(null);

        useEffect(function () {
          if (!state.open) return undefined;

          const reposition = function () {
            if (!popover.open || !popover.chip) return;
            const anchor = readAnchor(popover.chip);
            if (!anchor) return;
            const previous = popover.anchor;
            if (previous && previous.left === anchor.left && previous.top === anchor.top) return;
            setPopover(Object.assign({}, popover, { anchor: anchor }));
          };
          const onPointerDown = function (event) {
            const target = event.target;
            const panel = panelRef.current;
            if (panel && target && typeof panel.contains === 'function' && panel.contains(target)) return;
            const chip = popover.chip;
            if (chip && target && typeof chip.contains === 'function' && chip.contains(target)) return;
            closePopover();
          };
          const onKeyDown = function (event) {
            if (event.key === 'Escape') closePopover();
          };

          window.addEventListener('pointerdown', onPointerDown, true);
          window.addEventListener('keydown', onKeyDown, true);
          window.addEventListener('resize', reposition);
          window.addEventListener('scroll', reposition, true);
          return function () {
            window.removeEventListener('pointerdown', onPointerDown, true);
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
          };
        }, [state.open]);

        if (!state.open || !state.anchor) return null;

        const anchor = state.anchor;
        const viewportWidth = (typeof window !== 'undefined' && window.innerWidth) || 1024;
        const viewportHeight = (typeof window !== 'undefined' && window.innerHeight) || 768;
        const width = Math.min(320, Math.max(220, viewportWidth - 24));
        const left = Math.min(Math.max(8, anchor.left), Math.max(8, viewportWidth - width - 8));
        const bottom = Math.max(8, viewportHeight - anchor.top + 8);
        // Open with the whole panel visible whenever the space above the chip
        // allows it; only fall back to an internal scroll (with a permanent
        // scrollbar) when the content cannot fit above it.
        const maxHeight = Math.max(200, Math.min(anchor.top - 16, viewportHeight - 24));

        return h('div', {
          ref: panelRef,
          role: 'dialog',
          'aria-label': t('title'),
          'data-sound-cue': 'popover',
          style: {
            position: 'fixed',
            left: left,
            bottom: bottom,
            width: width,
            maxHeight: maxHeight,
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--dsw-alias-border-l2, rgba(128,128,128,0.5)) transparent',
            scrollbarGutter: 'stable',
            boxSizing: 'border-box',
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))',
            background: 'var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, Canvas))',
            color: 'var(--dsw-alias-label-primary, CanvasText)',
            boxShadow: '0 14px 40px rgba(0,0,0,0.22)',
            pointerEvents: 'auto',
            textAlign: 'left',
            zIndex: 30,
          },
        }, h(SoundCuePanel, { compact: true, bare: true }));
      };
    }

    // Composer dock: a compact chip that toggles the shared popover. While the
    // resident listener is on, this component stays silent so the same turn
    // never produces two cues.
    function createDock(ctx) {
      return function SoundCueDock(props) {
        const sessionId = props && props.sessionId;
        const t = useT(ctx);
        const settings = useSettingsState();
        const state = usePopover();
        const settingsRef = useRef(settings);
        settingsRef.current = settings;
        useAudioUnlock();

        useEffect(function () {
          return function () {
            closePopover();
          };
        }, []);

        useEffect(function () {
          if (!sessionId) return undefined;
          if (settingsRef.current.resident) return undefined;
          const cleanups = [];
          let session = null;
          try {
            const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : ctx.sessions;
            const binding = sessions ? sessions.binding(sessionId) : null;
            session = binding ? binding.session : null;
          } catch (err) {
            session = null;
          }
          if (session && typeof session.subscribe === 'function') {
            let previous = false;
            try {
              previous = !!session.getSnapshot().running;
            } catch (err) {
              previous = false;
            }

            const off = session.subscribe(function () {
              let running = false;
              try {
                running = !!session.getSnapshot().running;
              } catch (err) {
                return;
              }
              const current = settingsRef.current;
              if (previous && !running && !current.resident) playCue(current);
              previous = running;
            });
            if (typeof off === 'function') cleanups.push(off);
          }

          // Approvals and questions are published by the client session service
          // as one pending interaction per session, independent of this view.
          let uiSession = null;
          try {
            uiSession = typeof ctx.get === 'function' ? ctx.get('uiSession') : null;
          } catch (err) {
            uiSession = null;
          }
          const status = uiSession && uiSession.sessionStatus;
          if (status && typeof status.getSnapshot === 'function' && typeof status.subscribe === 'function') {
            const read = function () {
              try {
                const entry = status.getSnapshot().get(sessionId);
                return entry ? entry.pendingInteraction : undefined;
              } catch (err) {
                return undefined;
              }
            };
            let previousPending = read();
            const offStatus = status.subscribe(function () {
              const current = settingsRef.current;
              if (current.resident) return;
              const next = read();
              if (next && next !== previousPending && current.enabled && current.notifyActions) {
                playAttention(next.kind, current);
              }
              previousPending = next;
            });
            if (typeof offStatus === 'function') cleanups.push(offStatus);
          }

          return function () {
            cleanups.forEach(function (off) {
              if (typeof off === 'function') off();
            });
          };
        }, [sessionId, settings.resident]);

        const barStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: 0.85 };
        const chipStyle = {
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px',
          borderRadius: 999, border: '1px solid rgba(128,128,128,0.35)',
          background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer',
          lineHeight: 1.5,
        };

        const onChip = function (event) {
          const node = event && event.currentTarget;
          if (popover.open) {
            closePopover();
            return;
          }
          setPopover({ open: true, chip: node || null, anchor: readAnchor(node) });
        };

        return h('div', { style: barStyle },
          h('button', {
            type: 'button',
            style: chipStyle,
            title: t('title'),
            'aria-expanded': state.open ? 'true' : 'false',
            onClick: onChip,
          }, h('span', { 'aria-hidden': 'true' }, settings.enabled ? (settings.resident ? '🔔' : '🔕') : '🔕'), h('span', null, t('button'))));
      };
    }

    // Frame-wide listener: the Session status map is maintained by the client
    // session service for every session, whether or not the conversation view
    // is mounted, so this entry keeps working on any page.
    function createResident() {
      return function SoundCueResident(props) {
        const useSessions = (props && props.useSessions) || function () {};
        const useSessionStatus = (props && props.useSessionStatus) || function () {};
        const byId = useSessions(function (state) {
          return state && state.byId;
        });
        const statuses = useSessionStatus(function (state) {
          return state;
        });
        const previous = useRef(null);

        useEffect(function () {
          if (!statuses || typeof statuses.forEach !== 'function') return;
          const snapshot = new Map(statuses);
          const before = previous.current;
          previous.current = snapshot;
          if (!before) return; // first observation only records a baseline
          const settings = getSettings();
          if (!settings.enabled || !settings.resident) return;
          let ended = null;
          let attention = null;
          snapshot.forEach(function (status, id) {
            const prior = before.get(id);
            if (!prior) return;
            const nextPending = status ? status.pendingInteraction : undefined;
            if (nextPending && nextPending !== prior.pendingInteraction && !attention) {
              attention = nextPending;
            }
            if (prior.running === true && (!status || status.running !== true)) {
              const row = byId ? byId[id] : undefined;
              if (!row || row.origin !== 'subagent') ended = id;
            }
          });
          if (attention && settings.notifyActions) {
            playAttention(attention.kind, settings);
            return;
          }
          if (ended) playCue(settings);
        }, [statuses, byId]);

        return null;
      };
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        installStyles();
        const SoundCueDock = createDock(ctx);
        const SoundCueResident = createResident();
        const SoundCuePopover = createPopover(ctx);

        ctx.slots.inject('conversation.composer.dock', function () {
          return ctx.slots.register({
            name: 'conversation.composer.dock',
            id: 'sound-cue',
            order: 20,
          }, SoundCueDock);
        });

        ctx.slots.inject('shell.overlay', function () {
          const offResident = ctx.slots.register({
            name: 'shell.overlay',
            id: 'sound-cue:resident',
            order: 40,
          }, SoundCueResident);
          const offPopover = ctx.slots.register({
            name: 'shell.overlay',
            id: 'sound-cue:popover',
            order: 41,
          }, SoundCuePopover);
          return [offResident, offPopover];
        });
      },
    };
  },
});
