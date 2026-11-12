# Why I build in JavaScript and TypeScript

## Why do you build everything in JavaScript?

Because it's the only language the browser speaks natively, and because one language across the whole stack removes a class of problems that otherwise never goes away.

Every other choice is a translation layer. If the frontend is JavaScript and the backend is something else, every data model exists twice, every validation rule exists twice, and the two drift. Not if — when. I've debugged enough production incidents that turned out to be a date parsed one way on the client and another way on the server to stop treating that as an acceptable cost.

TypeScript is the part that makes this serious rather than convenient. Plain JavaScript's dynamic typing is what gives the language its bad reputation with people who've only met it at scale, and they're not wrong. Types are what turn it into something you can maintain with a large team over years.

## Isn't JavaScript a liability for a real backend?

That argument is about fifteen years out of date, and it confuses the language with its ecosystem.

The language itself is thirty years old, created in 1995 and governed by the ECMAScript standard. Web standards are close to religious about not breaking old sites, so code written decades ago still runs in a browser shipped this year. There are very few platforms with that record.

The fair version of the criticism is about churn — not in the language, but in the tooling and frameworks around it. That's real, and it does create maintenance overhead. The way I manage it is to be conservative about dependencies and boring about architecture: a small number of libraries I'd be willing to fork, and a clear line between what's mine and what's rented.

## What does one language across the stack actually buy you?

Three things, and the third is the one people miss.

**No context switching.** The same engineer picks up a frontend ticket in the morning and an API change in the afternoon without changing the shape of their head.

**Shared models and validation.** The data model, the validation schema, the business rules — written once and imported on both sides. Not duplicated, not mirrored, not kept in sync by discipline. Imported.

**Offline-first becomes possible rather than heroic.** This is the one that matters most to me. If the same library runs in the browser and on the server, the client can run the real syncing logic, the real conflict resolution and the real validation locally, then reconcile later. Try that with two languages and you're maintaining two implementations of your hardest code and praying they agree.

## What about hiring?

The pool is the largest there is, because every web developer has to learn it whether they wanted to or not. The 2026 Stack Overflow survey puts JavaScript at 62% developer usage, ahead of SQL at 58.4%, Python at 58%, and TypeScript at 43.8%. Compared with hiring for Go, Rust or Java, you are fishing in a much bigger lake.

The flip side is a filter problem, and I'd rather say it than pretend. The barrier to entry is low, so the volume of junior applicants is high and the variance in quality is wide. You have to actually vet. If a team tells me they chose JavaScript to make hiring easy and they're not running a serious technical interview, they haven't made hiring easier — they've moved the cost downstream.

## Does the choice matter for AI coding agents?

Yes, and not in the direction most people assume.

Python still leads raw benchmarks. Most foundational coding benchmarks were built on Python repositories, and frontier models score measurably better on it — Claude 3.7 Sonnet resolved 63% of Python tasks on SWE-bench Verified against 43% across multilingual repositories. Usage follows: the 2026 Stack Overflow survey has Python at 39% of AI-assisted coding, JavaScript at 38.4%, TypeScript at 30.4%.

But the gap that matters in practice is between TypeScript and plain JavaScript, not between Python and JavaScript. An agent writing plain JavaScript produces code that looks right and fails silently at runtime. An agent writing TypeScript gets compiler errors immediately and corrects itself before anything runs. GitHub's Octoverse data shows AI-assisted coding is actively pushing teams toward TypeScript for exactly this reason, with monthly active contributors growing over 66% year on year.

A type system is a feedback loop. Agents need feedback loops more than humans do, because they don't feel doubt.

## We're on Python, Java or .NET. Should we migrate?

Almost certainly not wholesale, and I'd be suspicious of anyone who says otherwise in the first meeting.

A working system that your team understands is worth more than an architecture diagram that's one language cleaner. The cost of a rewrite is never the code — it's the year of institutional knowledge that doesn't transfer, and the bugs you'd already fixed coming back.

What I'd actually do:

**Leave what works.** If your Python data pipeline or your Java transaction core is stable and the people who know it are still in the building, it stays. Full stop.

**Move the edges first.** New services, the BFF layer, anything the browser talks to directly. That's where the duplicate-model tax is highest and where the migration pays for itself fastest.

**Share types at the boundary before sharing code.** Generate TypeScript types from your existing API schemas. You get most of the drift protection with none of the rewrite.

**Only consolidate the core if the duplication is actively costing you.** Count the incidents. If you can't point at bugs caused by the two stacks disagreeing, the duplication is theoretical and the migration is vanity.

I'd rather run a polyglot system honestly than a monoglot one that took eighteen months and cost a team.

## When wouldn't you choose it?

Heavy numerical and ML work — Python owns that, the libraries are there, and I'd use it without hesitation. Systems programming, anything where you're counting microseconds or managing memory by hand: Go, Rust or C++. High-frequency or very large-scale data processing where the runtime's single-threaded model becomes the bottleneck rather than an irrelevance.

And if a team is already excellent in another stack, that's a real argument. The best language is often the one your people can already debug at two in the morning.
