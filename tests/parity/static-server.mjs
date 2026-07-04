import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2",
  ".woff": "font/woff", ".png": "image/png", ".svg": "image/svg+xml", ".jsx": "text/plain",
};

export function serve(port) {
  const srv = createServer(async (req, res) => {
    try {
      const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
      const file = join(ROOT, path);
      if (!file.startsWith(ROOT)) throw new Error("traversal");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((ok) => srv.listen(port, () => ok(srv)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await serve(4174);
  console.log("parity static server on :4174");
}
