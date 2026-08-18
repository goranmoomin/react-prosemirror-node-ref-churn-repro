import "prosemirror-view/style/prosemirror.css";

import {
  ProseMirror,
  ProseMirrorDoc,
  reactKeys,
  useEditorEffect,
} from "@handlewithcare/react-prosemirror";
import type { NodeViewComponentProps } from "@handlewithcare/react-prosemirror";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { forwardRef, useSyncExternalStore } from "react";
import type { Ref } from "react";
import { createRoot } from "react-dom/client";

// Instrumentation surface in the style of prosemirror-lab's window.__pmLab:
// the spec waits on `ready`, triggers the self re-render through `bump`, and
// reads editor state through `view` instead of sleeping.
declare global {
  interface Window {
    __pmLab?: {
      ready: boolean;
      view: EditorView | null;
      bump: () => void;
    };
  }
}

// A trivial external store every paragraph node view subscribes to: a
// stand-in for any app-level store (Zustand, context bridge, etc.) that
// re-renders node view components without react-prosemirror's memoized
// ReactNodeView wrapper re-rendering.
let version = 0;
const listeners = new Set<() => void>();
const store = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot() {
    return version;
  },
  bump() {
    version++;
    listeners.forEach((listener) => listener());
  },
};

window.__pmLab = { ready: false, view: null, bump: store.bump };

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0],
      parseDOM: [{ tag: "p" }],
    },
    text: { group: "inline" },
  },
});

function setRefThrough<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

const Paragraph = forwardRef<HTMLParagraphElement, NodeViewComponentProps>(
  function Paragraph({ children }, ref) {
    const v = useSyncExternalStore(store.subscribe, store.getSnapshot);

    // Unstable callback ref: new identity on every render (legal React), so
    // React detaches (null) and reattaches (element) the forwarded ref on
    // each re-render.
    const setRef = (el: HTMLParagraphElement | null) => {
      setRefThrough(ref, el);
    };

    // data-version lets the spec wait deterministically for the re-render
    // to commit instead of sleeping.
    return (
      <p ref={setRef} data-version={v}>
        {children}
      </p>
    );
  }
);

function CaptureView() {
  useEditorEffect((view) => {
    window.__pmLab!.view = view;
    window.__pmLab!.ready = true;
  });
  return null;
}

const state = EditorState.create({
  schema,
  doc: schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("hello")]),
  ]),
  plugins: [reactKeys()],
});

createRoot(document.getElementById("root")!).render(
  <div style={{ padding: 16 }}>
    {/* Same trigger the spec uses via window.__pmLab.bump(): click it, then
        click into the text and watch the caret land in the wrong place. */}
    <button type="button" onClick={store.bump} style={{ marginBottom: 12 }}>
      Re-render node view (external store bump)
    </button>
    <ProseMirror defaultState={state} nodeViewComponents={{ paragraph: Paragraph }}>
      <CaptureView />
      <ProseMirrorDoc />
    </ProseMirror>
  </div>
);
