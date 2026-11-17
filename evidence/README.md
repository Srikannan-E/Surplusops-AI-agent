# Evidence folder

Everything that supports the pitch for the food-surplus rescue agent, in one place.

## Structure

```
evidence/
├── README.md                  ← this file
├── EVIDENCE.md                ← the register: every source, date, grade, form link, claims map
├── process-friction-log.md    ← how the CURRENT donation and composting process works, step by step
├── raw/                       ← your own source files (rules PDF, master context, Reddit captures)
├── screenshots/               ← screenshots of each form and portal page (add these)
└── pdfs/                      ← downloaded official PDFs (add these, e.g. the DET requirements)
```

## Rules for keeping it trustworthy

1. **A claim goes in the deck only if it maps to an ID in `EVIDENCE.md` section 13.**
2. **Open the page before you quote it.** Many entries are marked `Excerpt` because only a search excerpt was seen. Change the mark to `Full` once you have read the page.
3. **Fill in every `n/d` date** by checking the page, then update the row.
4. **Label simulated or estimated numbers** as such. Never present a hypothesis as a finding.
5. **Reddit and AI-generated material is grade D.** Use it for public sentiment only, never for facts or legal points.
6. **Re-check anything legal or regulatory** with the official source (Dubai Municipality, IACAD, DET) before the pitch.

## Grades

| Grade | Meaning |
|---|---|
| A | Official or government primary source |
| B | Reputable news, trade press or a company press release |
| C | Secondary site, aggregator, user reviews or competitor-authored |
| D | Community posts, anecdotes or AI-generated summaries |

## Naming convention for added files

- Screenshots: `screenshots/<ID>_<short-name>_<YYYY-MM-DD>.png` (example: `screenshots/D01_reloop-restaurant-page_2026-11-14.png`)
- PDFs: `pdfs/<ID>_<short-name>.pdf` (example: `pdfs/G01_det-sustainability-requirements-2025.pdf`)
- Survey exports: `raw/K02_survey-responses_<YYYY-MM-DD>.csv`

## Adding a new source

1. Add a row to the right section of `EVIDENCE.md` with the next free ID.
2. Fill in: title, publisher, date, URL, what it is used for, grade, read status.
3. If it supports a pitch claim, add or update a row in section 13.
4. Add a line to the change log at the bottom.

## Copyright note

The PDFs in `raw/` and `pdfs/` are for your private project use. Do not republish them. In the deck, cite the source and keep quotes short.
