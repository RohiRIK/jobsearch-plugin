#!/usr/bin/env bun
// Deprecated alias for scripts/jobsearch.ts (`bun run agent`), kept for one release.
import { main } from "../src/jobsearch/cli.js";

if (import.meta.main) process.exit(await main());
