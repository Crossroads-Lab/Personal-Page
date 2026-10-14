# Stories to write

Ordered by how often a visitor will hit them against how well the corpus
covers them today. Each entry lists the interview questions it answers and
prompts to draw the story out.

Format: use `story_template.md`. Keep sections under 150 words so each embeds
as one vector. Write headers as the question a visitor would type — headers
are invisible to readers and exist purely as retrieval signal.

---

## Already covered (7)

| File | Answers |
|---|---|
| `snap_beauty_score_filter` | disagreement, ethical concern, pushing back |
| `youtube_shipping_past_politics` | controversial decision, organizational politics |
| `heali_overbuilt_before_validating` | failure, biggest mistake |
| `iscribe_tech_debt_tradeoff` | hard tradeoff, prioritization |
| `iscribe_turnaround` | proudest achievement |
| `heali_nutrition_engine` | favorite project |
| `heali_early_team` | early/small team |

---

## Tier 1 — write these first

The most-asked questions with nothing in the corpus. Every one of these is a
question you WILL be asked in a real interview.

### 1. Firing someone
**Answers:** "Tell me about a time you had to let someone go", "How do you
handle underperformance?", "What's the hardest management decision you've made?"

You have the *position* in `perspective/firing_and_accountability.md` but no
story, so the bot philosophizes instead of answering. Prompts:
- Who, and what was the role? (no names needed)
- When did you first know it wasn't working, and what did you do between then
  and the decision?
- What did you try that didn't work?
- What did you tell the rest of the team afterward?
- What would you do differently?

### 2. Disagreeing upward — CEO, board, or investor
**Answers:** "Tell me about a time you disagreed with your manager", "How do
you push back on leadership?", "Have you ever told a CEO no?"

Snap covers disagreement with a *report*. Upward conflict is a different
question and gets asked more for exec roles. Prompts:
- What was the decision and what was your objection?
- What did you risk by raising it?
- How did you frame it — data, story, ultimatum?
- Did you win? If not, how did you commit to a decision you disagreed with?

### 3. A hire that didn't work out
**Answers:** "Tell me about a hiring mistake", "What do you look for in
engineers?", "How has your hiring changed?"

Pairs with #1 and is the more revealing of the two. Prompts:
- What did you see in the interview that turned out to be wrong?
- How long until you knew?
- What signal did you miss, and what do you screen for now because of it?

### 4. A production incident or outage
**Answers:** "Tell me about a crisis you led through", "Describe a
high-pressure situation", "How do you handle incidents?"

Nothing in the corpus covers operating under real-time pressure — notable for
someone who cut downtime 70%. Prompts:
- What broke, who was affected, how long?
- What did you personally do in the first hour?
- What was the actual root cause vs. what you first thought?
- What changed permanently afterward?

### 5. The .NET 4 → .NET 8 migration
**Answers:** "Tell me about a large technical project you led", "How do you
approach legacy modernization?", "What's the biggest migration you've done?"

The 70% downtime number appears as a bullet with no story behind it. It's your
most checkable technical claim and deserves depth. Prompts:
- Why was it necessary — what was breaking?
- How did you sequence it without freezing feature work?
- What went wrong mid-flight?
- How did you prove the 70%?

---

## Tier 2 — strong coverage gains

### 6. Raising the $4M at Heali
"How do you fundraise?", "What was hardest about raising?" — what nearly
killed the round, and what changed the outcome.

### 7. Winding down or pivoting Heali
"Tell me about something that didn't work out", "How do you know when to
stop?" — the hardest kind of story to tell and the most credible.

### 8. A technical bet that paid off
"Tell me about a risk you took" — what you were betting on, who disagreed.

### 9. A technical bet that didn't
"What's a technical decision you regret?" — how long before you admitted it.

### 10. 100fps on mobile at Amazon A9
"Tell me about a hard technical constraint" — the one story that shows depth
rather than management.

### 11. Running 40+ concurrent projects at Snap
"How do you manage at scale?", "How do you prioritize across a portfolio?"

### 12. The first pen test at iScribeHealth
"Tell me about a compliance or security challenge" — what the findings were
and how you triaged 100% of the high-severity ones.

### 13. A great hire
"Who's the best person you've hired?" — what you saw that others missed.

### 14. Build vs buy
"How do you decide build vs buy?" — a specific decision, not the principle.

### 15. Saying no to a customer or to sales
"How do you handle pressure from the business?"

---

## Tier 3 — depth once Tier 1 and 2 exist

16. Inheriting a team in bad shape
17. Managing managers vs. managing ICs
18. M&A technical due diligence at Snap
19. The Blue Cross Blue Shield partnership
20. Feedback that changed how you work
21. Something you were wrong about for a long time
22. A skill you had to learn late
23. Losing a key person and what you changed
24. Promoting someone into a role they weren't ready for
25. Cross-functional conflict — product vs. engineering

---

## Perspective pieces still missing

Shorter than stories. Use `perspective_template.md`.

- [ ] What you look for when hiring engineers
- [ ] How you evaluate an AI product idea
- [ ] Research vs. product — how you decide what ships
- [ ] Build vs. buy vs. wait
- [ ] How you approach compliance without killing velocity
- [ ] What changed going from big tech to founding
- [ ] How you think about AI agent reliability

## Logistics still missing

- [ ] Location and remote preferences
- [ ] Company stage and size you work best at
- [ ] What you are NOT interested in
- [ ] Availability and notice period
- [ ] Compensation expectations (or a deliberate deflection)

---

## How to work through this

Write one, run `npm run ingest -- stories/<file>.md`, then
`npm run tune-floor` to see whether hit@3 moved. The eval is the feedback
loop — it turns "is this better?" into a number.
