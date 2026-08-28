export const LOOPFIX_TOOL_SCHEMAS = Object.freeze({
  run_audit: {
    type: "object",
    additionalProperties: false,
    properties: {
      url: {
        type: "string",
        description: "Complete public HTTP or HTTPS page URL to audit.",
      },
    },
    required: ["url"],
  },
  list_findings: {
    type: "object",
    additionalProperties: false,
    properties: {
      severity: {
        type: "string",
        enum: ["error", "warning", "notice"],
        description: "Optional severity filter.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        description: "Maximum findings to return; defaults to 10.",
      },
    },
  },
  inspect_finding: {
    type: "object",
    additionalProperties: false,
    properties: {
      findingId: {
        type: "string",
        description: "Finding ID returned by list_findings.",
      },
    },
    required: ["findingId"],
  },
  set_fix_scope: {
    type: "object",
    additionalProperties: false,
    properties: {
      findingIds: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 10,
        uniqueItems: true,
        description: "One to ten current finding IDs to include in the fix scope.",
      },
    },
    required: ["findingIds"],
  },
  verify_fix_scope: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
} as const);
