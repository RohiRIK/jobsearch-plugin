/**
 * Every `jobsearch` command, assembled from its modules. Process-level
 * commands (`mcp`) load their implementation lazily so a plain CLI call never
 * pays for the MCP SDK.
 */
import type { CommandSpec } from "./contract.js";
import { CORE_COMMANDS } from "./commands.js";
import { HOST_COMMANDS } from "./hosts.js";
import { TOOLCHAIN_COMMANDS } from "./toolchain.js";

export const COMMANDS: Record<string, CommandSpec> = {
  ...CORE_COMMANDS,
  ...HOST_COMMANDS,
  ...TOOLCHAIN_COMMANDS,
  mcp: {
    summary: "Serve the command table as MCP tools over stdio (what plugin MCP configs run)",
    mutation: false,
    output: "stdio",
    cliOnly: true,
    flags: {},
    run: async () => {
      const { serveMcp } = await import("./mcp.js");
      await serveMcp();
      return { data: null };
    },
  },
};
