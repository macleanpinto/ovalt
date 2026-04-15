# Server Trigger Logic - Blocking Triggers Explained

## Overview

When deploying consolidated server tags, Tag Relay creates an "All Events" trigger that fires on all incoming requests, plus optional **blocking triggers** to prevent cross-vendor firing.

## Single Vendor Deployment (e.g., Only GA4)

**Trigger Configuration:**
```
Firing Trigger: All Events
Exceptions (Blocking): None
```

**Behavior:**
- Server tag fires on **all incoming events**
- No blocking needed since all events should go to the same vendor
- This is the **correct and expected** configuration

**Example:**
If you only have GA4 tags, the GA4 server tag should fire for all events.

## Multiple Vendor Deployment (e.g., GA4 + Google Ads)

**GA4 Server Tag:**
```
Firing Trigger: All Events
Exceptions (Blocking):
  - Client Name Contains "Google Ads"
```

**Google Ads Server Tag:**
```
Firing Trigger: All Events  
Exceptions (Blocking):
  - Client Name Contains "GA4"
```

**Behavior:**
- Both tags start to fire on all events
- Blocking triggers prevent them from firing on wrong vendor's events
- GA4 tag fires ONLY when Client Name is NOT "Google Ads"
- Google Ads tag fires ONLY when Client Name is NOT "GA4"

## Why This Works

GTM's server-side container sets the `{{Client Name}}` built-in variable based on which client sent the request:
- GA4 client → `Client Name = "GA4"`
- Google Ads client → `Client Name = "Google Ads"`
- Meta Pixel client → `Client Name = "Facebook"`

By using blocking triggers that check `Client Name`, we ensure each server tag only processes events from its corresponding client.

## Vendor Patterns

| Vendor | Client Name Pattern | Used in Blocking |
|--------|-------------------|------------------|
| GA4 | "GA4" | Block when contains "GA4" |
| Google Ads | "Google Ads" | Block when contains "Google Ads" |
| Meta Pixel | "Facebook" | Block when contains "Facebook" |

## Deployment Examples

### Example 1: Single Vendor (GA4 Only)
**Result:**
- 1 server tag: "GA4 - All Events (Server)"
- 0 blocking triggers created
- GA4 tag fires on all events ✅

### Example 2: Two Vendors (GA4 + Google Ads)
**Result:**
- 2 server tags: "GA4 - All Events (Server)" + "Google Ads - All Events (Server)"
- 2 blocking triggers created:
  - "Client Name Contains Google Ads"
  - "Client Name Contains GA4"
- GA4 tag blocked from Google Ads events ✅
- Google Ads tag blocked from GA4 events ✅

### Example 3: Three Vendors (GA4 + Google Ads + Meta)
**Result:**
- 3 server tags created
- 6 blocking triggers created (each tag blocks 2 other vendors)
- GA4 tag blocks: Google Ads, Facebook
- Google Ads tag blocks: GA4, Facebook  
- Meta tag blocks: GA4, Google Ads

## Verification

To verify blocking triggers are working:

1. Open GTM server workspace
2. Click on a server tag
3. Check "Exceptions" section:
   - **Single vendor:** Should be empty (correct)
   - **Multiple vendors:** Should list blocking triggers for other vendors

## Summary

**Blocking triggers are ONLY needed for multi-vendor deployments.**

If you see no exceptions on a server trigger and you only have one vendor type (e.g., GA4), this is **correct behavior** - not a bug!
