---
name: storm
description: Research and draft a comprehensive, cited, Wikipedia-style report on a topic using STORM's method (Synthesis of Topic Outlines through Retrieval and Multi-perspective Question Asking, Stanford OVAL). Use when the user asks for deep/comprehensive research on a topic, a "STORM report," a Wikipedia-style article, a knowledge-curation writeup, or a multi-perspective survey of a subject — not for quick fact lookups or short answers.
---

# STORM: multi-perspective research report

Reimplements the method from Stanford's STORM (https://github.com/stanford-oval/storm) natively:
instead of calling external search APIs and multiple configured LLMs, this skill uses Claude itself
as every role (perspective personas, topic expert, writer) and `WebSearch`/`WebFetch` as the
retrieval module. Output is a single cited article, not a separate pipeline of scripts.

Before the first search, load the search tools if not already available:
`ToolSearch({query: "select:WebSearch,WebFetch", max_results: 5})`.

## When to scale effort

- Narrow or already-familiar topic: 3 perspectives, 3 questions each.
- Broad, contested, or unfamiliar topic: 5-6 perspectives, 4-6 questions each.
- If the user gives a deadline/length hint ("quick overview" vs "deep dive"), match it — don't run
  the full pipeline for a one-paragraph ask; just answer directly and mention STORM wasn't needed.

## Procedure

### 1. Scope the topic

State the topic back in one line and, only if genuinely ambiguous (e.g. it names a common term with
several unrelated meanings, or "compare X" without saying on what axis), ask one clarifying question.
Otherwise proceed — don't stall on scoping.

### 2. Discover perspectives

Search for a small number of existing articles/reports on this topic and closely related topics
(e.g. `"<topic> overview"`, `"<topic> wikipedia"`, `"<topic> debate"` / `"<topic> criticism"`).
Skim their structure (section headings, who is quoted, what angles they cover) to identify **3-6
distinct perspectives** a well-informed writer would need to represent — not generic roles, but
ones this specific topic actually calls for. Examples of the kind of variety to aim for:

- A domain practitioner / builder of the thing
- A historian or someone tracing how it got here
- A critic or someone highlighting risks/controversy/failure modes
- A regulator, economist, or someone covering second-order/policy effects
- An end-user or someone affected by it, distinct from those who build or study it

Name each perspective concretely (e.g. "a securities regulator" not "an expert") and write one
sentence on what that perspective is trying to find out.

### 3. Simulate grounded conversations, per perspective

For each perspective, run an inner loop of 3-6 turns:

1. **As the perspective**, ask one pointed question that follows from what's been learned so far
   (first question: what that persona would most want to know; later ones: a natural follow-up).
2. **As the topic expert**, answer it — but ground the answer in a real search first
   (`WebSearch`, then `WebFetch` on the most relevant 1-3 results) rather than answering from
   training data. Extract concrete facts, figures, and quotes, each tagged with its source URL.
3. Let the next question be driven by what the answer just revealed (a STORM signature — this is
   what makes the questions deepen instead of listing generic sub-topics).

Keep a running, deduplicated reference list as you go: `[n] Title — URL`. Reuse a reference's number
if a later turn (any perspective) cites the same source again.

You may run perspectives one at a time, or dispatch each to a background `Agent` (general-purpose,
read-only research: give it the topic, the persona, and instructions to return its Q&A transcript
plus a numbered source list) to parallelize when there are 4+ perspectives and the topic is large.
If parallelizing, merge and renumber references after all perspectives return.

### 4. Curate & outline

From every turn's extracted facts, build a hierarchical outline (H2 sections, H3 subsections) that
organizes the material by topic, not by perspective — perspectives were a tool to gather breadth,
they should not become section headings. Merge overlapping findings; note unresolved
disagreements between sources explicitly rather than silently picking one side.

### 5. Write the article

Write full prose sections following the outline. Every non-obvious factual claim gets an inline
citation marker `[n]` pointing at the reference list. Do not cite anything you didn't actually pull
from a search result in step 3 — no fabricated citations. Open with a short lead section summarizing
the topic before the detailed sections (Wikipedia-style), and close with a `## References` section
listing every `[n]` used, in order.

### 6. Polish

Re-read for duplicate content across sections (common when perspectives overlapped) and merge it.
Confirm every `[n]` in the text has a matching entry in References and vice versa (no orphaned
citations, no unused references). Trim any section that turned out thin to a sentence or fold it
into a neighbor rather than leaving a stub.

## Output

Default to a Markdown file (in the user's working directory or scratchpad) or a chat reply for a
short report. If the user wants something shareable/viewable, use the `docs` skill or an `Artifact`
per this session's normal rules — STORM's own output is just Markdown with citations, not a
particular surface.
