# WebMCP Challenge scope and provenance

`AKzar1el/auvrora-webmcp` was created during the 2026 OpenAI WebMCP Challenge period. **Auvrora WebMCP is a new standalone challenge artifact**, not a public mirror of an older commercial application.

Tomi Šeregi's private DigestSEO work informed the remediation workflow and several defensive audit concepts: bounded public-page retrieval, deterministic findings, and re-audit verification. Auvrora was designed and implemented as an independently runnable public repository. The private DigestSEO codebase, database, accounts, and deployment are not required to build or run this project.

The challenge-specific implementation is visible in the repository's dated public commit history, including the architecture/specification, URL and fetch boundaries, deterministic analyzer, shared human-agent state, native WebMCP tool surface, and challenge documentation.

This submission does not claim prior preferential or financial development support from an OpenAI WebMCP Challenge sponsor. Ordinary public documentation, open-source packages, platform free tiers, and general-purpose development tools are not represented as sponsor-funded development.

## What is new here

- the standalone Auvrora browser experience;
- the five native WebMCP tools;
- the shared human/agent controller and visible scope state;
- deterministic challenge demo fixtures;
- the bounded public audit endpoint and its challenge-specific security model;
- the open-source public repository and deployment.

## What is intentionally not included

- private DigestSEO source or customer data;
- authentication, billing, or persistent user data;
- Google Search Console access;
- multi-page crawling;
- automatic website/code modification;
- an LLM backend or remote MCP server.
