# OAuth Configuration Guide

Tag Relay requires **TWO separate Google OAuth clients** plus one GitHub OAuth app.

## Why Two Google OAuth Clients?

1. **User Login OAuth** - Minimal scopes (email, profile)
2. **GTM Access OAuth** - Requires broad cloud-platform scope for:
   - Tag Manager API access
   - Deploying server containers to Cloud Run
   - Managing GCP resources

**Security Best Practice:** Keep user login OAuth with minimal scopes. Only the GTM-specific flow gets elevated cloud permissions.

---

## Google OAuth Client #1: User Login

### 1. Create OAuth Client

1. Go to [Google Cloud Console → APIs & Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name: `Tag Relay - User Login`

### 2. Configure Redirect URI

**For Production:**
```
https://YOUR-API-GATEWAY-URL.execute-api.REGION.amazonaws.com/auth/oauth/google/callback
```

**For Local Development:**
```
http://localhost:3001/auth/oauth/google/callback
```

### 3. Scopes

OAuth consent screen should request:
- `email`
- `profile`
- `openid`

These are basic Google Sign-In scopes.

### 4. Save Credentials

Copy:
- **Client ID** (e.g., `123456-abc.apps.googleusercontent.com`)
- **Client Secret** (e.g., `GOCSPX-xyz123`)

---

## Google OAuth Client #2: GTM Access

### 1. Create Second OAuth Client

1. Same project: [Google Cloud Console → APIs & Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name: `Tag Relay - GTM Access`

### 2. Configure Redirect URI

**For Production:**
```
https://YOUR-API-GATEWAY-URL.execute-api.REGION.amazonaws.com/gtm/oauth/callback
```

**For Local Development:**
```
http://localhost:3001/gtm/oauth/callback
```

### 3. Enable Required APIs

In the same GCP project, enable:

1. **Tag Manager API**
   - Go to: [APIs & Services → Library](https://console.cloud.google.com/apis/library)
   - Search: "Tag Manager API"
   - Click **Enable**

2. **Cloud Resource Manager API**
   - Search: "Cloud Resource Manager API"
   - Click **Enable**

### 4. Configure OAuth Consent Screen

1. Go to [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Add scopes:
   - `https://www.googleapis.com/auth/tagmanager.edit.containers`
   - `https://www.googleapis.com/auth/cloud-platform`

⚠️ **Warning:** `cloud-platform` is a sensitive scope. This is why we use a separate OAuth client!

### 5. Save Credentials

Copy:
- **Client ID** (different from login client)
- **Client Secret** (different from login client)

---

## GitHub OAuth: User Login

### 1. Create OAuth App

1. Go to [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Application name: `Tag Relay`
4. Homepage URL:
   - Production: `https://YOUR-WEB-URL.lambda-url.REGION.on.aws`
   - Local: `http://localhost:5173`

### 2. Configure Callback URL

**For Production:**
```
https://YOUR-API-GATEWAY-URL.execute-api.REGION.amazonaws.com/auth/oauth/github/callback
```

**For Local Development:**
```
http://localhost:3001/auth/oauth/github/callback
```

### 3. Save Credentials

After creating:
1. Copy **Client ID**
2. Click **Generate a new client secret**
3. Copy **Client Secret**

---

## Summary: What You Need

### For Production Secrets

```bash
# Google OAuth #1 (Login)
GOOGLE_OAUTH_CLIENT_ID=123456-login.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-login-secret
GOOGLE_OAUTH_REDIRECT_URI=https://YOUR-API-URL/auth/oauth/google/callback

# Google OAuth #2 (GTM)
GTM_OAUTH_CLIENT_ID=789012-gtm.apps.googleusercontent.com
GTM_OAUTH_CLIENT_SECRET=GOCSPX-gtm-secret
GTM_OAUTH_REDIRECT_URI=https://YOUR-API-URL/gtm/oauth/callback

# GitHub OAuth
GITHUB_OAUTH_CLIENT_ID=Iv1.abc123def456
GITHUB_OAUTH_CLIENT_SECRET=ghp_xyz789abc123def456
GITHUB_OAUTH_REDIRECT_URI=https://YOUR-API-URL/auth/oauth/github/callback
```

### Setup Script

Run the setup script and provide all credentials:

```bash
./scripts/setup-secrets.sh production tagrelay-prod eu-north-1
```

The script will prompt for:
1. Google OAuth #1 (Login) - Client ID & Secret
2. Google OAuth #2 (GTM) - Client ID & Secret
3. GitHub OAuth - Client ID & Secret
4. API Gateway URL

---

## Verification

### Test Login Flow

1. Visit your web app
2. Click "Sign in with Google"
3. Should redirect to Google login
4. After auth, should redirect back to app

### Test GTM Flow

1. Sign in to app
2. Go to "Import Container" or "Connect GTM"
3. Click "Authorize GTM Access"
4. Should prompt for Google OAuth with broader scopes
5. Should see list of GTM accounts/containers

### Common Issues

**Error: `redirect_uri_mismatch`**
- Check that redirect URI in OAuth app matches exactly
- Include `https://`, correct domain, and full path
- Production must use API Gateway URL, not Lambda URL

**Error: `access_denied` or scope errors**
- GTM OAuth client needs Tag Manager API enabled
- OAuth consent screen needs correct scopes
- User must accept requested permissions

**GTM OAuth not prompting**
- Check `GTM_OAUTH_CLIENT_ID` is set in secrets
- Verify it's different from `GOOGLE_OAUTH_CLIENT_ID`
- Server logs should show which client is being used

---

## Security Notes

1. **Never commit OAuth secrets to Git**
2. **Rotate secrets if exposed**
3. **Use AWS Secrets Manager for production**
4. **Separate OAuth clients = better security isolation**
5. **Minimal scopes for user login = reduced risk**

---

## Architecture

```
User Login Flow:
  User → Web App → API → Google OAuth #1 → User Profile
  (Scopes: email, profile, openid)

GTM Access Flow:
  User → Web App → API → Google OAuth #2 → GTM API + Cloud Run
  (Scopes: tagmanager.edit.containers, cloud-platform)
```

Both flows use the same user email, but different OAuth clients with different permissions.

---

For deployment, see [DEPLOY_NO_DOMAIN.md](../DEPLOY_NO_DOMAIN.md)
