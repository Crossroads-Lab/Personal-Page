# Staying on Azure at iScribeHealth

## What's the hardest technical decision you've made? What's the hardest technical call you've had to make?

The hardest technical call I've made was deciding NOT to migrate iScribeHealth from Azure to AWS. We stayed on Azure.

The tech was crumbling under Azure. Servers were down too often, recovery took an hour at minimum, and legacy services were being shut down. I wanted to move us to AWS.

I argued against it anyway. The industry mostly runs on Azure, and migrating to AWS would potentially have made a future acquisition harder. The technical case and the company case pointed in opposite directions, and the company case won.

We stayed. Then we refactored the platform from .NET 4 to .NET 8 anyway, which cut production downtime by 70% and is what actually fixed the stability problem. So the disruption I'd avoided by not migrating, we took on regardless — just in a different shape. My honest read is that the time wasn't wasted so much as spent somewhere it was always going to have to be spent. The cloud was never the thing holding us back — the age of the code was, and that bill comes due whichever provider you're sitting on. Whether staying on Azure was the right call still isn't settled, and that gets decided by what happens to the company, not by me.

## Would you make the same call today?

I'd weigh it differently, because the cost side has moved. A cloud migration is mostly mechanical work, and that is exactly what an AI agent can carry now. You can also keep two backend configurations — one on AWS and one that still runs on Azure — so the move is reversible instead of a one-way door, and you aren't burning the time or the tokens to prove it out twice.

What that doesn't change is the thing underneath. Either way you're still maintaining a ten-year-old clunky system. The migration was never the expensive part. The age of the code was.
