# The nutrition engine at Heali

## What's a project you're proud of? What's your favorite thing you built?

At Heali I built an AI nutrition engine that processed 2B+ data points to personalize diets for chronic disease patients. It's one of my favorite projects I've worked on.

## Why was the Heali nutrition engine hard to build?

Nutrition data is messy, contradictory, and scattered. Turning it into something precise enough to put in front of a patient with a chronic condition is a data engineering problem before it's a modeling problem.

## Tell me about solving a complex problem with very limited data or resources.

This is the one. At Heali the data was the problem, and we were a seed-stage company without the budget to buy our way out of it.

Nutrition data is messy, contradictory and scattered across sources that disagree with each other — and it had to become precise enough to put in front of a patient with a chronic condition, where being wrong has consequences. There was no clean dataset to license and no team large enough to label our way through it by hand.

So I treated it as a data engineering problem before a modelling one, and built a semi-supervised pipeline: use the small amount of trustworthy data to bootstrap labels across the large amount of untrustworthy data, then tighten iteratively. That got us to 2 billion-plus entry points supporting 200+ medical conditions.

The general lesson I take from it: when you're short on data, the leverage is almost never a cleverer model. It's finding the structure that lets a little bit of reliable signal propagate across a lot of unreliable signal.

## What came of the Heali nutrition engine?

We launched a B2C app that grew to 10K+ users and secured national partnerships. Blue Cross Blue Shield was one of our business partners.
