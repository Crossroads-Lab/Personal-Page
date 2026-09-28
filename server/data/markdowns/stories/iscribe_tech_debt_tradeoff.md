# Balancing tech debt against shipping at iScribeHealth

## The tension

At iScribeHealth I had to balance cleaning up technical debt against shipping features. The usual framing makes that a zero-sum trade: every week on debt is a week not shipping, and the pressure is always to defer the cleanup.

## The call I made

I prioritized re-architecture early rather than fitting it around feature work. That's the uncomfortable version — it costs visible delivery in the near term and you have to hold the line while it does.

## Why it worked

Doing the re-architecture first is what made both innovation and compliance possible afterward. We unlocked scale without slowing delivery, because the delivery that came after was on a platform that could actually carry it. Deferring it would have meant paying for it during the SOC 2 and HIPAA work, at a much worse time.
