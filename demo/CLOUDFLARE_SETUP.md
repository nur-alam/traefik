# Cloudflare Wildcard SSL Setup Guide

## Step 1: Sign up for Cloudflare (Free)

1. Go to https://dash.cloudflare.com/sign-up
2. Create a free account
3. Verify your email

## Step 2: Add Your Domain to Cloudflare

1. Click "Add a Site" in Cloudflare dashboard
2. Enter: `wptriggermail.com`
3. Choose the **Free Plan**
4. Cloudflare will scan your DNS records

## Step 3: Review DNS Records

Cloudflare will import your existing DNS records from Hostinger.
- Make sure all important records are there (A, CNAME, MX, etc.)
- Add any missing records if needed

## Step 4: Change Nameservers at Hostinger

Cloudflare will give you **2 nameservers** like:
```
ava.ns.cloudflare.com
jay.ns.cloudflare.com
```

**Go to Hostinger:**
1. Login to Hostinger
2. Go to Domains → wptriggermail.com → DNS/Nameservers
3. Change nameservers to Cloudflare's nameservers
4. Save changes

**Wait 10-30 minutes** for nameserver propagation (can take up to 24 hours)

## Step 5: Get Cloudflare API Token

Once nameservers are active:

1. In Cloudflare, go to: **Profile (top right) → API Tokens**
2. Click **Create Token**
3. Use template: **Edit zone DNS**
4. Configure:
   - Permissions: `Zone` → `DNS` → `Edit`
   - Zone Resources: `Include` → `Specific zone` → `wptriggermail.com`
5. Click **Continue to summary**
6. Click **Create Token**
7. **Copy the token** (you won't see it again!)

Example token format: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## Step 6: Configure Traefik

**IMPORTANT: Keep your API token safe! You'll need it in the next step.**

Once you have the token, run:
```bash
nano /home/traefik/demo/.env
```

Add this line:
```
CF_API_TOKEN=your_cloudflare_api_token_here
```

Save and exit (Ctrl+X, Y, Enter)

Then tell me you're ready, and I'll update the Traefik configuration!

## Benefits of Cloudflare

✅ Free wildcard SSL (`*.wptriggermail.com`)
✅ Automatic SSL renewal (no manual work)
✅ Better DNS management
✅ Free CDN & DDoS protection
✅ Better performance

## Verification

Check if nameservers changed:
```bash
dig NS wptriggermail.com +short
```

Should show Cloudflare nameservers (after propagation).
