#!/bin/bash

# SSL Setup Script for Dynamic WordPress Sites
# This script helps manage SSL certificates for the demo site system

set -e

CERTS_DIR="./traefik/certs"
DOMAIN_SUFFIX="tutor.localhost"

echo "🔒 SSL Setup for Dynamic WordPress Sites"
echo "========================================"

# Function to generate wildcard certificate
generate_wildcard_cert() {
    echo "📜 Generating wildcard certificate for *.${DOMAIN_SUFFIX}..."
    
    cd "$CERTS_DIR"
    
    # Remove old certificates
    rm -f *.pem
    
    # Generate new wildcard certificate
    mkcert "*.${DOMAIN_SUFFIX}" "${DOMAIN_SUFFIX}" node-app.localhost nginx.localhost localhost 127.0.0.1 ::1
    
    echo "✅ Certificate generated successfully!"
    
    # List generated files
    echo "📁 Generated certificate files:"
    ls -la *.pem
    
    cd - > /dev/null
}

# Function to update dynamic.yml with new certificate
update_dynamic_config() {
    echo "⚙️ Updating Traefik dynamic configuration..."
    
    # Find the certificate file
    CERT_FILE=$(ls "$CERTS_DIR"/*.pem | grep -v key | head -1)
    KEY_FILE=$(ls "$CERTS_DIR"/*-key.pem | head -1)
    
    if [[ -z "$CERT_FILE" || -z "$KEY_FILE" ]]; then
        echo "❌ Certificate files not found!"
        exit 1
    fi
    
    CERT_BASENAME=$(basename "$CERT_FILE")
    KEY_BASENAME=$(basename "$KEY_FILE")
    
    echo "📝 Using certificate: $CERT_BASENAME"
    echo "🔑 Using key: $KEY_BASENAME"
    
    # Update dynamic.yml (this is a simple approach - in production you might want more sophisticated config management)
    echo "⚠️  Please manually update traefik/dynamic.yml with:"
    echo "   certFile: /etc/traefik/certs/$CERT_BASENAME"
    echo "   keyFile: /etc/traefik/certs/$KEY_BASENAME"
}

# Function to restart Traefik
restart_traefik() {
    echo "🔄 Restarting Traefik to load new certificates..."
    docker-compose restart traefik
    echo "✅ Traefik restarted!"
}

# Function to test SSL
test_ssl() {
    echo "🧪 Testing SSL configuration..."
    
    # Test main domain
    echo "Testing ${DOMAIN_SUFFIX}..."
    if curl -s -I "https://${DOMAIN_SUFFIX}" > /dev/null 2>&1; then
        echo "✅ SSL working for ${DOMAIN_SUFFIX}"
    else
        echo "❌ SSL not working for ${DOMAIN_SUFFIX}"
    fi
    
    # Test wildcard subdomain
    TEST_SUBDOMAIN="test123.${DOMAIN_SUFFIX}"
    echo "Testing wildcard: ${TEST_SUBDOMAIN}..."
    if curl -s -I "https://${TEST_SUBDOMAIN}" > /dev/null 2>&1; then
        echo "✅ Wildcard SSL working for ${TEST_SUBDOMAIN}"
    else
        echo "❌ Wildcard SSL not working for ${TEST_SUBDOMAIN}"
    fi
    
    # Test node-app
    echo "Testing node-app.localhost..."
    if curl -s -I "https://node-app.localhost" > /dev/null 2>&1; then
        echo "✅ SSL working for node-app.localhost"
    else
        echo "❌ SSL not working for node-app.localhost"
    fi
}

# Function to show certificate info
show_cert_info() {
    echo "📋 Certificate Information:"
    
    CERT_FILE=$(ls "$CERTS_DIR"/*.pem | grep -v key | head -1)
    if [[ -n "$CERT_FILE" ]]; then
        echo "Certificate: $(basename "$CERT_FILE")"
        echo "Domains covered:"
        openssl x509 -in "$CERT_FILE" -text -noout | grep -A5 "Subject Alternative Name" | grep DNS: | sed 's/DNS://g' | tr ',' '\n' | sed 's/^[ \t]*/  - /'
        echo "Expires:"
        openssl x509 -in "$CERT_FILE" -noout -dates | grep "notAfter" | sed 's/notAfter=/  /'
    else
        echo "❌ No certificate found!"
    fi
}

# Main menu
case "${1:-menu}" in
    "generate")
        generate_wildcard_cert
        update_dynamic_config
        ;;
    "restart")
        restart_traefik
        ;;
    "test")
        test_ssl
        ;;
    "info")
        show_cert_info
        ;;
    "full")
        generate_wildcard_cert
        update_dynamic_config
        restart_traefik
        test_ssl
        ;;
    "menu"|*)
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  generate  - Generate new wildcard certificate"
        echo "  restart   - Restart Traefik container"
        echo "  test      - Test SSL configuration"
        echo "  info      - Show certificate information"
        echo "  full      - Run complete setup (generate + restart + test)"
        echo ""
        echo "Examples:"
        echo "  $0 full      # Complete SSL setup"
        echo "  $0 generate  # Just generate certificates"
        echo "  $0 test      # Test current SSL setup"
        ;;
esac

echo ""
echo "🎉 SSL setup script completed!"