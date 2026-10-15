# Balancing tech debt against shipping at iScribeHealth

## Tell me about a time you had to make a hard tradeoff

At iScribeHealth I had to balance cleaning up technical debt against shipping features. The usual framing makes that a zero-sum trade: every week on debt is a week not shipping, and the pressure is always to defer the cleanup.

## How do you prioritize technical debt against shipping features?

I prioritized re-architecture early rather than fitting it around feature work. That's the uncomfortable version — it costs visible delivery in the near term and you have to hold the line while it does.

## How do you balance long-term strategic goals with short-term fire-fighting?

By refusing to treat them as a standing trade-off and instead asking which one gets more expensive if I defer it.

At iScribeHealth the fire was constant — customers waiting, features promised — and the long-term call was re-architecting the platform first. I took the re-architecture, because the compliance work was coming either way and doing it on an unstable platform would have cost multiples of doing it on a sound one. Deferring would have meant paying for it during SOC 2 and HIPAA, at a much worse time.

The judgement isn't "strategy over firefighting". It's that most fires recur, and the strategic work is usually the thing that stops them recurring. If you only ever fight the fire in front of you, you have chosen, without noticing, to fight it again next quarter.

What makes it survivable politically is sequencing something visible alongside it, so people can see progress while the invisible work happens underneath.

## Why did prioritizing re-architecture work out?

Doing the re-architecture first is what made both innovation and compliance possible afterward. We unlocked scale without slowing delivery, because the delivery that came after was on a platform that could actually carry it. Deferring it would have meant paying for it during the SOC 2 and HIPAA work, at a much worse time.
