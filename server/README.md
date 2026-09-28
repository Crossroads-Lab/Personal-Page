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

    npm run retrieve -- "your question"   # retrieval only, no API key, no cost
    npm run ask -- "your question"        # full loop, one-shot
    npm run ask                           # full loop, interactive
    npm run app                           # HTTP server

## Notes

- `prewarm` is restricted to `{ features: true }` in `config.js`. A bare
  `prewarm()` loads all five xenova defaults — including t5-base and
  LaMini-Flan-T5-783M, roughly 1.2GB — which OOMs a 1GB instance.
- Model IDs and pricing in `config.js` override the vendored
  `llms/src/claude/config.js`, which still carries the Jan-2025 table.
