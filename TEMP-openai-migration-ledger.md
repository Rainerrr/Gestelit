# OpenAI API Migration Decision Ledger

Application: Gestelit Render production. User explicitly requested fixes and GPT-6 Luna on 23 November 2026.
Current: direct OpenAI SDK 6.37, Responses API, gpt-5.4-mini. Target: **gpt-6-luna**.
Official model reference: https://developers.openai.com/api/docs/models/gpt-6-luna (checked 2026-11-23).
Existing production key successfully completed a strict JSON-schema canary with the target model.

## Scope and invocation inventory

| Workflow | Decision and implementation | Validation |
|---|---|---|
| Admin BINA chat / NLQ | Preserve approved read-only tools and stored Responses chains. Add receipt-date field, distinct-job metric and preparation eligibility; reject incomplete output and ignore commentary phase. | Unit tests; production acceptance pending |
| Sales chat | Same selected model; preserve personal/team SQL scopes and schemas. | Existing scoped query tests; live check pending |
| Workflow planner | Same model; preserve strict catalog IDs, proposal-only behavior, validation and 4000-token ceiling. | Workflow tests; live check pending |
| Station agent | Same model; preserve human review, strict result schema, read-only snapshot and 3500-token ceiling. | Agent tests; live check pending |
| Deployment | Change only OPENAI_MODEL through Render single-variable PUT before image deployment. Existing credentials unchanged. | Deployment and recorded usage model pending |

## Guidance decisions

| Guidance | Applicability/support | Decision and reason |
|---|---|---|
| Model choice / cost / latency | Yes / yes | Explicit user choice Luna; medium reasoning (documented default) for all four workloads; preserve other environment model overrides. Measure production latency. |
| Instruction filenames | No | No repository instruction files changed. |
| Responses migration | Already present | All four workflows already use Responses; no provider migration. |
| Provider/framework compatibility | Yes / yes | Direct official SDK; no Azure, OpenRouter, LiteLLM, Together or Vercel AI SDK adapter. |
| Streaming / typed events | No for this repair | These flows validate a complete JSON object before displaying it; keep existing complete-response behavior. |
| WebSockets / reconnect lanes | No | Bounded HTTP request-response workflows; changing transport does not fix the observed SQL and semantic faults. |
| Errors / incomplete output | Yes | Fail closed on incomplete admin answers; existing planner/agent guards retained. No blind retry of mutations. |
| Privacy / storage / ZDR | Yes / unchanged | Existing admin and sales stored-response chaining retained. Planner/agent retain store:false. ZDR not asserted or inferred. No new upload, hosted tool, background or jurisdiction. |
| Residency | No change | Existing production project and endpoint retained; no regional processing claims. |
| Processing tiers | Standard retained | No priority, flex, batch or reserved tier needed for interactive product flows. |
| Cache keys / prefix fragmentation | Yes | No new cache key for GPT-6; existing prompts and tool ordering retained. |
| Extended cache retention | No | Earlier-model feature; not added. |
| Explicit cache breakpoints / diagnostics | Supported model, unavailable installed SDK surface | Deferred: SDK 6.37 has no prompt_cache_options/cache_control type; unrelated SDK/cache redesign is not needed to repair acceptance failures. |
| State and reasoning preservation | Yes | Stored-response chains preserve provider-side tool/reasoning items; instructions resent each call. No manual lossy replay added. |
| Encrypted reasoning replay | Not applicable | No stateless multi-step tool loop; single-call store:false workflows need no replay. |
| Reasoning summaries / preambles | No new UI | Do not display hidden reasoning or commentary as final answers. |
| Verbosity | Retained | medium for existing chat; planner/agent unchanged. |
| Output budgets | Retained | Existing 3500/4000 limits and completion guards; no arbitrary new cap on chat. |
| Assistant phases | Yes / yes | Preserve server-side chains; select final/unphased output, excluding commentary. |
| Context compaction | No | Existing bounded history and six-round tool budget; no long-running unbounded agent. |
| Structured outputs | Yes / yes | All existing schemas retained; live canary succeeded. |
| Tool choice | Retained | Automatic approved read-only function tools; no new write tool. |
| Tool search / additional tools | No | Existing fixed catalog and typed query compiler; no dynamic tool ecosystem. |
| Parallel tools | Retained | Existing sequential calls avoid increasing pressure on small production database. |
| Programmatic tool calling | No | SQL/query tools are bounded ordinary functions; no model code execution required. |
| Model-aligned interfaces | Existing domain tools retained | Business datasets and measures corrected without introducing shell/search/patch tools. |

## Outcome

Implementation in progress. Unit, database, build and live UI acceptance results will be recorded before completion. No follow-up permission is needed for the explicitly authorized migration.
