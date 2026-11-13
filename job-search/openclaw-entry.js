// OpenClaw native entry for the jobsearch plugin.
//
// Everything this plugin gives OpenClaw is declared statically in
// openclaw.plugin.json: the skills under ./skills and the `job-search` stdio
// MCP server (./scripts/jobsearch mcp). OpenClaw only treats a package as a
// native plugin, rather than as the Claude bundle in .claude-plugin/, when
// package.json declares an entry, so this one exists. It imports nothing,
// registers nothing in-process, and does no I/O.
export default {
  id: "jobsearch",
  name: "jobsearch",
  description: "Evidence-grounded job-search workflow: skills plus the job-search MCP server, declared in openclaw.plugin.json.",
  register() {},
};
