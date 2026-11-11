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

## Before you ingest: does this section need rewriting?

Default to **no**. A section that already answers its own heading is done,
and rewriting it costs more than it looks: every edit re-runs ingest (one
model call per section, so it is not free), invalidates the manifest, and
quietly replaces the author's voice with the voice of whoever did the
rewrite. The thing that makes a corpus worth reading is that a person wrote
it. That is the first thing a rewrite spends.

Work through it in this order, and stop at the first "no".

**1. Read the section against its own heading. Does it answer it?**
If yes, you are finished. Not "could it be fuller" — could a reader who
typed that question walk away satisfied. Short is not the same as
incomplete; a two-sentence answer to a factual question is a good answer.

**2. Is the heading one the page will *offer* (a starter chip)?**
Then it is published verbatim — see `server/server/starters.js` — so it has
to stand up without a model smoothing it over. If it reads as a setup rather
than an answer, **extend the starter's `from` list across the sections that
already continue it** before you touch a word of prose. The later sections
in a well-written file are the rest of the answer; they were written as the
continuation and they concatenate into one piece. Four starters on this site
are assembled that way and not one word of them was rewritten.

**3. Only now consider editing, and only for one of these:**
- a pronoun or reference that does not resolve inside the section itself
  ("We did, before the customers woke up" — did *what*?). These are worth
  fixing regardless, because retrieval can surface any section alone.
- a fact that is wrong, stale, or contradicts another section.
- something the heading promises that the text genuinely does not contain.
  A story that stops before its outcome is the common case.

Anything else — tightening, restructuring, "making it stronger" — is you
preferring your own draft. Leave it.

## Let the question pick the shape

A question that asks for a structured answer should get one. Behavioural
interview questions ("tell me about a time you…") want the full arc:
situation, task, action, **result** — and the result is the part that goes
missing. Other kinds of page have their own version of that arc. A retailer
answering "will this fit my setup?" wants constraint → option → trade-off →
what to buy. A creator answering "how did you make this?" wants the problem,
the attempt, what broke, what shipped.

A question that asks for a *story* — "what's your best story from…", "how
did you end up doing this?" — is answered by a story. Forcing an arc onto
one strips exactly what made it worth telling. On this site the five
biographical files are deliberately left as narrative for that reason.

The rule generalises: the question type picks the shape. There is no single
template that should be applied across a corpus, and applying one is how a
corpus ends up sounding like it was generated.
