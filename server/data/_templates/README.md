# Corpus templates

Files here are NOT ingested. The ingest script only reads `data/markdowns/`.

Fill one in, then move it into the right theme folder under `data/markdowns/`
and re-run `npm run ingest`.

## Theme folders and what belongs in each

- `career/`      — one file per role. Facts, scope, outcomes.
- `stories/`     — one file per anecdote. This is the highest-value content.
- `perspective/` — how you think. Opinions, principles, how you make calls.
- `background/`  — education, patents, publications, the short summary.
- `logistics/`   — contact, availability, what you're looking for.

## Section sizing

Each markdown header becomes a retrieval unit. Sections under 150 words
are embedded whole, which is the sweet spot. Keep sections focused and
self-contained — they get quoted back nearly verbatim, so write them the
way you'd want to be quoted.
