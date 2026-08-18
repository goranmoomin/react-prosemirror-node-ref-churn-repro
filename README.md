# react-prosemirror node view ref churn repro

Minimal reproduction for `@handlewithcare/react-prosemirror` 3.2.7, issue
[#276](https://github.com/handlewithcarecollective/react-prosemirror/issues/276):
a node view component that re-renders on its own (external store,
`useSyncExternalStore`, context, etc.) while forwarding its ref through an
unstable callback ref loses its view desc permanently.

React detaches (null) and reattaches (element) a callback ref whose identity
changed. The detach pass runs `refUpdated()`: `update()` fails (`getDOM()` is
null), `destroy()` runs, and `create()` returns nothing. The reattach pass
then hits `refUpdated`'s `if (!viewDescRef.current) return;` guard, which
mistakes "just destroyed by ref churn" for "not yet mounted" and never
recreates the desc. The element is left with `pmViewDesc === undefined`, so
`posAtDOM`/`posFromDOM` fall back to the nearest ancestor desc and position
mapping breaks for everything in and after the node.

The proposed fix (in `patches/`) tracks mount state in a separate
`mountedRef` so the guard only blocks genuine pre-mount calls; the reattach
pass recreates and re-registers the desc.

## Reproduce by hand

`pnpm dev`, open http://127.0.0.1:5302, then:

1. Click around in "hello": the caret lands where you click.
2. Press the "Re-render node view" button (or run `window.__pmLab.bump()`).
3. Click in the middle of "hello": the caret snaps to the paragraph end.
4. Type: the text appears at the end, not at your click point.

Keyboard-only editing keeps working (`beforeinput` uses the state
selection); only DOM-to-position reads break. The doc change from step 4
re-commits the node view and heals the desc, so the next click works again
until the next bump: the intermittency described in #276.

## Reproduce

Requires a Playwright Chromium (`pnpm exec playwright install chromium` if
missing). The test drives a real Chromium via a Vite dev server and asserts
through `window.__pmLab`, in the style of an editor lab harness.

Two tests: a user-level one (real mouse click + keyboard typing: after one
store bump, clicking can no longer place the caret inside the node -- it
lands at the paragraph end -- and typed text goes to the wrong position) and
a diagnosis-level one (pmViewDesc gone, posAtDOM mapping wrong).

```sh
pnpm install
pnpm test          # RED: click cannot place the caret, typing lands at the end
pnpm run patch     # apply patches/ via pnpm patchedDependencies + reinstall
pnpm test          # GREEN: click and type edit the clicked position
pnpm run unpatch   # back to stock
```

## Manual testing

Restart the dev server after `pnpm run patch` / `pnpm run unpatch`: Vite
pre-bundles the dependency at server startup, so a live server keeps serving
the pre-toggle build.
