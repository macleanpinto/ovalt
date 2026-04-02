import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
loadDotenv({ path: resolve(__repoRoot, ".env") });
loadDotenv({ path: resolve(__repoRoot, ".env.local"), override: true });

const { buildApp } = await import("./server.js");

const app = await buildApp();
const port = Number(process.env.PORT) || 3001;
await app.listen({ port, host: "0.0.0.0" });
app.log.info(`API listening on ${port}`);
