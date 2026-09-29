# Phase 0 Feature Inventory

## Current Sinco product routes

- `/` — homepage / hero / navigation.
- `/curriculum.html` — 122-topic curriculum/mapping catalogue and detail panel.
- `/practices.html` — 62 legacy practice catalogue.
- `/lab.html` — legacy visual stepper presented as Virtual Laboratory.
- `/periodic.html` — 118-element periodic table.
- `/trainers.html` — trainer catalogue; no generic trainer runtime engine.

## Current data baseline

- `data/curriculum.json` — 122 theory records.
- `data/practices.json` — 62 legacy practice records.
- `data/elements.json` — 118 elements.
- `data/methodology.json` and `data/summary.json` — migration/reference metadata.

## v19 regression capabilities that must not be lost silently

Verified in `source/KimyoLab_v19_reference.html`:

- periodic table and element-oriented UI;
- laboratory catalogue and grade browsing/filter behavior;
- theory/studio visual renderers;
- trainer widgets;
- worksheet generator;
- answer-key / print flow;
- responsive navigation/layout.

## Known current-product limitations

- curriculum page is primarily mapping metadata, not a Learning Hub;
- lab uses text-step progression, not an experiment state machine;
- simulation engine is absent;
- trainers page is catalogue-oriented;
- assessment/mastery/persistent progress are absent;
- content/runtime source-of-truth is not canonical yet.
