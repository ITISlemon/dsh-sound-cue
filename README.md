# dsh-sound-cue

A sound cue plugin for the DeepSeek Harness (DSH) Web UI: it plays a short sound
when a turn finishes, and a different alert when something waits for you (an
approval, a question, a plan review), so you can look away while the agent works.

## Install

From this repository, into a DSH profile (`desktop` in the desktop app, `web`
for the Web CLI):

```bash
dsh plugin --profile desktop add github:ITISlemon/dsh-sound-cue#v1.3.1
```

DSH checks GitHub with `git ls-remote` before installing, so that form needs Git.
Without Git, install the release tarball instead — it skips the Git check:

```bash
dsh plugin --profile desktop add https://github.com/ITISlemon/dsh-sound-cue/archive/refs/tags/v1.3.1.tar.gz
```

The same specs work in the app through the plugin manager (Settings → Plugins →
install by spec). After installing, open a conversation: the 🔔 chip sits under
the composer.

## What it does

- Two cues:
  - **completion** — the chosen preset or your own audio file, once per turn end;
  - **attention** — its own sound, independent of the completion cue: by default a
    fixed three-note alert (lower for approvals, higher for questions), or any
    built-in tone / your own audio file, so a prompt that needs an answer is
    recognisable without looking.
- Entry point: a small bell chip under the conversation composer. Clicking it
  opens a floating panel above the chip (rendered by the frame-wide overlay, so
  the conversation layout never shifts), with the switches (master, always-on
  listener, attention alert), the sound picker, volume, preview, and an
  attention-alert preview. Click outside or press Escape to dismiss it. The panel
  grows to fit its content in the space above the chip; only when the viewport is
  too short does it scroll, with a permanently visible scrollbar.
- Always-on listener: when *Keep listening on other pages* is on, cues are driven
  by the client-wide session status map (`running`, `pendingInteraction`) instead
  of the conversation view, so they still fire while Settings, the plugin market,
  or another panel is open. The composer chip stays silent in that mode so a
  single turn never produces two cues.
- Built-in tones: chime, bell, marimba, pop, ding (synthesized with WebAudio,
  no audio assets shipped).
- Custom tone: choose any `audio/*` file (stored as a data URL in this browser's
  `localStorage`, 3 MB limit) — separately for the completion cue and the
  attention cue.
- Switches: master, always-on listener, attention alert; plus two sound pickers
  (completion / attention), volume, and both previews.

Settings key: `dsh-sound-cue:settings`.

## Slots

- `conversation.composer.dock` / `sound-cue` (order 20) — composer chip.
- `shell.overlay` / `sound-cue:resident` (order 40) — headless always-on
  listener.
- `shell.overlay` / `sound-cue:popover` (order 41) — floating settings panel.

## Development

- The package is plain ESM with no build step: `index.js` is the host entry,
  `client.js` is the browser bundle loaded through `window.__ModuleLoader__`,
  and `cordis.patch.yml` inserts the `sound-cue` row.
- A local profile can link this folder (`~/.dsh/profiles/<profile>/node_modules/dsh-sound-cue`),
  so editing `client.js` takes effect without reinstalling.
- `dev/smoke.test.mjs` loads the real `client.js` in a sandbox with a fake React
  runtime, WebAudio and `localStorage`, and checks the cue and panel behaviour:
  `node dev/smoke.test.mjs` (any Node.js 20+).

## License

MIT — see [LICENSE](./LICENSE).
