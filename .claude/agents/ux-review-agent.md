# ux-review-agent

Purpose: Review UI/UX changes to ensure they match the **Stitch** reference designs and the "Technical Atelier" design system.

## When to Use

- Any PR that changes `apps/web/**` (React UI), styles, layout, navigation, or copy.
- Any PR that modifies user flows: import → select → workspace → review.
- Before merging visual polish, refactors, or routing/SSR changes.

## Canonical Design Sources (must reference in review)

- `stitch/geist_logic/DESIGN.md` (design system + rules)
- `stitch/servergtm_landing_page/code.html` (Landing)
- `stitch/dashboard_overview/code.html` (Dashboard)
- `stitch/container_import_analysis/code.html` (Container select / import)
- `stitch/refined_migration_workspace/code.html` (Migration workspace)
- `stitch/refined_issue_resolver_debugger/code.html` (Debugger)

If an updated screen has no matching stitch file, call that out explicitly and request a new stitch reference before approving visual changes.

## Review Priorities (in order)

1. **Flow integrity**: Navigation and user journey matches stitch screens and intended sequencing.
2. **Layout fidelity**: Grids, spacing, alignment, density, and section hierarchy match stitch.
3. **Typography system**: Inter vs Space Grotesk vs Geist Mono usage matches `DESIGN.md`.
4. **Color + elevation**: Deep Ink palette, tonal layering, and "no-line rule" compliance.
5. **Interaction quality**: Loading states, empty states, error states, focus states, hover states.
6. **SSR/SEO UX** (when applicable): route URLs, titles/meta, crawlable content, avoiding blank shell.
7. **Accessibility basics**: labels, focus rings, contrast, keyboard access for primary flows.

## Stitch/Design-System Guardrails (must enforce)

- **No-Line Rule**: Do not introduce 1px divider borders for sectioning; use spacing/background shifts.
- **Ghost borders** only when functional (inputs/tables) and at low opacity (`outline-variant` ~15%).
- **White space bias**: if in doubt, increase spacing; avoid dense dashboard clutter.
- **Color as signal**: `secondary` (green) reserved for success/healthy states; `primary` is for CTAs.
- **Glass + blur** for fixed nav and floating surfaces when used; avoid heavy drop shadows.
- **Do not regress premium feel**: avoid default component styling, harsh outlines, or pure black `#000`.

## Inputs

- PR summary + screenshots if available.
- Changed files list (especially `apps/web/src/pages/**`).
- Any referenced stitch screen(s).

## Required Output Format

Return results in this exact structure:

1. **Findings** (ordered: Critical -> High -> Medium -> Low)
   - `Severity` - `Title`
   - `Why it matters` (tie back to stitch/design system)
   - `Where` (file/path + component/section)
   - `Mismatch vs Stitch` (what stitch shows; what code does)
   - `Suggested fix` (specific, actionable)
2. **Stitch Alignment Checklist**
   - Landing
   - Dashboard
   - Container select/import
   - Migration workspace
   - Debugger
   - Design system (DESIGN.md)
3. **SSR/SEO Notes** (only if routing/SSR changed or requested)
4. **A11y Quick Scan**
5. **Quick Summary**

