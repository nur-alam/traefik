# VPS User Setup Guide

## Creating a New User and Configuring Everything

### 1. Initial Connection (as root)
```bash
ssh root@your_vps_ip
```

### 2. Create New User
```bash
# Create user with home directory
adduser newusername

# You'll be prompted to set a password and optional user info
# Set a strong password when prompted
```

### 3. Grant Sudo Privileges
```bash
# Add user to sudo group
usermod -aG sudo newusername

# Verify user is in sudo group
groups newusername
```

### 4. Configure SSH Key Authentication (Recommended)

#### On your local machine:
```bash
# Generate SSH key if you don't have one
ssh-keygen -t ed25519 -C "your_email@example.com"

# Copy public key to VPS
ssh-copy-id newusername@your_vps_ip
```

#### Or manually on VPS:
```bash
# Switch to new user
su - newusername

# Create .ssh directory
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Create authorized_keys file
nano ~/.ssh/authorized_keys
# Paste your public key here, save and exit

# Set proper permissions
chmod 600 ~/.ssh/authorized_keys

# Exit back to root
exit
```

### 5. Test New User Connection
```bash
# From your local machine
ssh newusername@your_vps_ip

# Test sudo access
sudo apt update
```

### 6. Secure SSH Configuration (Optional but Recommended)
```bash
# As root or with sudo
sudo nano /etc/ssh/sshd_config

# Make these changes:
# PermitRootLogin no
# PasswordAuthentication no  # Only after SSH key is working!
# PubkeyAuthentication yes
# Port 2222  # Optional: change default SSH port

# Restart SSH service
sudo systemctl restart sshd
```

### 7. Install Essential Tools
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl wget git vim ufw fail2ban

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group (no sudo needed for docker commands)
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect
exit
# Then reconnect: ssh newusername@your_vps_ip

# Verify docker works without sudo
docker --version
docker ps
```

### 8. Configure Firewall (UFW)
```bash
# Allow SSH (use your custom port if changed)
sudo ufw allow 22/tcp
# Or if you changed SSH port: sudo ufw allow 2222/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### 9. Set Up Fail2Ban (Brute Force Protection)
```bash
# Start and enable fail2ban
sudo systemctl start fail2ban
sudo systemctl enable fail2ban

# Check status
sudo fail2ban-client status
```

### 10. Create Project Directory Structure
```bash
# Create project directory
mkdir -p ~/projects
cd ~/projects

# Clone your repository or create project structure
git clone your_repo_url
# Or create directories manually
```

### 11. Set Up Docker Compose
```bash
# Install Docker Compose (if not already installed)
sudo apt install -y docker-compose-plugin

# Or install standalone version
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker compose version
```

### 12. Configure Environment Variables
```bash
# Create .env file for your project
cd ~/projects/your-project
nano .env

# Add your environment variables
# Save and exit

# Secure the .env file
chmod 600 .env
```

### 13. Set Up Log Rotation (Optional)
```bash
# Create logrotate config for your app
sudo nano /etc/logrotate.d/myapp

# Add configuration:
# /home/newusername/projects/logs/*.log {
#     daily
#     rotate 14
#     compress
#     delaycompress
#     notifempty
#     create 0640 newusername newusername
# }
```

## Quick Reference Commands

### User Management
```bash
# Switch to user
su - username

# Check current user
whoami

# Check user groups
groups

# Change user password
passwd username  # as root
passwd           # change own password
```

### File Permissions
```bash
# Change ownership
sudo chown -R username:username /path/to/directory

# Change permissions
chmod 755 file.sh  # rwxr-xr-x
chmod 644 file.txt # rw-r--r--
```

### Docker Commands (as non-root user)
```bash
# Start services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Rebuild and restart
docker compose up -d --build

# Remove all containers and volumes
docker compose down -v
```

### System Monitoring
```bash
# Check disk usage
df -h

# Check memory usage
free -h

# Check running processes
htop  # or top

# Check docker resource usage
docker stats
```

### Firewall Management
```bash
# Check firewall status
sudo ufw status numbered

# Allow port
sudo ufw allow 8080/tcp

# Delete rule
sudo ufw delete [rule_number]

# Disable firewall
sudo ufw disable
```

## Security Best Practices

1. **Always use SSH keys** instead of passwords
2. **Disable root login** after setting up sudo user
3. **Change default SSH port** to reduce automated attacks
4. **Keep system updated**: `sudo apt update && sudo apt upgrade`
5. **Use strong passwords** for all accounts
6. **Enable firewall** and only open necessary ports
7. **Regular backups** of important data
8. **Monitor logs** regularly: `sudo journalctl -xe`
9. **Use fail2ban** to prevent brute force attacks
10. **Secure .env files** with proper permissions (600)

## Troubleshooting

### Can't connect via SSH
```bash
# Check SSH service status
sudo systemctl status sshd

# Restart SSH service
sudo systemctl restart sshd

# Check SSH logs
sudo tail -f /var/log/auth.log
```

### Permission denied for Docker
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in, or run:
newgrp docker
```

### Firewall blocking connections
```bash
# Check firewall rules
sudo ufw status numbered

# Temporarily disable to test
sudo ufw disable

# Re-enable after testing
sudo ufw enable
```

### Forgot sudo password
```bash
# You'll need root access to reset
# As root:
passwd username
```

## Initial Setup Checklist

- [ ] Create new user with strong password
- [ ] Add user to sudo group
- [ ] Set up SSH key authentication
- [ ] Test SSH connection with new user
- [ ] Disable root login (after testing)
- [ ] Install Docker and Docker Compose
- [ ] Add user to docker group
- [ ] Configure firewall (UFW)
- [ ] Set up fail2ban
- [ ] Create project directories
- [ ] Clone/upload project files
- [ ] Configure environment variables
- [ ] Test application deployment
- [ ] Set up monitoring/logging
- [ ] Document server details securely
