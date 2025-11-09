# SSL/TLS Configuration Guide

This document explains how SSL/TLS certificates are automatically managed for the main domain and dynamically created subdomains.

## Overview

The setup uses **Traefik** as a reverse proxy with automatic **Let's Encrypt** SSL certificate generation using the HTTP-01 challenge method.

## Architecture

```
Internet → Traefik (Port 443) → Backend Services
                ↓
         Let's Encrypt ACME
```

## Components

### 1. Traefik Configuration (`traefik/traefik.yml`)

```yaml
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: nuralam862@gmail.com
      storage: /etc/traefik/acme.json
      httpChallenge:
        entryPoint: web
```

**What this does:**
- Redirects all HTTP (port 80) traffic to HTTPS (port 443)
- Configures Let's Encrypt certificate resolver named `letsencrypt`
- Uses HTTP-01 challenge (requires port 80 accessible from internet)
- Stores certificates in `/etc/traefik/acme.json`

### 2. Certificate Storage (`traefik/acme.json`)

- **File permissions:** `600` (required by Traefik for security)
- **Location:** `/home/traefik/demo/traefik/acme.json`
- **Format:** JSON containing all issued certificates and account info

**Important:** This file must exist with proper permissions:
```bash
touch traefik/acme.json
chmod 600 traefik/acme.json
```

## How SSL Works

### Main Domain (wptriggermail.com)

**Configuration in `docker-compose.yml`:**
```yaml
services:
  node-app:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.node-app-secure.rule=Host(`wptriggermail.com`) || Host(`www.wptriggermail.com`) || HostRegexp(`{subdomain:[a-z0-9]+}.wptriggermail.com`)"
      - "traefik.http.routers.node-app-secure.entrypoints=websecure"
      - "traefik.http.routers.node-app-secure.tls.certresolver=letsencrypt"
```

**Process:**
1. Request comes to `https://wptriggermail.com`
2. Traefik checks if certificate exists in `acme.json`
3. If not, Traefik initiates ACME challenge:
   - Let's Encrypt sends challenge token
   - Traefik serves token on `http://wptriggermail.com/.well-known/acme-challenge/`
   - Let's Encrypt validates the token
   - Certificate is issued and stored
4. Certificate is served for HTTPS connections

**First certificate request:** ~10-30 seconds
**Subsequent requests:** Instant (cached in acme.json)

### Dynamic Subdomains (e.g., hphnyl.wptriggermail.com)

**Configuration in `server/src/index.js`:**
```javascript
const containerConfig = {
  Labels: {
    'traefik.enable': 'true',
    [`traefik.http.routers.${id}-secure.rule`]: `Host(\`${subdomain}\`)`,
    [`traefik.http.routers.${id}-secure.entrypoints`]: 'websecure',
    [`traefik.http.routers.${id}-secure.tls`]: 'true',
    [`traefik.http.routers.${id}-secure.tls.certresolver`]: 'letsencrypt',
    // ... other labels
  }
};
```

**Process:**
1. User creates a new site via API: `POST /create-site`
2. Node app creates WordPress container with unique subdomain (e.g., `hphnyl.wptriggermail.com`)
3. Traefik detects the new container via Docker provider
4. Traefik automatically requests Let's Encrypt certificate:
   - Let's Encrypt validates ownership via HTTP-01 challenge
   - Certificate issued for specific subdomain
   - Stored in `acme.json`
5. Subdomain is immediately accessible via HTTPS

**Time to SSL activation:** ~10-30 seconds after container creation

## Certificate Details

### Current Certificates

Check issued certificates:
```bash
cat traefik/acme.json | python3 -c "import sys, json; data=json.load(sys.stdin); print('\n'.join([cert.get('domain', {}).get('main', 'N/A') for cert in data.get('letsencrypt', {}).get('Certificates', [])]))"
```

Expected output:
```
wptriggermail.com
hphnyl.wptriggermail.com
qduauq.wptriggermail.com
```

### Certificate Properties

- **Issuer:** Let's Encrypt (R12)
- **Validity:** 90 days
- **Renewal:** Automatic (Traefik renews 30 days before expiry)
- **Type:** Domain Validated (DV)
- **Algorithm:** ECDSA or RSA 2048

### Verify SSL Certificate

```bash
# Check certificate
curl -vI https://wptriggermail.com/ 2>&1 | grep -E "(SSL|issuer|subject)"

# Expected output:
# * SSL connection using TLSv1.3 / TLS_AES_128_GCM_SHA256
# * Server certificate:
# *  subject: CN=wptriggermail.com
# *  issuer: C=US; O=Let's Encrypt; CN=R12
# *  SSL certificate verify ok.
```

## Troubleshooting

### Certificate Not Being Issued

**Problem:** Site returns self-signed certificate or error

**Solutions:**

1. **Check acme.json permissions:**
   ```bash
   ls -l traefik/acme.json
   # Should show: -rw------- (600)
   chmod 600 traefik/acme.json
   ```

2. **Verify port 80 is accessible:**
   ```bash
   curl -I http://wptriggermail.com/.well-known/acme-challenge/test
   # Should return 404, not connection error
   ```

3. **Check Traefik logs:**
   ```bash
   docker logs demo-traefik-1 | grep -i "acme\|certificate"
   ```

4. **Verify DNS is resolving:**
   ```bash
   dig +short wptriggermail.com
   dig +short hphnyl.wptriggermail.com
   # Should return server IP
   ```

5. **Check router configuration:**
   ```bash
   curl -s http://localhost:8080/api/http/routers | python3 -m json.tool | grep certresolver
   # Should show: "letsencrypt"
   ```

### Rate Limits

Let's Encrypt has rate limits:
- **50 certificates** per registered domain per week
- **5 duplicate certificates** per week

**If rate limited:**
- Wait 7 days, or
- Use Let's Encrypt staging environment (for testing)

### Certificate Renewal Issues

Traefik automatically renews certificates 30 days before expiry.

**Manual renewal:**
```bash
# Remove certificate from acme.json (Traefik will re-request)
# Backup first!
cp traefik/acme.json traefik/acme.json.bak

# Restart Traefik
docker restart demo-traefik-1
```

## DNS Requirements

### Main Domain
- **A Record:** `wptriggermail.com` → Server IP
- **A Record:** `www.wptriggermail.com` → Server IP (optional)

### Wildcard Subdomains
- **A Record:** `*.wptriggermail.com` → Server IP

**Example DNS configuration:**
```
Type    Name                    Value
A       wptriggermail.com       YOUR_SERVER_IP
A       *.wptriggermail.com     YOUR_SERVER_IP
```

## Security Considerations

1. **acme.json permissions:** Must be 600 (owner read/write only)
2. **Email address:** Used for Let's Encrypt notifications
3. **HTTP-01 challenge:** Port 80 must be publicly accessible
4. **Certificate storage:** Backup `acme.json` regularly
5. **Container security:** Only trusted images should have Traefik labels

## Alternative: DNS Challenge (For Wildcard Certificates)

HTTP-01 challenge issues individual certificates per subdomain. For wildcard certificates (`*.wptriggermail.com`), DNS challenge is required.

**Note:** Your DNS provider (Hostinger) doesn't have native Traefik support. Consider:
- Cloudflare (free, API supported)
- Route53 (AWS)
- Other supported providers

### Cloudflare DNS Challenge Example

```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: nuralam862@gmail.com
      storage: /etc/traefik/acme.json
      dnsChallenge:
        provider: cloudflare
        delayBeforeCheck: 0
```

**Environment variables needed:**
```yaml
environment:
  - CF_API_EMAIL=your@email.com
  - CF_API_KEY=your_cloudflare_api_key
```

## Monitoring

### Check Certificate Expiry

```bash
echo | openssl s_client -servername wptriggermail.com -connect wptriggermail.com:443 2>/dev/null | openssl x509 -noout -dates
```

### View All Certificates

```bash
cat traefik/acme.json | python3 -m json.tool | grep -A10 "Certificates"
```

## Summary

- ✅ **Automatic:** Certificates issued automatically for new services
- ✅ **Free:** Let's Encrypt provides free SSL certificates
- ✅ **Secure:** TLS 1.2+ with modern cipher suites
- ✅ **Auto-renewal:** Certificates renewed automatically
- ✅ **Scalable:** Each subdomain gets its own certificate
- ⚠️ **HTTP-01 limitation:** Individual certs per subdomain (not wildcard)

## Files Reference

```
/home/traefik/demo/
├── traefik/
│   ├── traefik.yml           # Main Traefik config
│   ├── dynamic.yml           # Dynamic routing config
│   └── acme.json            # Certificate storage (600 permissions)
├── docker-compose.yml        # Service definitions
└── server/src/index.js      # Dynamic subdomain creation logic
```

## Support

For issues:
1. Check Traefik logs: `docker logs demo-traefik-1`
2. Verify DNS: `dig +short subdomain.wptriggermail.com`
3. Test HTTP challenge: `curl http://domain/.well-known/acme-challenge/`
4. Validate router config: `http://localhost:8080/dashboard/`
