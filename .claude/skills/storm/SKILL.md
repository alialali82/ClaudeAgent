---
name: storm
description: Generate a Wikipedia-style, cited research article on a topic using Stanford OVAL's STORM system (internet research + multi-perspective question asking + outline-driven writing). Use this whenever the user wants a deeply-researched, citation-backed article, report, or "wiki page" on a topic rather than a quick unsourced answer — phrases like "write me a research article on X", "use STORM to research X", "generate a wiki-style report on X", "do a deep dive on X with sources", or "/storm X" should all trigger this. Also use it when the user wants Co-STORM's collaborative research mode. Do not use this for quick factual questions Claude can just answer directly, or for tasks that don't need external research and citations.
---

# STORM: researched, cited articles

STORM (Synthesis of Topic Outlines through Retrieval and Multi-perspective
question asking) is a pipeline, not a single LLM call: it surveys existing
articles to find distinct perspectives on the topic, simulates conversations
between a "writer" and topic experts to ask deeper follow-up questions,
drafts an outline from what it learned, then writes and polishes a
full article with inline citations. It takes real wall-clock time (multiple
LLM calls and web searches per run — usually a few minutes) and produces a
noticeably more thorough, sourced result than asking the model to just write
an article from memory. That's the tradeoff to set expectations on before
running it.

## Before running: check the environment

STORM needs two things configured as environment variables — an LLM and a
search backend. Check both before doing anything else, so you fail fast with
a clear ask instead of burning minutes into a run that errors out partway
through:

1. **An LLM API key.** STORM runs on [LiteLLM](https://docs.litellm.ai/docs/providers),
   so any provider LiteLLM supports works — check for whichever key is set
   (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, etc.) and pass
   the matching LiteLLM model string via `--llm-model` (e.g.
   `anthropic/claude-opus-4-1`, `openai/gpt-4o`). Default in the bundled
   script is `anthropic/claude-opus-4-1`.

2. **A search backend.** One of `YDC_API_KEY` (You.com), `BING_SEARCH_API_KEY`,
   `BRAVE_API_KEY`, `SERPER_API_KEY`, `TAVILY_API_KEY`, `SEARXNG_API_KEY` —
   or none at all, since `duckduckgo` needs no key and is the script's
   default. DuckDuckGo is fine for a quick/free run but less reliable and
   lower-quality than the paid APIs for a real report — mention that
   tradeoff if the user has no search key set and is running something they
   care about.

If no LLM key is set at all, stop and tell the user exactly which
environment variable to set — don't guess or run a doomed pipeline.
If no search key is set, it's fine to proceed with DuckDuckGo, but say so.

## Setup

Ensure the package is installed (fast no-op if it already is — always safe
to run):

```bash
pip show knowledge-storm > /dev/null 2>&1 || pip install knowledge-storm
```

## Running it

Ask the user for the topic if they didn't give one in their request — a
good STORM topic is a noun-phrase like a Wikipedia title ("The 2011 Tōhoku
earthquake", "Retrieval-augmented generation"), not a question. If their
request *is* phrased as a question, rephrase it into a topic yourself
rather than bothering them about it.

Also confirm (or pick a sensible default like `./storm_output`) where the
output should be saved, particularly if this is running inside a git repo
where you don't want to dump generated content by accident.

Then run the bundled script:

```bash
python3 .claude/skills/storm/scripts/run_storm.py \
  --topic "The topic here" \
  --output-dir ./storm_output \
  --llm-model anthropic/claude-opus-4-1 \
  --retriever duckduckgo
```

Key flags (all have sane defaults — only override what the user's request
or environment demands):
- `--llm-model`: LiteLLM model string matching whichever API key is set.
- `--retriever`: `duckduckgo` (default, no key), `you`, `bing`, `brave`,
  `serper`, `tavily`, or `searxng` — pick based on which key is set.
- `--no-polish`: skip the polishing stage (summary + optional dedup) if the
  user wants the raw draft faster.
- `--remove-duplicate`: have the polishing stage strip repeated content
  across sections.
- `--max-conv-turn`, `--max-perspective`, `--search-top-k`: raise these for
  a deeper/more expensive run, lower them for a quicker/cheaper one.

Run it in the foreground and let it complete — it prints progress as it
goes through research, outline, drafting, and polishing. If it's clearly
going to take a while, tell the user what's happening rather than going
quiet.

## After it finishes

Output lands in `<output-dir>/<topic_slug>/` (topic lowercased,
underscore-joined). The files that matter:

- `storm_gen_article_polished.txt` — the final article (or
  `storm_gen_article.txt` if `--no-polish` was used)
- `storm_gen_outline.txt` — the outline STORM settled on
- `url_to_info.json` — the sources actually cited
- `conversation_log.json` — the simulated research conversations, useful if
  the user wants to see *how* it arrived at the outline

Read the final article and show the user its content (or a substantial
excerpt for a long one) directly in the conversation, along with the output
path — don't just point at the file and stop. Mention how many/which
sources it drew on if that's easy to surface from `url_to_info.json`.

## If it fails partway through

STORM writes intermediate artifacts as it goes (`conversation_log.json`,
`direct_gen_outline.txt`, etc. — see the script's docstring for the full
list). If a run dies partway (rate limit, transient search API error), you
can often resume from where it left off rather than restarting the whole
pipeline: re-run with the *same* `--output-dir` and `--topic`, and pass only
the remaining `--do-*` stages by editing the script's `runner.run(...)`
call, or just rerun as-is — STORM caches and reuses intermediate files it
finds in the topic directory. Check the actual error before assuming it's a
STORM bug — a missing/expired API key or a search backend's own rate limit
are the most common causes, not the pipeline itself.

## Co-STORM (collaborative mode)

Co-STORM adds a human participant into the discourse loop alongside
simulated experts and a moderator — it's designed for a back-and-forth
session, not a single non-interactive call, so the bundled script doesn't
wrap it. If the user specifically wants Co-STORM's collaborative/mind-map
mode rather than the standard one-shot article, look at
`knowledge_storm.collaborative_storm.engine.CoStormRunner` in the installed
`knowledge-storm` package (`python3 -c "import knowledge_storm, os; print(os.path.dirname(knowledge_storm.__file__))"`
to find it) and build the interactive loop it needs directly — don't force
it through this skill's one-shot script.
