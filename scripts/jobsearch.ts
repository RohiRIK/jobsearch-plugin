#!/usr/bin/env bun
// Entry point for `jobsearch`; the implementation lives in src/jobsearch/.
import { main } from "../src/jobsearch/cli.js";

if (import.meta.main) process.exit(await main());
