/**
 * Renders public/ovalt.svg to 120×120 PNG for Google OAuth consent screen (max 1MB).
 * Output: ../../branding/google-oauth-consent-logo-120.png
 */
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "..", "..", "branding");
const outFile = join(outDir, "google-oauth-consent-logo-120.png");

mkdirSync(outDir, { recursive: true });

const svg = readFileSync(join(root, "public", "ovalt.svg"));

await sharp(svg).resize(120, 120).png({ compressionLevel: 9 }).toFile(outFile);

console.log("Wrote", outFile);
