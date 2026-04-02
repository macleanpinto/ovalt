# Design System Strategy: Technical Sophistication

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Technical Atelier."** 

In the world of B2B SaaS—specifically server-side tracking—complexity is the enemy. This system rejects the cluttered, "dashboard-heavy" tropes of the analytics industry. Instead, it treats data infrastructure with the reverence of a high-end editorial publication. We move beyond the "template" look by utilizing extreme white space, asymmetric hero layouts, and a "Deep Ink" palette that feels authoritative yet breathable. The goal is to make the transition from client-side to server-side GTM feel like moving from a chaotic workshop to a precision-engineered laboratory.

## 2. Colors
Our palette is rooted in deep neutrals with high-chroma accents that signal action and technical health.

*   **Surface Foundation:** The `background` (`#131313`) is our canvas. It is not a flat black, but a deep charcoal that allows for tonal layering.
*   **The "No-Line" Rule:** To maintain a premium feel, **1px solid borders are prohibited for sectioning.** Do not use lines to separate the hero from a feature grid. Instead, use a background shift—place a `surface-container-low` section against the `background` to create an edge.
*   **Surface Hierarchy & Nesting:** Use tiers to define importance. A main data card might be `surface-container`, while a nested code snippet or "copy to clipboard" area sits on `surface-container-highest`. This "stacked sheet" approach creates architectural depth without visual noise.
*   **The "Glass & Gradient" Rule:** For floating modals or "success" popovers, use `surface` colors at 70% opacity with a `24px` backdrop blur. 
*   **Signature Textures:** Use subtle radial gradients (e.g., `primary` transitioning to `primary-container`) to give CTAs a "glow" that feels like high-end hardware interfaces.

## 3. Typography
The typographic soul of this system is the interplay between the utilitarian and the elegant.

*   **Display & Headline (Inter):** We use **Inter** for all primary messaging. For `display-lg` and `headline-lg`, we use tight letter-spacing (-0.02em) to create a bold, "locked-in" editorial look.
*   **Body (Inter):** `body-md` is our workhorse. We prioritize generous line heights (1.6) to ensure technical documentation remains readable and approachable.
*   **Labels & Monospaced Accents (Space Grotesk / Geist Mono):** For metadata, server logs, and GTM container IDs, we utilize `label-md` (Space Grotesk) or Geist Mono. This provides a "technical fingerprint" that balances the softer, more humanistic Inter.
*   **Hierarchy Note:** Use high contrast in scale. A `display-lg` headline should often be paired with a much smaller `body-lg` intro to create an intentional, sophisticated "staggered" layout.

## 4. Elevation & Depth
In "The Technical Atelier," we do not use drop shadows to mimic height; we use light and tone to mimic presence.

*   **The Layering Principle:** Depth is a product of tonal contrast. 
    *   *Level 0:* `surface-container-lowest` (The base)
    *   *Level 1:* `surface-container` (Primary content cards)
    *   *Level 2:* `surface-container-highest` (Interactive hover states or active elements)
*   **Ambient Shadows:** If a card must float (such as a dropdown menu), use a shadow color derived from `on-surface` at 4% opacity with a 32px blur. It should look like a soft atmospheric occlusion, not a dark smudge.
*   **The "Ghost Border" Fallback:** For input fields or data tables where containment is functional, use the `outline-variant` at 15% opacity. This creates a "suggestion" of a boundary that disappears into the background.
*   **Glassmorphism:** Apply to navigation bars. A fixed top nav should use a `surface` color with 80% opacity and a heavy blur, allowing hero gradients to bleed through as the user scrolls.

## 5. Components

### Buttons
*   **Primary:** `primary` background with `on-primary` text. Use `xl` (0.75rem) roundedness. No borders.
*   **Secondary:** `surface-container-highest` background. Subtle glow on hover using a 10% opacity `primary` shadow.
*   **Tertiary:** Ghost style. No background; text only in `primary`.

### Data-Focused UI
*   **The "Log" Card:** For showing server hits. Use `surface-container-low`, Geist Mono typography, and `secondary` (green) accents for "200 OK" status.
*   **Feature Grids:** Forbid dividers. Use a 4-column grid with `16` (5.5rem) spacing. Each feature should sit in a `surface-container` card with `lg` corner radius.

### Input Fields
*   **Visual State:** Background `surface-container-highest`, no border.
*   **Focus State:** A 1px "Ghost Border" using `primary` at 40% opacity. Label uses `label-sm` (Space Grotesk) positioned above the field for clarity.

### Hero Sections
*   **Layout:** Use asymmetric layouts. Large `display-md` text on the left, with a "floating" server architecture visualization on the right using layered `surface` containers and glassmorphism.

## 6. Do’s and Don'ts

### Do
*   **Use Asymmetry:** Place your primary CTA slightly off-center to create a dynamic, modern feel.
*   **Embrace White Space:** If you think there is enough space, add `2.75rem` (spacing-8) more.
*   **Color as Signal:** Reserve `secondary` (`#5fde8f`) exclusively for successful server connections. Use `primary` (`#ffb4a7`) for core user flow actions.

### Don't
*   **Don't Use Dividers:** Never use a line when a `3.5rem` (spacing-10) gap or a background shift can do the job.
*   **Don't Use Pure Black:** Avoid `#000000`. It feels "default." Use `surface-container-lowest` (`#0e0e0e`) for the deepest blacks.
*   **Don't Over-Corner:** While we use `xl` for buttons, keep container radiuses at `lg` or `md`. Too much rounding makes a technical tool feel "toy-like."