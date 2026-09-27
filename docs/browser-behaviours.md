# Browser behaviours that look like bugs

Two things get reported as defects from time to time and are worth writing down,
because both cost real time to chase and neither is caused by this project.

---

## 1. A vertical line appears in the text when you click it

**What it is:** the browser's text insertion caret.

When you click on text inside a non-editable element, Chromium places a collapsed
selection (a caret) at that point. It is standard behaviour for every website, and
it disappears as soon as you click elsewhere or select something.

**How it was confirmed.** `tools/compare-caret-on-text.mjs` clicks a heading on
this project's page and on a neutral `data:` page that has none of our CSS, and
reports the resulting selection:

| Page | `selection.type` | collapsed |
| --- | --- | --- |
| Neutral page, no stylesheet of ours | `Caret` | true |
| This project, hero heading | `Caret` | true |
| This project, contact paragraph | `Caret` | true |

Identical in all three cases, so it is the browser, not the page.

**If it is distracting.** There is only one way to stop it, and it is a trade-off
rather than a fix:

```css
/* Stops the caret, but also stops the visitor selecting or copying the text. */
.user-select-none { user-select: none; }
```

That is why it is **not** applied to the content. Hiding it site-wide would break
copying event details, and disabling text selection is generally regarded as
hostile to users. If the caret is unwanted on purely decorative text (the hero
headline, the statistic values), it can be applied to those elements alone while
paragraphs, prices, addresses and descriptions stay selectable.

**Related but different:** one earlier defect really was ours. The section jump
used to add `tabindex="-1"` to its target and call `focus()` on it, which made a
whole section behave like a text input and also drew the `:focus-visible` ring
around it. That is fixed, and `tools/probe-caret.mjs` shows the before and after.

---

## 2. A coloured band appears at the top or bottom edge while scrolling

**What it is:** the browser's scroll-chain indicator. When a scroll reaches the
end of the page and the gesture continues, Chromium flashes a band at the edge to
show that the page has nothing more to give. It belongs to the browser window, not
to the document, so it cannot be styled or removed from the page.

**How to tell it apart from a page element:** it spans the entire viewport width
including the area outside the content container, it appears only while
scrolling, and it sits exactly at the top or bottom edge rather than at a section
boundary. `tools/scan-accent-edges.mjs` reports *page* elements with warm borders
or outlines, so if it returns nothing, the band is the browser's.

---

## Tools used for this class of question

| Tool | Answers |
| --- | --- |
| `tools/compare-caret-on-text.mjs` | Does the caret also appear on a page with none of our CSS? |
| `tools/probe-caret.mjs` | Does clicking a section focus it (and paint a ring)? Supports `--inject-tabindex` to reproduce the old defect. |
| `tools/scan-accent-edges.mjs` | Which page elements paint a warm (yellow/amber) border or outline? |
| `tools/sample-pixels.mjs` | Which rows of the rendered page contain a full-width coloured line? |
| `tools/find-element-at.mjs` | Which element occupies a given point on the page? |
| `tools/inspect-focus.mjs` | What holds focus after a load or a reload, and what outline does it have? |
