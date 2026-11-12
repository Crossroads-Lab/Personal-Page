# Why I build PWAs instead of native apps

## Why would you build a PWA rather than a native app?

Because for most products the native app is three codebases solving a problem one codebase already solved, and the difference shows up in every budget line you have.

I'm not against native. I'm against paying for it when nothing in the product requires it. The honest test is simple: does this product need something only the native runtime can give it? If the answer is a shrug, you've just saved yourself two engineering teams.

## What does it actually save?

Start with headcount. Native means a web team, an iOS team and an Android team — three hiring pipelines, three release calendars, three sets of opinions about the same feature. A PWA means one.

The per-head cost is lower too. JavaScript engineers are the largest talent pool in software; specialist iOS and Android engineers are scarcer and priced accordingly. And there's a cost people forget to count: keeping native engineers current. Apple and Google reshape their platforms on their own schedule, and staying fluent means conferences, migration guides and a chunk of every year spent absorbing changes nobody asked for.

Then there's the obvious one. A feature is built once. Not once, then twice more by people translating someone else's decisions into two other languages.

## What happens when Apple or Google changes the design language?

This is the argument I'd lead with if I only got one, because it's the one that bites hardest and is hardest to see coming.

When a platform decides every component now looks a particular way — a new material, a new motion language, a new navigation model — a native app has to be adapted to it, component by component, or it starts looking like it was abandoned. That's not a sprint. That's a quarter, twice, on two platforms.

A web app wearing a thin native wrapper has a much smaller surface facing that change. The wrapper is a shell: it handles the store listing, the push tokens, the permissions. Maintaining a shell through a platform redesign is a fundamentally easier job than adapting an entire application to one. You're keeping up with a wrapper, not rewriting a product.

## How does shipping differ?

After the first submission, mostly you stop asking permission.

A native release goes through store review every time. Which is fine until you have a bug in production on a Friday and the fix is waiting in a queue. With a PWA the first commit goes through review and everything after it is served from your own infrastructure — new features, copy changes, bug fixes, all live the moment you deploy them.

For feature velocity that's a meaningful advantage. For incident response it's the difference between fixing something in minutes and explaining to a customer why the fix exists but they can't have it yet.

## Doesn't it feel worse than native?

In my experience, essentially all of it can be matched — animation, navigation, transitions, gesture handling. Call it 99.99%. The remaining fraction is real and it's worth naming: sustained high-performance rendering. If you're building a game, or anything pushing the GPU continuously, go native and don't argue about it.

Everything else — the product apps most companies are actually building — the web can do, and users can't tell. What they can tell is when a transition stutters or a tap takes 300ms to respond, and those are craft problems, not platform problems. I've seen native apps that feel worse than good web apps, and the reason was never the runtime.

The part that takes discipline is that web gives you the freedom to be sloppy and native constrains you into some of the right answers by default. You have to be deliberate about what native hands you for free.

## Does it change how fast you can build?

Yes, and increasingly so. AI coding agents are markedly stronger in JavaScript and TypeScript than in Swift or Kotlin — more training data, more public code, more feedback from a type checker.

There's a practical dimension too: an agent can iterate on a web interface and look at the result without Xcode or Android Studio in the loop. The build-inspect-correct cycle is seconds rather than minutes, and it doesn't need a simulator booted.

I'd still test on real devices before shipping anything. Emulators and headless browsers lie about exactly the things that matter on a phone — keyboard behaviour, safe areas, how the browser's own chrome overlaps your layout. But the distance from idea to something you can look at is much shorter on the web, and that compounds.

## We already have native apps. Do we rewrite?

Not as a rewrite, no. I'd be very cautious about anyone proposing to throw away two shipping apps for architectural tidiness.

What I'd do instead:

**Find out what the native apps are actually costing.** Not the headline salaries — the release overhead, the time lost to platform migrations, the features that shipped late on one platform because a specialist was on holiday. Most teams have never counted this, and the number is usually larger than they expect.

**Build the next new surface as web.** A new section, a new flow, something self-contained. Put it in a webview inside the existing native apps. You learn whether the approach holds in your product, with your users, at a cost you can afford to write off.

**Migrate screen by screen, behind the existing shells.** Users stay in the app they installed. The native code shrinks as the web surface grows. Nothing has a big-bang cutover date, which means nothing has a big-bang failure mode.

**Keep native where native is earning its place.** Camera pipelines, background processing, anything with a hard performance floor. A hybrid that's honest about where the boundary sits beats a purist answer in either direction.

**Only retire a native codebase when it's nearly empty.** By then it's a decision about maintenance, not a bet.

The thing to resist is the rewrite framed as a strategy. Migration is a sequence of small reversible moves, each one justified on its own. If you can't justify step one by itself, you don't have a plan — you have a preference.

## When is native the right call?

Games and sustained GPU work. Anything that must run reliably in the background. Deep hardware integration — advanced camera control, Bluetooth peripherals, specialised sensors. Products where a platform capability lands first on native and the capability is the product.

And occasionally the answer is political rather than technical: if a company's whole engineering identity is native and the team is excellent at it, forcing a migration can cost more in people than it saves in process. Watch for that one honestly. The best architecture decision is sometimes the one that keeps a strong team intact.
