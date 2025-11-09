# Reserve Pool System

## Overview
The reserve pool system pre-creates 10 WordPress sites with SSL certificates so users get **instant access** (0 wait time) instead of waiting 20-60 seconds for Let's Encrypt certificate issuance.

## How It Works

### 1. **Pool Initialization (on server startup)**
- Creates 10 pre-provisioned sites with:
  - WordPress containers
  - MySQL databases
  - SSL certificates (Let's Encrypt)
  - Traefik routing configured
- Each site takes ~20-60 seconds to create
- Total initialization: ~5-10 minutes for full pool

### 2. **User Request (instant!)**
- When user requests a site via `POST /create-site`
- System allocates a pre-created site from pool **instantly**
- Returns site URL with SSL already working
- Response time: **< 1 second**

### 3. **Background Refill**
- When pool drops below 3 sites, automatic refill starts
- Refills pool back to 10 sites in background
- No impact on user experience

## Configuration

Edit `server/src/pool.js`:

```javascript
const POOL_SIZE = 10;        // Total sites to maintain
const MIN_POOL_SIZE = 3;     // Trigger refill threshold
```

## API Endpoints

### Check Pool Status
```bash
curl http://localhost:4000/pool-status
```

Response:
```json
{
  "size": 7,
  "target": 10,
  "minSize": 3,
  "isRefilling": true,
  "sites": [
    { "id": "a1b2c3d4", "subdomain": "a1b2c3d4.tutor.localhost", "createdAt": "2025-11-09T07:00:00Z" }
  ]
}
```

### Create Site (uses pool)
```bash
curl -X POST http://localhost:4000/create-site
```

Response includes `from_pool: true` if allocated from pool.

## Fallback Behavior

If pool is empty, system automatically falls back to **on-demand creation** (old behavior with 20-60 second wait).

## Benefits

- ✅ **Instant user experience** (0 wait time)
- ✅ **SSL certificates pre-issued** (no Let's Encrypt delays)
- ✅ **Automatic pool management** (background refills)
- ✅ **Graceful fallback** (on-demand if pool empty)
- ✅ **Resource efficient** (maintains only 10 reserve sites)

## Monitoring

Watch server logs for pool activity:
```
🚀 Initializing reserve site pool...
🔧 Creating reserve site: a1b2c3d4.tutor.localhost
⏳ Waiting for SSL certificate: a1b2c3d4.tutor.localhost
✅ Reserve site ready: a1b2c3d4.tutor.localhost
✅ Pool refilled to 10 sites
📦 Allocated site from pool: a1b2c3d4.tutor.localhost (9 remaining)
🔄 Refilling pool (current: 2, target: 10)
```
