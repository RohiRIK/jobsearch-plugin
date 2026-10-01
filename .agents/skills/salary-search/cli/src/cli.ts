import { createCLI } from "@bunli/core"
import { lookup, list } from "./commands/lookup.js"
import { convert } from "./commands/convert.js"

const cli = await createCLI({
  name: "salary-cli",
  version: "1.0.0",
  description: "Benchmark company salaries against your own dataset (Danish + Hebrew name matching)",
})

cli.command(lookup)
cli.command(list)
cli.command(convert)

await cli.run()
