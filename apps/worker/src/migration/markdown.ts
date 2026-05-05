import type { MigrationReportPayload } from "./buildReport.js";

export function reportToMarkdown(r: MigrationReportPayload): string {
  const lines: string[] = [];
  lines.push(`# Migration report`);
  lines.push("");
  lines.push(`- **Run:** ${r.runId}`);
  lines.push(`- **Import:** ${r.importId}`);
  lines.push(`- **Ruleset:** ${r.rulesetVersion}`);
  lines.push(`- **Generated:** ${r.generatedAt}`);
  lines.push("");
  lines.push(`## Executive summary`);
  lines.push("");
  lines.push(r.executiveSummary);
  lines.push("");
  lines.push(`## Review status`);
  lines.push("");
  lines.push(r.needsReview ? "**Needs review** — provisional or incomplete mappings present." : "**Ready** — all mappings vendor-documented and complete.");
  lines.push("");
  lines.push(`## Summary counts`);
  lines.push("");
  lines.push(`| Mappings | Warnings | Manual actions |`);
  lines.push(`| --- | --- | --- |`);
  lines.push(`| ${r.summaryCounts.mappings} | ${r.summaryCounts.warnings} | ${r.summaryCounts.manualActions} |`);
  lines.push("");
  lines.push(`## Compliance`);
  lines.push("");
  lines.push(`- **PII risk:** ${r.complianceFlags.piiRisk}`);
  lines.push(`- **Consent:** ${r.complianceFlags.consentModeRecommended ? "Review Consent Mode / regional policy" : "N/A"}`);
  for (const n of r.complianceFlags.notes) {
    lines.push(`- ${n}`);
  }
  lines.push("");
  lines.push(`## Parity matrix (client → server intent)`);
  lines.push("");
  lines.push(`| Client tag / event | Server target | Status |`);
  lines.push(`| --- | --- | --- |`);
  for (const row of r.parityMatrix) {
    lines.push(`| ${row.clientEventOrTag} | ${row.serverEquivalent} | ${row.status} |`);
  }
  lines.push("");
  lines.push(`## Frontend changes`);
  lines.push("");
  for (const step of r.frontendChangeSteps) {
    lines.push(`1. ${step}`);
  }
  lines.push("");
  lines.push(`## Manual actions`);
  lines.push("");
  for (const a of r.manualActions.slice(0, 40)) {
    lines.push(`- **${a.priority}:** ${a.reason}`);
  }
  lines.push("");
  return lines.join("\n");
}
