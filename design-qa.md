# HiCard focused study design QA

- Source visual truth: `/Users/kai/.codex/generated_images/01a0ded2-8a9e-7bb0-a773-0a6cce346341/exec-8fe9979a-1462-4cac-9c5d-0c0c7299912c.png`
- Implementation screenshot: live CUA capture in the current Codex thread (`Obsidian → HiCard → 原子设计`, front and answer-revealed states)
- Viewport: Obsidian desktop window, approximately 1512 × 982 CSS px at native desktop density
- Source pixels: 1536 × 1024; implementation capture: 3024 × 1902 physical pixels, visually normalized to the same full-window composition
- State: light theme; regular group session; card front and answer-revealed states

## Full-view comparison evidence

The implementation preserves the source hierarchy: persistent HiCard navigation, one compact session header, a thin progress line, a single centered study card, and one primary reveal action directly below the card. The old heatmap and in-session group column are absent. The live front-state capture confirms the selected option's proportions, warm neutral surfaces, teal action, and generous whitespace.

## Focused region comparison evidence

Focused inspection covered the session header/progress, card typography, reveal button and shortcut hint, source line, pause action, and the four answer-rating controls. No raster or decorative image assets are present in the source; native Obsidian icons remain vector UI controls.

## Comparison history

1. Initial answer-state capture found two P2 issues: legacy CSS forced white rating labels on light buttons, and inherited answer typography was oversized.
2. Fixed rating-label colors to use semantic rating tokens, reduced answer typography, and added `aria-hidden` to the inactive card face.
3. Post-fix live capture confirmed readable semantic labels, comfortable answer wrapping, and only the visible card face in the accessibility tree.

## Findings

- Fonts and typography: passed. Uses Obsidian interface and content fonts with a clear session/card/action hierarchy.
- Spacing and layout rhythm: passed. Header, progress, study stage, card, reveal/rating controls, source and secondary actions align consistently.
- Colors and visual tokens: passed. Uses Obsidian background, border and accent tokens; rating accents remain restrained and legible.
- Image quality and asset fidelity: passed. The design contains no raster imagery; existing native icon assets are preserved.
- Copy and content: passed. Session name, progress, card content, reveal action, shortcut, source and study actions are present.
- Responsive behavior: passed by code inspection for the 700px breakpoint; rating actions become a two-column grid and content padding contracts.
- Accessibility: passed for visible hierarchy, button semantics, shortcut labeling, focusable controls, and hidden inactive card face. Full assistive-technology testing remains outside screenshot QA.

No actionable P0, P1 or P2 findings remain. A future P3 polish pass could tune card height for unusually short panes.

final result: passed

---

# HiCard year heatmap interaction QA

- Source visual truth: `/var/folders/3s/h254l8z571v_pd0wzv1kftdh0000gn/T/codex-clipboard-98817510-7e8b-44fd-a977-8585bd7096f3.png`
- Implementation screenshot: live CUA capture in the current Codex thread (`Obsidian → HiCard → Statistics`, heatmap hover state)
- Viewport: Obsidian desktop window, approximately 1512 × 946 CSS px at native `@2x` desktop density
- Source pixels: 2242 × 572; implementation capture: 3024 × 1892 physical pixels. Comparison used the focused heatmap region rather than whole-window scaling.
- State: light theme; year heatmap; one historical day hovered; today visible in the final grid cell.

## Full-view comparison evidence

The revised heatmap retains the existing 53-week responsive layout, month and weekday axes, activity summary, and legend. The source issue state showed a duplicate tooltip, a dark external today outline, a clipped enlarged final cell, and a vertical scrollbar. The live post-fix view shows a single tooltip, an inset teal today marker, unchanged cell dimensions on hover, and no vertical scrollbar.

## Focused region comparison evidence

Focused inspection covered the visible hover tooltip, rightmost week/today cell, right edge of the heatmap scroller, footer divider, and activity legend. This focused region was required because all reported defects were localized to the heatmap interaction and overflow boundary.

## Comparison history

1. Initial source capture identified three P2 issues: duplicate hover text, non-theme today emphasis plus right-edge clipping, and unintended vertical overflow.
2. Removed the native `title` while preserving the accessible `aria-label`; replaced the external dark outline with an inset accent ring; disabled year-cell hover scaling; set the year scroller to `overflow-y: hidden`.
3. Post-fix live hover capture confirmed one tooltip, no size change or edge clipping, teal inset today emphasis, and no vertical scrollbar.

## Findings

- Fonts and typography: passed. Tooltip and axis text remain consistent with Obsidian interface typography.
- Spacing and layout rhythm: passed. Cell dimensions and 53-column alignment remain stable during hover.
- Colors and visual tokens: passed. Today and hover states use `--interactive-accent` rather than a hard-coded dark outline.
- Image quality and asset fidelity: passed. No raster or custom image assets are involved.
- Copy and content: passed. The single tooltip retains the complete date and learning/review counts.
- Interaction and overflow: passed. Hover no longer transforms cell size; vertical overflow is suppressed while narrow-pane horizontal scrolling remains available.
- Accessibility: passed. The duplicate native title was removed while `aria-label` remains on every date cell.

No actionable P0, P1, or P2 findings remain.

final result: passed
