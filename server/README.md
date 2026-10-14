# personal-page-server

RAG backend for [william-brendel.com](https://william-brendel.com). Reuses the
ask-nereus retrieval engine (`llms/`, vendored) against a personal corpus.

No vector database and no embedding API: retrieval is flat `.bin` files scored
in memory, and embeddings come from `bge-small-en-v1.5` running locally as
quantized ONNX. The only recurring cost is the box and Claude tokens.

## Setup

    npm install
    cp .env.example .env      # add ANTHROPIC_API_KEY

## Corpus

Markdown lives in `data/markdowns/<theme>/<stem>.md`. Each markdown header
becomes a retrieval unit; `documentId` is `<theme>|<stem>`.

Templates and a suggested content list are in `data/_templates/` (not ingested).

    npm run ingest                    # build .bin with LLM augmentation
    npm run ingest -- --no-augment    # fast, no API key, weaker retrieval
    npm run ingest -- career/snap.md  # one file

Re-run ingest after editing any markdown — the `.bin` ranges are byte offsets
into the file, so edits invalidate them.

## Running

    npm run verify                        # are the bins in sync with the markdown?
    npm run retrieve -- "your question"   # retrieval only, no API key, no cost
    npm run tune-floor                    # sweep the cosine floor, no cost
    npm run ask -- "your question"        # full loop, one-shot
    npm run ask                           # full loop, interactive
    npm run app                           # HTTP server on :3002

## Running the whole thing locally

Two processes — the API, and a static server for the site. They are separate
on purpose: in production the site is on GitHub Pages and only `/query` is
dynamic, so a dead backend degrades to "the chat box is broken" rather than
"the site is down".

    # terminal 1 — the API
    cd server && ALLOWED_ORIGIN='*' npm run app

    # terminal 2 — the site
    cd .. && python3 -m http.server 8000

Then open http://localhost:8000. `scripts/api.js` points at
`http://localhost:3002` for localhost and `https://api.william-brendel.com`
everywhere else, so no configuration is needed to switch between them.

Worth knowing: stop the API and the chat box still answers, in William's
voice, telling the visitor to email instead. That path is deliberate — test
it by killing the API process and asking a question.

## Models

| Path | Model | Cost |
|---|---|---|
| Answers (`/query`) | Claude Haiku 5.5 | ~$0.001/query |
| Ingest augmentation | Claude Sonnet 5.5 | ~$3 per full re-ingest |

Haiku 5.5 and Haiku 4.5 are NOT drop-in compatible: 5.5 rejects
`temperature` and accepts `thinking: adaptive`; 4.5 is the exact inverse.

## Notes

- `prewarm` is restricted to `{ features: true }` in `config.js`. A bare
  `prewarm()` loads all five xenova defaults — including t5-base and
  LaMini-Flan-T5-783M, roughly 1.2GB — which OOMs a 1GB instance.
- Model IDs and pricing in `config.js` override the vendored
  `llms/src/claude/config.js`, which still carries the Jan-2025 table.
