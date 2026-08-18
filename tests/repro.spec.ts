import { expect, test, type Page } from "@playwright/test";

// https://github.com/handlewithcarecollective/react-prosemirror/issues/276
//
// A node view component that re-renders for a reason react-prosemirror does
// not know about (external store) while forwarding its ref through an
// unstable callback ref loses its view desc permanently: the ref detach
// destroys the desc (getDOM() is null, so create() returns nothing), and the
// reattach hits refUpdated's `if (!viewDescRef.current) return;` guard, which
// mistakes "just destroyed by churn" for "not yet mounted".
//
// Stock 3.2.7: DOM -> position mapping falls back to the nearest ancestor
// desc, so mouse clicks can no longer place the caret inside the node and
// typing goes to the wrong position. Patched: desc recreated on reattach,
// editing intact.

async function clickAtTextOffset(page: Page, offset: number) {
  const point = await page.evaluate((offset) => {
    const p = document.querySelector(".ProseMirror p")!;
    const t = document.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode()!;
    const r = document.createRange();
    r.setStart(t, offset);
    r.setEnd(t, offset);
    const b = r.getBoundingClientRect();
    return { x: b.left, y: b.top + b.height / 2 };
  }, offset);
  await page.mouse.click(point.x, point.y);
}

// Chromium + prosemirror-view defer selection sync after a mouse click
// (delayedSelectionSync runs in a setTimeout), so wait for the state to
// settle on the expected caret instead of reading immediately. On stock the
// selection never arrives and the follow-up assertion reports the actual
// (wrong) caret.
async function waitForCaret(page: Page, from: number) {
  await page
    .waitForFunction(
      (expected) => window.__pmLab!.view!.state.selection.from === expected,
      from,
      { timeout: 1000 },
    )
    .catch(() => {});
}

function editorState(page: Page) {
  return page.evaluate(() => {
    const view = window.__pmLab!.view!;
    return {
      text: view.state.doc.textContent,
      from: view.state.selection.from,
      to: view.state.selection.to,
    };
  });
}

test("click and type still edit the node view after a self re-render with an unstable callback ref", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__pmLab?.ready === true);
  await page.waitForSelector('p[data-version="0"]', { state: "attached" });

  // Control: before the churn, clicking "h|ello" places the caret at pos 2.
  await clickAtTextOffset(page, 1);
  await waitForCaret(page, 2);
  expect(await editorState(page)).toEqual({ text: "hello", from: 2, to: 2 });

  await page.evaluate(() => window.__pmLab!.bump());
  await page.waitForSelector('p[data-version="1"]', { state: "attached" });

  // Clicking "hel|lo" must move the caret to pos 4. On stock 3.2.7
  // posFromDOM falls back to the doc desc and the caret lands at the
  // paragraph end (pos 7) instead: the user can no longer place the caret
  // inside the node by clicking.
  await clickAtTextOffset(page, 3);
  await waitForCaret(page, 4);
  expect(await editorState(page)).toEqual({ text: "hello", from: 4, to: 4 });

  // And typing must insert at the clicked position. On stock 3.2.7 the
  // text lands at the end: "helloX".
  await page.keyboard.type("X");
  expect(await editorState(page)).toEqual({ text: "helXlo", from: 5, to: 5 });
});

test("node view desc survives a self re-render with an unstable callback ref", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__pmLab?.ready === true);
  await page.waitForSelector('p[data-version="0"]', { state: "attached" });

  const before = await page.evaluate(() => {
    const p = document.querySelector(".ProseMirror p");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { hasDesc: !!(p as any)?.pmViewDesc };
  });
  expect(before.hasDesc).toBe(true);

  await page.evaluate(() => window.__pmLab!.bump());
  await page.waitForSelector('p[data-version="1"]', { state: "attached" });

  const after = await page.evaluate(() => {
    const view = window.__pmLab!.view!;
    const p = document.querySelector(".ProseMirror p")!;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode()!;
    const positions: number[] = [];
    for (let offset = 0; offset <= 5; offset++) {
      positions.push(view.posAtDOM(textNode, offset));
    }
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hasDesc: !!(p as any).pmViewDesc,
      positions,
    };
  });

  expect(after.hasDesc).toBe(true);
  // "hello" starts at doc position 1: <doc><p>hello...
  expect(after.positions).toEqual([1, 2, 3, 4, 5, 6]);
});
