# How this page works

## Did you build this page? Is this a chatbot?

I built all of it — the retrieval, the corpus, the page. It's not a chatbot wrapper and it isn't a product I bought.

It's a RAG system: a retrieval layer over a corpus I wrote myself, with a model composing the answer from what it retrieves. The distinction that matters is where the words come from. The model isn't drawing on what it happens to know about me from the internet; it's answering out of documents I sat down and wrote, in my own voice, about my own career. If I didn't write it, it isn't in here.

## Are these your real answers, or is the AI making them up?

They're mine. Every answer on this page is composed out of things I actually wrote.

The corpus is a few dozen documents — the stories, the positions, the career facts — and each one is written the way I'd say it out loud. Retrieval finds the sections that bear on your question and the model puts them together into an answer to the question you actually asked, rather than handing you a page and making you find the part that matters.

What it will not do is invent. Ask about something I haven't written up and you get "I haven't written that up" rather than a plausible paragraph. That's a deliberate choice and it costs me: it means the page sometimes has to say no. I'd rather it did that than have you quote something back to me in an interview that I never said.

## How do you stop it hallucinating?

By never putting it in a position where guessing is the easy option.

The answer is built from retrieved sections, so there's source text behind it rather than a model's recollection. When retrieval finds nothing close enough, the answer says so instead of reaching. And the suggested questions are drawn from the corpus itself — if a question appears as a button on this page, there's an answer behind it, by construction. A system that suggests questions it can't answer is one that teaches itself to improvise.

There's also a guard underneath it. The section ranges are offsets into the source files, so if I edit a document without rebuilding its vectors, the offsets point at the wrong text — the sort of fault that produces confident, wrong answers with nothing in the logs. The server refuses to start in that state rather than serve it.

## What's the architecture? How is it built?

Deliberately small. No vector database, no framework, no orchestration layer.

The corpus is markdown. Ingest turns each document into a flat binary of float vectors plus the questions each section should answer, and retrieval is a dot product over those. Embeddings run locally on the server with a small open model rather than through a paid API, so retrieval costs nothing per query. The only thing I pay for is composing the answer, and most of this page avoids even that.

The whole backend is one Node process with no database and no upload endpoints, serving one public corpus. That's the entire attack surface, and it's that small on purpose.

## Isn't running an AI page like this expensive?

Not the way this one is built, because most of what you can do here never calls a model.

The opening suggestions arrive with their answers already attached, so pressing one renders instantly and costs nothing. The follow-ups underneath are the same — the page is handed a small tree of them along with the first answer, so you can read several questions deep without it making another request. Pressing any question I wrote the answer to is free.

A model call happens when you type something I didn't anticipate, which is the case genuinely worth paying for. The result is a page that's fast because it isn't thinking, and cheap because it only thinks when there's something to think about.

## Why build this instead of just putting up a resume?

Because a resume answers the questions I chose and nothing else.

What a recruiter actually wants is usually a follow-up: not where I worked but what the hardest call was, not that I led a team but what happened when I got a hire wrong. A static page makes them guess which paragraph holds it. This one lets them ask.

It's also the most honest demonstration I can offer of what I do. I spend my time building AI systems that are narrow, measurable and supervised rather than impressive and vague. This page is that argument made in public, running, with its failure mode set to "I haven't written that up".
