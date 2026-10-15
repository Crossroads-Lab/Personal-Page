# How I'd actually adopt AI

## How would you approach AI adoption at our company?

Start small, prove value, repeat. That's not timidity, it's where the evidence points.

The deployments that work solve narrow problems with clean data and visible return — routing trucks, classifying support tickets, reconciling invoices. Walmart's routing overhaul took out $75 million and 72 million pounds of CO2. Klarna's assistant handled two-thirds of support tickets and cut resolution from eleven minutes to under two. Neither is glamorous. Both are measurable.

AI works best when the rules are clear and the data matches the real world. Hand it an inhuman volume of similar cases and it moves fast. Hand it your general infrastructure with poor supervision and you get a house held together by termites.

## How do you evaluate a vendor's productivity claims?

Like an engineer treats a benchmark: test under real conditions, with real people doing real work, before you scale it.

The famous numbers were usually measured on tasks stripped of workplace context. The 2023 MIT study showing a 40% time reduction excluded exactly the conditions that make work hard. The 2025 follow-up found experienced developers *slower* by 19% while feeling faster by 20%.

So the question I ask isn't "what was the gain" but "where did the cost go". If a task completes quickly and then needs constant oversight and correction, the system hasn't removed work — it's pushed it downstream onto someone who isn't counted in the demo. If the gain holds under real conditions, scale it. If it doesn't, adjust without embarrassment.

## What guardrails would you put in place first?

Data boundaries, before anything else. Anything pasted into an AI tool should be treated as potentially shareable outside your organisation, and people should know that before they paste.

This isn't hypothetical — Samsung engineers put confidential source code into ChatGPT while debugging, and analysis of 1.6 million workers found roughly 11% of what employees paste into consumer AI tools is confidential. Most have never read the terms governing where it goes.

So: clear rules on what data can be used, where it's processed, and who remains accountable for the result. Trust in these systems starts with clarity about boundaries, not enthusiasm.

I'd also treat generated code as unreviewed by default. Roughly 40% of Copilot-generated programs in one systematic review contained vulnerabilities. That doesn't mean don't use it. It means don't skip the review you'd have done for a human.

## What's the cultural risk nobody budgets for?

Losing the habit of questioning. Encourage people to challenge results, verify assumptions and explain their reasoning — and make it safe to say "I don't believe this output."

The organisational version of this is worse than the individual version. One person who stops thinking critically makes mistakes. A culture that stops thinking critically stops being able to detect them, and by the time a decision built on hollow input fails, nobody can reconstruct which input was hollow.

There's also an environmental and operational cost that rarely makes the business case. Training GPT-3 emitted roughly 550 tonnes of CO2, and Google reported over six billion gallons of water used in its data centres in 2023, driven partly by AI workloads. Deploying at scale is an environmental decision as much as a technical one.
