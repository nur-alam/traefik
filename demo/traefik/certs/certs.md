# SSL Certificate Setup for Local Development

This directory contains SSL certificates for local development using mkcert to create locally-trusted certificates.

## Current Setup (Local Development)

### Prerequisites
- Install mkcert: `brew install mkcert` (macOS) or follow [mkcert installation guide](https://github.com/FiloSottile/mkcert#installation)
- Install the local CA: `mkcert -install`

### Generate Certificates
```bash
# Navigate to the certs directory
cd Demosite/traefik/certs

# Generate certificates for your domains
mkcert node-app.localhost nginx.localhost localhost 127.0.0.1 ::1

# This creates:
# - node-app.localhost+4.pem (certificate)
# - node-app.localhost+4-key.pem (private key)
```

### Configuration
The certificates are automatically loaded by Traefik through the `dynamic.yml` configuration:

```yaml
tls:
  certificates:
    - certFile: /etc/traefik/certs/node-app.localhost+4.pem
      keyFile: /etc/traefik/certs/node-app.localhost+4-key.pem
```

### Adding New Domains
To add new localhost domains:

1. Regenerate the certificate with additional domains:
   ```bash
   mkcert node-app.localhost nginx.localhost your-new-app.localhost localhost 127.0.0.1 ::1
   ```

2. Update `dynamic.yml` if the certificate filename changes

3. Restart Traefik:
   ```bash
   docker-compose restart traefik
   ```

## Production Setup (Real SSL Certificates)

For production deployment, replace mkcert certificates with real SSL certificates from a Certificate Authority.

### Option 1: Let's Encrypt with Traefik (Recommended)

Update `traefik.yml` to use Let's Encrypt:

```yaml
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entrypoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: your-email@example.com
      storage: /etc/traefik/acme.json
      httpChallenge:
        entryPoint: web
      # Or use DNS challenge for wildcard certificates:
      # dnsChallenge:
      #   provider: cloudflare
      #   resolvers:
      #     - "1.1.1.1:53"
      #     - "8.8.8.8:53"

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: "traefik"
```

Update `docker-compose.yml` labels:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.node-app-secure.rule=Host(`your-domain.com`)"
  - "traefik.http.routers.node-app-secure.entrypoints=websecure"
  - "traefik.http.routers.node-app-secure.tls.certresolver=letsencrypt"
  - "traefik.http.services.node-app.loadbalancer.server.port=4000"
```

Add volume for ACME storage:
```yaml
volumes:
  - ./traefik/acme.json:/etc/traefik/acme.json
```

### Option 2: Manual Certificate Installation

1. Obtain SSL certificates from your CA (e.g., Cloudflare, DigiCert, etc.)

2. Place certificate files in this directory:
   - `your-domain.com.pem` (certificate)
   - `your-domain.com-key.pem` (private key)

3. Update `dynamic.yml`:
   ```yaml
   tls:
     certificates:
       - certFile: /etc/traefik/certs/your-domain.com.pem
         keyFile: /etc/traefik/certs/your-domain.com-key.pem
   ```

4. Update domain references in `docker-compose.yml` labels

### Security Notes

- **Never commit real SSL private keys to version control**
- Add `*.key` and `*.pem` to `.gitignore` for production certificates
- Use environment variables for sensitive configuration
- Ensure proper file permissions (600) for private keys
- Regularly renew certificates (Let's Encrypt auto-renews)

### Troubleshooting

**Certificate not trusted in browser:**
- Restart browser completely
- Clear browser cache
- Verify mkcert CA is installed: `mkcert -CAROOT`

**Certificate not loading:**
- Check Traefik logs: `docker-compose logs traefik`
- Verify certificate files exist and have correct permissions
- Ensure certificate includes all required domain names

**Adding new services:**
- Generate new certificates including the new domain
- Update Traefik configuration
- Restart Traefik container

## Debugging & Certificate Verification

When SSL certificates don't work properly, use these debugging commands to diagnose and fix issues:

### 1. Check Certificate Files Exist
```bash
# List certificate files in the directory
ls -la Demosite/traefik/certs/
# Should show .pem and -key.pem files

# Check file permissions (should be readable)
ls -la Demosite/traefik/certs/*.pem
```

### 2. Verify Certificate Content
```bash
# Check certificate details and validity
openssl x509 -in Demosite/traefik/certs/node-app.localhost+4.pem -text -noout

# Check certificate expiration date
openssl x509 -in Demosite/traefik/certs/node-app.localhost+4.pem -noout -dates

# Verify certificate includes your domain (Subject Alternative Names)
openssl x509 -in Demosite/traefik/certs/node-app.localhost+4.pem -noout -text | grep -A5 "Subject Alternative Name"
```

### 3. Test Certificate with OpenSSL
```bash
# Test SSL connection to your domain
openssl s_client -connect node-app.localhost:443 -servername node-app.localhost

# Check certificate chain and verify
openssl s_client -connect node-app.localhost:443 -servername node-app.localhost -verify_return_error

# Get certificate info from live connection
echo | openssl s_client -connect node-app.localhost:443 -servername node-app.localhost 2>/dev/null | openssl x509 -text -noout
```

### 4. Test with cURL
```bash
# Test HTTPS connection (should work without errors)
curl -I https://node-app.localhost

# Test with verbose output to see SSL handshake
curl -v https://node-app.localhost

# Force SSL verification (will fail if cert is invalid)
curl --cacert ~/.local/share/mkcert/rootCA.pem https://node-app.localhost

# Test ignoring SSL errors (for comparison)
curl -k -I https://node-app.localhost
```

### 5. Check Traefik Configuration
```bash
# View Traefik logs for SSL/TLS errors
docker-compose logs traefik | grep -i tls
docker-compose logs traefik | grep -i cert
docker-compose logs traefik | grep -i ssl

# Check all Traefik logs for errors
docker-compose logs traefik --tail=50

# Verify Traefik can read certificate files
docker exec demosite-traefik-1 ls -la /etc/traefik/certs/
docker exec demosite-traefik-1 cat /etc/traefik/dynamic.yml
```

### 6. Verify Docker Container Status
```bash
# Check if all containers are running
docker-compose ps

# Check Traefik container health
docker inspect demosite-traefik-1 | grep -A10 "Health"

# Restart Traefik if needed
docker-compose restart traefik
```

### 7. Check Traefik Dashboard
```bash
# Access Traefik dashboard (if enabled)
open http://localhost:8080

# Check routers and services via API
curl http://localhost:8080/api/http/routers
curl http://localhost:8080/api/http/services
```

### 8. Verify mkcert Installation
```bash
# Check if mkcert CA is installed
mkcert -CAROOT

# List installed CA certificates (macOS)
security find-certificate -a -c "mkcert" -p /System/Library/Keychains/SystemRootCertificates.keychain

# Reinstall mkcert CA if needed
mkcert -uninstall
mkcert -install
```

### 9. Browser-Specific Debugging
```bash
# Clear DNS cache (macOS)
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

# Test DNS resolution
nslookup node-app.localhost
dig node-app.localhost

# Check if domain resolves to localhost
ping node-app.localhost
```

### 10. Network Connectivity Tests
```bash
# Test if ports are accessible
telnet node-app.localhost 443
nc -zv node-app.localhost 443

# Check what's listening on SSL port
lsof -i :443
netstat -an | grep :443
```

### 11. Certificate Validation Chain
```bash
# Verify certificate chain is complete
openssl verify -CAfile $(mkcert -CAROOT)/rootCA.pem Demosite/traefik/certs/node-app.localhost+4.pem

# Check if certificate matches private key
openssl x509 -noout -modulus -in Demosite/traefik/certs/node-app.localhost+4.pem | openssl md5
openssl rsa -noout -modulus -in Demosite/traefik/certs/node-app.localhost+4-key.pem | openssl md5
# Both commands should output the same hash
```

### 12. Common Fix Commands
```bash
# Regenerate certificates with correct domains
cd Demosite/traefik/certs
rm -f *.pem
mkcert node-app.localhost nginx.localhost localhost 127.0.0.1 ::1

# Fix file permissions
chmod 644 Demosite/traefik/certs/*.pem

# Restart entire stack
docker-compose down && docker-compose up -d

# Force browser to reload certificates (clear cache)
# Chrome: chrome://settings/clearBrowserData
# Firefox: about:preferences#privacy
# Safari: Develop > Empty Caches
```

### 13. Production Certificate Debugging
```bash
# Check Let's Encrypt certificate status
docker exec demosite-traefik-1 cat /etc/traefik/acme.json | jq

# Test external domain SSL
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com

# Check certificate expiration for production
echo | openssl s_client -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates

# Verify certificate chain for production
curl -I https://yourdomain.com
```

### Debugging Checklist

When certificates don't work, check in this order:

1. ✅ Certificate files exist and are readable
2. ✅ Certificate contains correct domain names
3. ✅ Certificate is not expired
4. ✅ Traefik configuration points to correct certificate files
5. ✅ Traefik container is running and healthy
6. ✅ No errors in Traefik logs
7. ✅ mkcert CA is properly installed (for local dev)
8. ✅ Browser cache is cleared
9. ✅ DNS resolves correctly
10. ✅ Ports 80 and 443 are accessible

### Quick Fix Script
```bash
#!/bin/bash
# Quick certificate debugging and fix script

echo "🔍 Debugging SSL certificates..."

# Check certificate files
echo "📁 Checking certificate files..."
ls -la Demosite/traefik/certs/

# Check certificate validity
echo "📋 Checking certificate details..."
openssl x509 -in Demosite/traefik/certs/*.pem -text -noout | grep -E "(Subject:|Not After|DNS:)"

# Test connection
echo "🌐 Testing SSL connection..."
curl -I https://node-app.localhost 2>&1 | head -5

# Check Traefik logs
echo "📝 Checking Traefik logs..."
docker-compose logs traefik --tail=10 | grep -i error

echo "✅ Debugging complete. Check output above for issues."
```

Save this script as `debug-ssl.sh` and run with `bash debug-ssl.sh` for quick diagnostics.

// debuging & checking cert is works fine 