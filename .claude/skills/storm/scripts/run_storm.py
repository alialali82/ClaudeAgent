#!/usr/bin/env python3
"""Run the STORM Wiki pipeline (knowledge_storm) for a single topic.

Model-agnostic: the LM is specified as a LiteLLM model string
(e.g. "anthropic/claude-opus-4-1", "openai/gpt-4o", "gemini/gemini-2.5-pro"),
so this works with whatever provider key is set in the environment.

Output lands in <output-dir>/<topic_slug>/, most importantly:
    storm_gen_article_polished.txt  (final article, or storm_gen_article.txt if --no-polish)
    storm_gen_outline.txt
    url_to_info.json                (sources used, for citations)
"""
import argparse
import os
import sys

from knowledge_storm import (
    STORMWikiRunnerArguments,
    STORMWikiRunner,
    STORMWikiLMConfigs,
)
from knowledge_storm.lm import LitellmModel
from knowledge_storm.rm import (
    YouRM,
    BingSearch,
    BraveRM,
    SerperRM,
    DuckDuckGoSearchRM,
    TavilySearchRM,
    SearXNG,
)

RETRIEVER_ENV_KEYS = {
    "you": "YDC_API_KEY",
    "bing": "BING_SEARCH_API_KEY",
    "brave": "BRAVE_API_KEY",
    "serper": "SERPER_API_KEY",
    "tavily": "TAVILY_API_KEY",
    "searxng": "SEARXNG_API_KEY",
    "duckduckgo": None,
}


def build_retriever(name: str, top_k: int):
    if name == "you":
        return YouRM(ydc_api_key=os.getenv("YDC_API_KEY"), k=top_k)
    if name == "bing":
        return BingSearch(bing_search_api=os.getenv("BING_SEARCH_API_KEY"), k=top_k)
    if name == "brave":
        return BraveRM(brave_search_api_key=os.getenv("BRAVE_API_KEY"), k=top_k)
    if name == "serper":
        return SerperRM(
            serper_search_api_key=os.getenv("SERPER_API_KEY"),
            query_params={"autocorrect": True, "num": 10, "page": 1},
        )
    if name == "tavily":
        return TavilySearchRM(
            tavily_search_api_key=os.getenv("TAVILY_API_KEY"),
            k=top_k,
            include_raw_content=True,
        )
    if name == "searxng":
        return SearXNG(searxng_api_key=os.getenv("SEARXNG_API_KEY"), k=top_k)
    if name == "duckduckgo":
        return DuckDuckGoSearchRM(k=top_k, safe_search="On", region="us-en")
    raise ValueError(f"Unknown retriever: {name}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--topic", required=True, help="The research topic / article title.")
    parser.add_argument("--output-dir", default="./storm_output", help="Directory to store outputs.")
    parser.add_argument(
        "--llm-model",
        default="anthropic/claude-opus-4-1",
        help="LiteLLM model string used for every pipeline stage (see https://docs.litellm.ai/docs/providers).",
    )
    parser.add_argument(
        "--retriever",
        default="duckduckgo",
        choices=list(RETRIEVER_ENV_KEYS),
        help="Search backend for research (default: duckduckgo, needs no API key).",
    )
    parser.add_argument("--max-conv-turn", type=int, default=3)
    parser.add_argument("--max-perspective", type=int, default=3)
    parser.add_argument("--search-top-k", type=int, default=3)
    parser.add_argument("--retrieve-top-k", type=int, default=3)
    parser.add_argument("--max-thread-num", type=int, default=3)
    parser.add_argument("--no-polish", action="store_true", help="Skip the polishing stage.")
    parser.add_argument(
        "--remove-duplicate",
        action="store_true",
        help="During polishing, also remove duplicate content across sections.",
    )
    args = parser.parse_args()

    env_key = RETRIEVER_ENV_KEYS[args.retriever]
    if env_key and not os.getenv(env_key):
        sys.exit(f"Missing {env_key} for retriever '{args.retriever}'. Set it or pick --retriever duckduckgo.")

    lm_configs = STORMWikiLMConfigs()
    lm_kwargs = {"temperature": 1.0, "top_p": 0.9}
    # Every stage uses the same model here for simplicity; swap in cheaper/faster
    # models for conv_simulator_lm / question_asker_lm if cost is a concern.
    lm = LitellmModel(model=args.llm_model, max_tokens=4000, **lm_kwargs)
    lm_configs.set_conv_simulator_lm(lm)
    lm_configs.set_question_asker_lm(lm)
    lm_configs.set_outline_gen_lm(lm)
    lm_configs.set_article_gen_lm(lm)
    lm_configs.set_article_polish_lm(lm)

    engine_args = STORMWikiRunnerArguments(
        output_dir=args.output_dir,
        max_conv_turn=args.max_conv_turn,
        max_perspective=args.max_perspective,
        search_top_k=args.search_top_k,
        retrieve_top_k=args.retrieve_top_k,
        max_thread_num=args.max_thread_num,
    )
    rm = build_retriever(args.retriever, engine_args.search_top_k)

    runner = STORMWikiRunner(engine_args, lm_configs, rm)
    runner.run(
        topic=args.topic,
        do_research=True,
        do_generate_outline=True,
        do_generate_article=True,
        do_polish_article=not args.no_polish,
        remove_duplicate=args.remove_duplicate,
    )
    runner.post_run()
    runner.summary()


if __name__ == "__main__":
    main()
