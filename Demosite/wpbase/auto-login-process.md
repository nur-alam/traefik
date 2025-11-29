# WordPress Auto-Login Process Documentation

## Overview

This document explains how the automatic admin login feature works for demo WordPress sites. Users can click a link and be automatically logged into the WordPress admin dashboard without entering credentials.

## Architecture

### Components

1. **Must-Use Plugin** (`mu-plugins/auto-login.php`)
2. **Docker Image Build** (Dockerfile)
3. **Auto-Install Script** (embedded in Dockerfile)
4. **Backend API** (`server/src/index.js`)
5. **Frontend UI** (`server/views/index.ejs`)

---

## How It Works

### 1. Plugin Installation (Build Time)

**File:** `wpbase/Dockerfile`

```dockerfile
# Copy the auto-login mu-plugin
COPY mu-plugins/auto-login.php /usr/local/share/auto-login.php
```

The plugin is copied to a temporary location during Docker image build. It will be moved to the WordPress mu-plugins folder after installation.

### 2. WordPress Installation (Container Start)

**Process Flow:**

```
Container Start
    ↓
Wait for WordPress files (wp-config.php)
    ↓
Wait for database connection
    ↓
Install WordPress via WP-CLI
    ↓
Copy auto-login plugin to mu-plugins
    ↓
Activate Tutor plugin
    ↓
Generate auto-login token
    ↓
Save token to file
```

**Code in Dockerfile:**

```bash
# Copy auto-login plugin to mu-plugins
mkdir -p /var/www/html/wp-content/mu-plugins
cp /usr/local/share/auto-login.php /var/www/html/wp-content/mu-plugins/
chown www-data:www-data /var/www/html/wp-content/mu-plugins/auto-login.php

# Get auto-login token
sleep 2
TOKEN=$(wp option get auto_login_token --allow-root --path=/var/www/html 2>/dev/null || echo "")
if [ -n "$TOKEN" ]; then
    echo "AUTO_LOGIN_TOKEN=$TOKEN" > /var/www/html/auto-login-token.txt
fi
```

### 3. Token Generation (WordPress Plugin)

**File:** `wpbase/mu-plugins/auto-login.php`

The plugin automatically generates a secure token when WordPress loads:

```php
add_action('wp_loaded', function() {
    if (is_blog_installed() && !get_option('auto_login_token')) {
        $token = bin2hex(random_bytes(32)); // 64-character hex string
        update_option('auto_login_token', $token);
        update_option('auto_login_token_expiry', time() + 3600); // 1 hour expiry
    }
});
```

**Token Properties:**
- **Length:** 64 characters (32 bytes in hex)
- **Expiry:** 1 hour from generation
- **Storage:** WordPress options table
- **Security:** Cryptographically secure random bytes

### 4. Token Retrieval (Backend API)

**File:** `server/src/index.js`

After creating a container, the backend retrieves the token:

```javascript
// Execute command inside container to read token file
const execResult = await container.exec({
    Cmd: ['cat', '/var/www/html/auto-login-token.txt'],
    AttachStdout: true,
    AttachStderr: true,
});

const stream = await execResult.start();
let output = '';
stream.on('data', (chunk) => {
    output += chunk.toString();
});

// Extract token from output
const match = output.match(/AUTO_LOGIN_TOKEN=([a-f0-9]+)/);
if (match) {
    autoLoginToken = match[1];
}
```

**API Response:**

```json
{
    "success": true,
    "url": "https://abc123.tutor.localhost",
    "login_url": "https://abc123.tutor.localhost?auto_login_token=763018ea...",
    "admin_user": "admin",
    "admin_pass": "password123"
}
```

### 5. Auto-Login Flow (User Click)

**User Journey:**

```
User clicks "Auto Login to Admin"
    ↓
Browser navigates to: https://site.tutor.localhost?auto_login_token=xxx
    ↓
WordPress loads
    ↓
Plugin intercepts request (init hook)
    ↓
Validate token (check value & expiry)
    ↓
Get admin user
    ↓
Set authentication cookies
    ↓
Delete token (one-time use)
    ↓
Redirect to /wp-admin
    ↓
User is logged in!
```

**Plugin Code:**

```php
add_action('init', function() {
    if (isset($_GET['auto_login_token'])) {
        $token = sanitize_text_field($_GET['auto_login_token']);
        
        // Get stored token and expiry
        $stored_token = get_option('auto_login_token');
        $token_expiry = get_option('auto_login_token_expiry');
        
        // Validate token
        if ($stored_token && $token === $stored_token && time() < $token_expiry) {
            // Get admin user
            $admin_user = get_users(['role' => 'administrator', 'number' => 1]);
            
            if (!empty($admin_user)) {
                // Log in the user
                wp_set_current_user($admin_user[0]->ID);
                wp_set_auth_cookie($admin_user[0]->ID, true);
                
                // Delete token (one-time use)
                delete_option('auto_login_token');
                delete_option('auto_login_token_expiry');
                
                // Redirect to admin
                wp_redirect(admin_url());
                exit;
            }
        }
        
        // Invalid or expired token
        wp_die('Invalid or expired login link.');
    }
});
```

---

## Security Features

### 1. Token Properties
- **Cryptographically secure:** Uses `random_bytes()` for generation
- **Long and unpredictable:** 64 hex characters (256 bits of entropy)
- **One-time use:** Deleted immediately after successful login
- **Time-limited:** Expires after 1 hour

### 2. Validation Checks
- Token must match exactly (case-sensitive)
- Token must not be expired
- Admin user must exist
- Token is deleted after use (prevents replay attacks)

### 3. Error Handling
- Invalid tokens show error message
- Expired tokens show error message
- No token leakage in error messages

---

## Frontend Integration

**File:** `server/views/index.ejs`

### Site Card Display

```html
<div class="site-actions">
    <a href="${site.url}" target="_blank" class="btn-small btn-visit">Visit Site</a>
    <a href="${site.login_url}" target="_blank" class="btn-small btn-admin">Auto Login to Admin</a>
</div>
```

### Success Message

```javascript
if (result.success) {
    const loginLink = result.login_url || result.url;
    showAlert('success', `Site created successfully! <a href="${loginLink}" target="_blank">Click here to auto-login</a>`);
}
```

---

## Token Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ 1. WordPress Installation Complete                          │
│    - Plugin loaded as must-use plugin                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Token Generation (wp_loaded hook)                        │
│    - Generate 64-char random token                          │
│    - Store in wp_options table                              │
│    - Set expiry time (current time + 1 hour)                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Token Saved to File                                      │
│    - Auto-install script reads from database                │
│    - Writes to /var/www/html/auto-login-token.txt           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Backend Retrieves Token                                  │
│    - Docker exec to read file                               │
│    - Parse token from file content                          │
│    - Include in API response                                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Frontend Displays Login Link                             │
│    - URL: https://site.com?auto_login_token=xxx              │
│    - User clicks link                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Plugin Validates & Logs In                               │
│    - Check token matches                                     │
│    - Check not expired                                       │
│    - Set auth cookies                                        │
│    - DELETE token from database                              │
│    - Redirect to /wp-admin                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Token Not Generated

**Symptoms:** `login_url` points to `/wp-admin` instead of having token parameter

**Possible Causes:**
1. Plugin not copied to mu-plugins folder
2. WordPress installation failed
3. Token generation timing issue

**Debug Steps:**
```bash
# Check if plugin exists
docker exec <container> ls -la /var/www/html/wp-content/mu-plugins/

# Check if token file exists
docker exec <container> cat /var/www/html/auto-login-token.txt

# Check WordPress options
docker exec <container> wp option get auto_login_token --allow-root --path=/var/www/html
```

### Token Expired

**Symptoms:** "Invalid or expired login link" error message

**Cause:** Token is valid for 1 hour only

**Solution:** 
- Use the link within 1 hour of site creation
- For older sites, use manual login with admin credentials
- Token can be regenerated by deleting the option and reloading WordPress

### Auto-Login Not Working

**Symptoms:** Redirected to login page instead of dashboard

**Debug Steps:**
```bash
# Check plugin is active
docker exec <container> wp plugin list --allow-root --path=/var/www/html

# Check for PHP errors
docker logs <container> | grep -i error

# Verify token in database
docker exec <container> wp option get auto_login_token --allow-root --path=/var/www/html
```

---

## Manual Token Regeneration

If needed, you can manually regenerate a token:

```bash
# Delete existing token
docker exec <container> wp option delete auto_login_token --allow-root --path=/var/www/html
docker exec <container> wp option delete auto_login_token_expiry --allow-root --path=/var/www/html

# Reload WordPress (token will be auto-generated)
docker exec <container> curl -s http://localhost > /dev/null

# Get new token
docker exec <container> wp option get auto_login_token --allow-root --path=/var/www/html
```

---

## Future Enhancements

### Potential Improvements

1. **Multiple Tokens:** Support multiple valid tokens for different users
2. **Custom Expiry:** Allow configurable token expiry time
3. **Token Refresh:** Automatically regenerate tokens before expiry
4. **Audit Log:** Track token usage and login attempts
5. **Role-Based Tokens:** Generate tokens for specific user roles
6. **API Endpoint:** Create REST API endpoint to generate new tokens on demand

### Security Enhancements

1. **IP Restriction:** Bind tokens to specific IP addresses
2. **Rate Limiting:** Limit token validation attempts
3. **HTTPS Only:** Enforce HTTPS for token URLs
4. **Token Rotation:** Automatically rotate tokens periodically

---

## References

- WordPress Authentication: https://developer.wordpress.org/reference/functions/wp_set_auth_cookie/
- Must-Use Plugins: https://wordpress.org/documentation/article/must-use-plugins/
- PHP random_bytes(): https://www.php.net/manual/en/function.random-bytes.php
- Docker Exec API: https://docs.docker.com/engine/api/v1.41/#operation/ContainerExec
