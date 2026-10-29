// Talks to the MCP server over stdio the way a client does: handshake, tool list, then one read-only call.
//   node mcp/test.mjs [tool] [json-args]
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const server = spawn("node", [path.join(path.dirname(fileURLToPath(import.meta.url)), "server.mjs")], { stdio: ["pipe", "pipe", "inherit"] });
const pending = new Map();
let buf = "";
server.stdout.on("data", (d) => {
  buf += d;
  for (let i; (i = buf.indexOf("\n")) >= 0; buf = buf.slice(i + 1)) {
    const m = JSON.parse(buf.slice(0, i));
    pending.get(m.id)?.(m);
  }
});
let n = 0;
const call = (method, params) => new Promise((r) => { pending.set(++n, r); server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n"); });
let failed = 0;
const expect = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); failed += !ok; };

const init = await call("initialize", { protocolVersion: "2025-06-18" });
expect(init.result?.serverInfo?.name === "showhow", "initialize names the server showhow");
const list = await call("tools/list");
const names = list.result.tools.map((t) => t.name);
expect(["new_reel", "voice", "align", "check_plan", "draft", "render", "check_render"].every((x) => names.includes(x)), `tools: ${names.join(", ")}`);
expect((await call("tools/call", { name: "nope" })).error, "an unknown tool is refused");
const bad = await call("tools/call", { name: "align", arguments: { slug: "../etc" } });
expect(bad.result?.isError, "a slug that leaves the reels folder is refused");
const [tool, args] = [process.argv[2] ?? "list_reels", JSON.parse(process.argv[3] ?? "{}")];
const r = await call("tools/call", { name: tool, arguments: args });
console.log(r.result?.content?.[0]?.text ?? JSON.stringify(r));
if (process.argv[2]) expect(!r.result?.isError, `${tool} passes`);
server.kill();
process.exit(failed ? 1 : 0);
