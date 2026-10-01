// process.stdin reads fd 0 through the node stream layer, which works under
// snap-packaged bun where Bun.stdin's /dev/stdin open fails with EPERM.
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}
