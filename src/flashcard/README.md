# Flashcard module

This module owns HiCard/flashcard behavior.

## Public entry

Code outside `src/flashcard` should import from `src/flashcard`:

```ts
import { FSRSManager, FlashcardComponent } from "../flashcard";
```

Avoid importing directly from `components/`, `services/`, `settings/`, or `types/` outside this module unless there is a strong reason.

## Internal layout

- `types/`: shared flashcard and FSRS data contracts.
- `services/`: storage, scheduling, group, source-card, event-sync, and daily-stat logic.
- `components/`: flashcard UI composition and renderers.
- `settings/`: flashcard settings tab.

## Boundary rule

`FSRSManager` is the public service facade. Smaller services such as `DailyStatsService`, `SourceCardService`, and `FlashcardEventSyncService` are implementation details used to keep `FSRSManager` maintainable.

## Scheduler compatibility

The scheduler is pinned to `ts-fsrs 5.4.2`, which implements FSRS-6. Building requires Node.js 20 or later; the bundled scheduler runs in Obsidian without Node APIs.

New installations and parameter resets use the library's default weights. On load, only the exact historical HiNote default weight array is replaced with the current defaults. Other custom weights retain their values subject to upstream range normalization. Daily limits and target retention are preserved. The normalized parameters are saved before accepting reviews, so displayed and persisted weights match the scheduler.

This migration does not recalculate existing due dates, reset card state, or rewrite review history. Updated weights take effect on subsequent ratings. `npm run test:flashcards` covers migration, restart idempotence, failed writes, minute-scale learning, prediction parity, and undo.
