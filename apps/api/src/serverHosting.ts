/**
 * Provider-specific SGTM hosting guidance. Copy is oriented toward minimal user effort:
 * deep links to official docs, ordered checklist, and what Tag Relay needs from them.
 */

export const HOSTING_PROVIDERS = ["stape", "taggrs", "google_cloud", "other", "undecided"] as const;
export type HostingProvider = (typeof HOSTING_PROVIDERS)[number];

export type HostingGuideStep = {
  id: string;
  title: string;
  detail: string;
  action?: { label: string; href: string };
};

export type HostingGuide = {
  provider: HostingProvider;
  headline: string;
  subline: string;
  steps: HostingGuideStep[];
  referenceLinks: { label: string; href: string }[];
  /** Values Tag Relay will use in blueprints once you save them below */
  fieldsToCollect: { key: string; label: string; placeholder: string }[];
};

export function hostingGuideFor(provider: HostingProvider, ctx: { webContainerLabel?: string }): HostingGuide {
  const label = ctx.webContainerLabel?.trim() || "your web GTM container";

  const commonFields = [
    {
      key: "serverContainerPublicId",
      label: "Server container ID",
      placeholder: "GTM-XXXXXXX (from tagmanager.google.com → server container)"
    },
    {
      key: "serverTaggingUrl",
      label: "Tagging server URL",
      placeholder: "https://gtm.yourdomain.com or https://xxxx.stape.io"
    }
  ] as const;

  if (provider === "stape") {
    return {
      provider,
      headline: "Stape + Google Tag Manager server container",
      subline:
        "Use this if you switch from client-owned Google Cloud hosting. Stape runs the sGTM runtime for you; you still own the GTM server container in Google. Tag Relay needs your container ID and tagging URL once Stape is live.",
      steps: [
        {
          id: "gtm-server-container",
          title: "Create a server container in Google Tag Manager",
          detail:
            "In tagmanager.google.com, create a new container with type “Server”. Name it similarly to your web container for clarity.",
          action: {
            label: "Open GTM",
            href: "https://tagmanager.google.com/"
          }
        },
        {
          id: "stape-create",
          title: "Create the container in Stape",
          detail:
            "In Stape, paste the container configuration from GTM (Admin → Container settings → “Manually install” / config snippet), pick a region, and deploy until status is Running.",
          action: {
            label: "Stape: create server container",
            href: "https://stape.io/helpdesk/documentation/create-server-container-in-stape"
          }
        },
        {
          id: "domain",
          title: "Note your tagging URL",
          detail:
            "From Stape, copy your tagging server URL (custom domain or Stape subdomain). You will point " +
            label +
            " tags at this URL (e.g. GA4 Google tag → transport_url).",
          action: {
            label: "Find server container URL",
            href: "https://stape.io/helpdesk/documentation/find-server-container-url"
          }
        },
        {
          id: "relay",
          title: "Save IDs in Tag Relay",
          detail:
            "Paste the server GTM container public ID and tagging URL below. We use them in migration output and checklists so you do not re-enter them later."
        }
      ],
      referenceLinks: [
        { label: "Stape GTM server hosting", href: "https://stape.io/gtm-server-hosting/create" },
        { label: "Google: send data to server GTM", href: "https://developers.google.com/tag-platform/tag-manager/server-side/send-data" }
      ],
      fieldsToCollect: [...commonFields]
    };
  }

  if (provider === "taggrs") {
    return {
      provider,
      headline: "TAGGRS + Google Tag Manager server container",
      subline:
        "Use this if you switch from client-owned GCP. TAGGRS hosts sGTM (often with Google sign-in). Save your server container ID and tagging URL here so Tag Relay stays aligned with your live endpoint.",
      steps: [
        {
          id: "taggrs-project",
          title: "Create a TAGGRS project",
          detail:
            "Sign in at TAGGRS and start server GTM hosting. Prefer the Google-assisted flow if offered so the server container is created and linked with less manual copying.",
          action: {
            label: "TAGGRS server-side setup",
            href: "https://www.taggrs-docs.com/server-side-tracking/setup/gtm-server-hosting"
          }
        },
        {
          id: "gtm-ids",
          title: "Copy container ID and tagging URL",
          detail:
            "From Google Tag Manager (server container) and TAGGRS, copy the public container ID (GTM-…) and the URL clients will use as transport_url."
        },
        {
          id: "web-container",
          title: "Point " + label + " at the server URL",
          detail:
            "In your web container, configure tags that support server-side forwarding (e.g. GA4) to use your TAGGRS tagging URL. Publish when ready."
        },
        {
          id: "relay",
          title: "Save in Tag Relay",
          detail: "Paste the server container ID and tagging URL below so migration steps reference the correct endpoint."
        }
      ],
      referenceLinks: [
        { label: "TAGGRS docs (server GTM)", href: "https://www.taggrs-docs.com/server-side-tracking/setup/gtm-server-hosting" },
        { label: "Google: send data to server GTM", href: "https://developers.google.com/tag-platform/tag-manager/server-side/send-data" }
      ],
      fieldsToCollect: [...commonFields]
    };
  }

  if (provider === "google_cloud") {
    return {
      provider,
      headline: "Default: your Google Cloud + your GTM (OAuth)",
      subline:
        "All infrastructure stays in the client’s Google accounts. Tag Relay uses Google OAuth to list GCP projects and to create the server GTM container in the same account as your web container. You (or your client) still deploy the tagging server to Cloud Run in your GCP project using Google’s manual — we remove duplicate typing by persisting IDs here.",
      steps: [
        {
          id: "oauth",
          title: "Connect Google with Tag Relay (already done if you imported a container)",
          detail:
            "One consent covers Tag Manager read, creating server containers, and listing GCP projects (cloudplatformprojects.readonly). Everything runs under the signed-in user’s permissions — no Tag Relay–owned hosting."
        },
        {
          id: "create-gtm-server",
          title: "Create the server container in GTM via Tag Relay",
          detail:
            "Use “Create server GTM container” in the workspace. That calls Google’s API with your OAuth token and writes the new GTM-XXXX ID onto this import.",
          action: {
            label: "Tag Manager API: containers",
            href: "https://developers.google.com/tag-platform/tag-manager/api/v2/reference/accounts/containers/create"
          }
        },
        {
          id: "pick-project",
          title: "Choose a GCP project for the tagging server",
          detail:
            "Pick one of the projects from the OAuth-powered list (or your org’s standard project). Billing and Cloud Run live entirely in that client-owned project."
        },
        {
          id: "google-manual",
          title: "Deploy sGTM to Cloud Run in that project",
          detail:
            "Follow Google’s manual setup: provision Cloud Run (or supported runtime) with the server container config from GTM, then map your domain / TLS.",
          action: {
            label: "Google: manual server container setup",
            href: "https://developers.google.com/tag-platform/tag-manager/server-side/manual-setup-guide"
          }
        },
        {
          id: "relay",
          title: "Paste your public tagging URL",
          detail:
            "After Cloud Run is serving HTTPS, save the tagging server URL below (container ID is filled when you create the server container via OAuth)."
        }
      ],
      referenceLinks: [
        { label: "Server-side GTM overview", href: "https://developers.google.com/tag-platform/tag-manager/server-side" },
        { label: "Send data to server GTM", href: "https://developers.google.com/tag-platform/tag-manager/server-side/send-data" }
      ],
      fieldsToCollect: [...commonFields]
    };
  }

  if (provider === "other") {
    return {
      provider,
      headline: "Another host or custom stack",
      subline:
        "Use your vendor’s documentation to deploy sGTM. Tag Relay still needs your server GTM container ID and the tagging URL your site will call.",
      steps: [
        {
          id: "vendor",
          title: "Finish hosting setup with your provider",
          detail: "Complete DNS, TLS, and GTM server container configuration per their guide."
        },
        {
          id: "relay",
          title: "Save container ID and URL in Tag Relay",
          detail: "Paste the values below so exports and run reports stay aligned with your environment."
        }
      ],
      referenceLinks: [
        { label: "Google: send data to server GTM", href: "https://developers.google.com/tag-platform/tag-manager/server-side/send-data" }
      ],
      fieldsToCollect: [...commonFields]
    };
  }

  return {
    provider: "undecided",
    headline: "Choose where the tagging server runs",
    subline:
      "Default path is client-owned Google Cloud + OAuth (create server container and list GCP projects). Switch to Stape or TAGGRS below if a managed host should run sGTM instead.",
    steps: [
      {
        id: "pick",
        title: "Select Google Cloud (default) or a managed host",
        detail:
          "Google Cloud keeps compute and billing in the client’s GCP project. Stape and TAGGRS replace the Cloud Run step with their hosting while you still own GTM."
      }
    ],
    referenceLinks: [
      { label: "Google manual (Cloud Run)", href: "https://developers.google.com/tag-platform/tag-manager/server-side/manual-setup-guide" },
      { label: "Stape documentation", href: "https://stape.io/helpdesk/documentation/create-server-container-in-stape" },
      { label: "TAGGRS server GTM", href: "https://www.taggrs-docs.com/server-side-tracking/setup/gtm-server-hosting" }
    ],
    fieldsToCollect: [...commonFields]
  };
}

export function normalizeHostingProvider(raw: unknown): HostingProvider {
  if (typeof raw !== "string") return "undecided";
  const v = raw.toLowerCase().trim();
  if (v === "tagger" || v === "taggers") return "taggrs";
  if ((HOSTING_PROVIDERS as readonly string[]).includes(v)) return v as HostingProvider;
  return "undecided";
}
