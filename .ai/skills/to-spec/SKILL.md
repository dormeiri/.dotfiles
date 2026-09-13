---
name: to-spec
description: "Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you've already discussed."
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a spec. Do NOT interview the user; just synthesize what you already know.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

3. Decide the impact of the change on the user:

- Distruptive: The solution will require significant changes to the user's workflow or system, and may cause temporary disruption.
- Significant: The solution will require some changes to the user's workflow or system, but will not cause major disruption.
- Minor: The solution will require minor changes to the user's workflow or system, and will not cause any disruption.
- Silent: The solution will not require any changes to the user's workflow or system

4. Write the spec using [./SPEC_FORMAT.md](./SPEC_FORMAT.md). Write in `specs/` directory if not specified otherwise.
