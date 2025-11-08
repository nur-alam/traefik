# Demo Site Manager

A web-based UI for creating and managing WordPress demo sites with automatic cleanup.

## Features

- **Web UI**: Clean, responsive interface for managing demo sites
- **Create Demo Sites**: One-click creation of WordPress demo sites
- **List Active Sites**: View all currently running demo sites
- **Auto-cleanup**: Sites are automatically removed after 10 minutes
- **Docker Integration**: Fully containerized with Traefik reverse proxy

## Access

- **Main UI**: http://node-app.localhost (or http://localhost:4000)
- **Traefik Dashboard**: http://localhost:8080
- **phpMyAdmin**: http://localhost:90

## Usage

### Web Interface

1. Open http://node-app.localhost in your browser
2. Enter an optional username or leave blank for auto-generated
3. Click "Create Demo Site" 
4. The new site will appear in the "Active Demo Sites" section
5. Click "Visit Site" to view the WordPress site or "Admin Panel" for wp-admin

### API Endpoints

- `GET /` - Web UI
- `GET /sites` - List all active demo sites
- `POST /create-site` - Create a new demo site
  ```json
  {
    "username": "optional-username"
  }
  ```

### Demo Site Details

Each created site includes:
- Unique subdomain (e.g., `abc123.tutor.localhost`)
- WordPress installation with admin user
- Dedicated MySQL database
- Auto-cleanup after 10 minutes
- Traefik routing configuration

## Development

```bash
# Start all services
docker-compose up -d

# Rebuild node app after changes
docker-compose build node-app
docker-compose restart node-app

# View logs
docker logs node-app
```

## Architecture

- **Node.js/Express**: Backend API and web UI
- **EJS**: Template engine for the web interface
- **MySQL**: Database for WordPress sites
- **Traefik**: Reverse proxy and load balancer
- **Docker**: Containerization and orchestration