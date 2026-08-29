# WebMCP agent evaluations

LoopFix ships a small evaluation dataset for the agent-facing WebMCP contract in `evals/`.

The goal is deliberately narrower than benchmarking a language model: detect regressions in tool naming, schema drift, tool-selection clarity, ordering, and the human-agent remediation journey without changing the production runtime.

The dataset follows Chrome's current WebMCP evaluation guidance and the JSON format used by GoogleChromeLabs `webmcp-evals`.

## Files

- `evals/tools.json` — static snapshot of the five public WebMCP tool names, descriptions, and input schemas for schema-only model evals.
- `evals/webmcp-evals.json` — ten natural-language cases covering direct requests, ambiguous intent, multi-step journeys, recovery from missing state, and a request that should not invoke any LoopFix tool.
- `test/webmcp-evals.test.ts` — deterministic guards that keep the snapshot aligned with production, validate suite structure, and reject internally inconsistent mocked tool results.

The static tool snapshot is intentionally duplicated for compatibility with external eval tooling. CI compares it with the production tool definitions so the copy cannot silently drift.

## Coverage

The ten cases exercise these behaviors:

1. direct public-page audit;
2. audit followed by finding discovery;
3. finding inspection using an ID returned by the audit workflow;
4. ambiguous severity-based prioritization;
5. ambiguous scope selection with an optional inspection step;
6. full audit → list → inspect → scope → verify journey;
7. multi-finding scope and verification;
8. inspect-before-mutate ordering;
9. recovery when verification is requested from an empty browser state;
10. refusal to invent an unsupported website-edit/deploy capability.

The example target is `https://example.com/`, a stable public documentation domain. The evals use LoopFix's deterministic finding IDs where a concrete ID is needed.

## Deterministic repository gate

`npm test` validates the eval artifacts together with the rest of the application tests. This requires no model API key and is suitable for normal CI.

The eval guard verifies that:

- the static tool snapshot exactly matches the production WebMCP names, descriptions, and input schemas;
- exactly ten categorized eval cases remain present;
- all expected calls reference current LoopFix tools;
- the refusal case remains a genuine no-tool expectation;
- at least one multi-step journey remains covered; and
- mocked `list_findings` results are internally coherent.

## Deterministic live smoke

GoogleChromeLabs `webmcp-evals` includes a `smoke` mode that executes authored required tool calls directly against a live WebMCP page without an LLM or model API key. This verifies that concrete eval trajectories remain executable against the deployed application.

The committed suite also contains one `expectedCall: null` refusal case. That case is intentionally for probabilistic model-selection evaluation: the upstream smoke command requires at least one required tool call, so a no-tool case must be excluded from deterministic smoke rather than converted into a fake call.

LoopFix's production abuse boundary allows 10 audit starts per minute per derived key. The nine executable cases together initiate more than ten audits because `verify_fix_scope` performs a fresh audit. Do not disable or loosen that production control for testing; split smoke execution across limiter windows instead.

Using the GoogleChromeLabs repository at the reviewed commit `97e6fbe83fc3f2e3c6df2198b962dd2ad59cb924`:

```bash
git clone https://github.com/GoogleChromeLabs/webmcp-tools.git
cd webmcp-tools
git checkout 97e6fbe83fc3f2e3c6df2198b962dd2ad59cb924
cd webmcp-evals
npm ci
npm run build

jq '[.[] | select(.expectedCall != null)]' \
  /absolute/path/to/loopfix-mcp/evals/webmcp-evals.json \
  > /tmp/loopfix-smoke.json
jq '.[0:5]' /tmp/loopfix-smoke.json > /tmp/loopfix-smoke-a.json
jq '.[5:9]' /tmp/loopfix-smoke.json > /tmp/loopfix-smoke-b.json

node dist/bin/webmcp-evals.js --chrome-channel chrome smoke \
  -u https://loopfix-webmcp.tomi-seregi99.workers.dev \
  -e /tmp/loopfix-smoke-a.json \
  -v

sleep 65

node dist/bin/webmcp-evals.js --chrome-channel chrome smoke \
  -u https://loopfix-webmcp.tomi-seregi99.workers.dev \
  -e /tmp/loopfix-smoke-b.json \
  -v
```

### Verified result

On **August 29, 2026**, the pinned upstream CLI executed the nine callable cases against the public production Worker using Chrome and passed **29/29 required tool steps**:

- batch A: **12/12** steps across five cases;
- batch B: **17/17** steps across four cases.

The run exercised all five LoopFix WebMCP tools, including both one-finding and two-finding verification journeys and the recovery-from-empty-state journey. The no-tool refusal case is not included in this count because deterministic smoke cannot evaluate an intentional absence of tool calls.

`webmcp-evals` is experimental upstream tooling and is executed from a pinned checkout in a disposable verification environment. LoopFix does not add it to its application dependency graph.

## Probabilistic model evals

Chrome recommends model-driven evals in addition to deterministic tests because agent tool selection is probabilistic. Run these deliberately rather than in the default CI gate: they require a selected model/backend, may cost money, and results can vary across runs.

Schema-only selection eval:

```bash
node dist/bin/webmcp-evals.js local \
  -t /absolute/path/to/loopfix-mcp/evals/tools.json \
  -e /absolute/path/to/loopfix-mcp/evals/webmcp-evals.json \
  --backend <backend> \
  --model <model> \
  --runs 5 \
  --reporter console json html
```

Live browser journey eval:

```bash
node dist/bin/webmcp-evals.js --chrome-channel chrome browser \
  -u https://loopfix-webmcp.tomi-seregi99.workers.dev \
  -e /absolute/path/to/loopfix-mcp/evals/webmcp-evals.json \
  --backend <backend> \
  --model <model> \
  --runs 5 \
  --max-steps 8 \
  --reporter console json html
```

Configure only the environment variable required by the backend you choose. Do not commit model credentials or generated `.evals/` reports containing sensitive data.

## Interpreting results

A model failure is evidence to inspect, not a reason to add model-specific prompt hacks automatically. First classify whether the failure is caused by:

- an unclear or overlapping tool description;
- incorrect schema semantics;
- missing information in an earlier tool result;
- invalid tool ordering;
- a state precondition the agent could not infer;
- or normal model variance.

Changes to the production tool contract should be justified by repeated failures across realistic cases, then covered by the existing deterministic WebMCP contract tests.

LoopFix does not publish a model-selection pass rate until an actual model/backend/runs configuration has been executed and recorded. The committed suite is the reproducible evaluation input, not a fabricated benchmark result.
