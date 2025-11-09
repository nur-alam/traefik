# GitHub SSH Setup Guide for VPS

## Prerequisites
- Git installed on your system
- A GitHub account
- Terminal/SSH access to your VPS

## Step 1: Generate SSH Key

Generate an Ed25519 SSH key pair (recommended):

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

**Options explained:**
- `-t ed25519`: Specifies the key type (Ed25519 algorithm - modern and secure)
- `-C "email"`: Adds a comment/label to identify the key

**During generation, you'll be prompted:**
1. File location (press Enter for default: `~/.ssh/id_ed25519`)
2. Passphrase (optional but recommended for extra security)

**Alternative for older systems:**
If Ed25519 isn't supported, use RSA:
```bash
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
```

## Step 2: Start SSH Agent and Add Key

Start the ssh-agent in the background:

```bash
eval "$(ssh-agent -s)"
```

Add your SSH private key to the ssh-agent:

```bash
ssh-add ~/.ssh/id_ed25519
```

**What is ssh-agent?**
- A background program that holds your SSH private keys in memory
- Prevents you from entering your passphrase repeatedly
- Manages keys and provides them automatically when needed

## Step 3: Copy Your Public Key

Display your public key:

```bash
cat ~/.ssh/id_ed25519.pub
```

Copy the entire output (starts with `ssh-ed25519` and ends with your email).

## Step 4: Add SSH Key to GitHub

1. Go to GitHub Settings: https://github.com/settings/keys
2. Click **"New SSH key"** button
3. Give it a descriptive title (e.g., "Production VPS", "Ubuntu Server")
4. Paste your public key into the "Key" field
5. Click **"Add SSH key"**
6. Confirm with your GitHub password if prompted

## Step 5: Test SSH Connection

Verify the SSH connection works:

```bash
ssh -T git@github.com
```

**Expected response:**
```
Hi username! You've successfully authenticated, but GitHub does not provide shell access.
```

**First time connecting:**
You'll see a message about authenticity and fingerprint. Type `yes` to continue.

## Step 6: Configure Git Repository to Use SSH

### For existing HTTPS repository:

Change remote URL from HTTPS to SSH:

```bash
git remote set-url origin git@github.com:username/repository.git
```

Verify the change:

```bash
git remote -v
```

### For new repository:

Clone using SSH URL:

```bash
git clone git@github.com:username/repository.git
```

## Step 7: Push to GitHub

Now you can push without password prompts:

```bash
git push origin main
```

## Troubleshooting

### "Permission denied (publickey)"
- Ensure ssh-agent is running: `eval "$(ssh-agent -s)"`
- Add key to agent: `ssh-add ~/.ssh/id_ed25519`
- Verify key is added: `ssh-add -l`
- Check key is added to GitHub settings

### "Host key verification failed"
- Accept GitHub's host key: `ssh -T git@github.com` and type `yes`

### "Could not open a connection to your authentication agent"
- Start ssh-agent first: `eval "$(ssh-agent -s)"`

## Key File Locations

- **Private key:** `~/.ssh/id_ed25519` (NEVER share this)
- **Public key:** `~/.ssh/id_ed25519.pub` (safe to share)
- **Known hosts:** `~/.ssh/known_hosts` (stores verified server fingerprints)

## Security Best Practices

1. **Never share your private key** (`id_ed25519`)
2. **Use a strong passphrase** for your SSH key
3. **Keep your private key secure** with proper file permissions (600)
4. **Use different keys** for different servers/purposes
5. **Regularly rotate keys** (every 6-12 months)
6. **Remove old keys** from GitHub when no longer needed

## Quick Reference Commands

```bash
# Generate key
ssh-keygen -t ed25519 -C "email@example.com"

# Start agent and add key
eval "$(ssh-agent -s)" && ssh-add ~/.ssh/id_ed25519

# Display public key
cat ~/.ssh/id_ed25519.pub

# Test connection
ssh -T git@github.com

# Switch to SSH remote
git remote set-url origin git@github.com:username/repo.git

# List loaded keys
ssh-add -l

# Check remote URL
git remote -v
```

## Multiple GitHub Accounts

If you need to manage multiple GitHub accounts, create an SSH config file:

```bash
nano ~/.ssh/config
```

Add configuration:

```
# Personal account
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_personal

# Work account
Host github-work
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_work
```

Clone using custom host:
```bash
git clone git@github-work:company/repo.git
```

## Auto-start SSH Agent (Optional)

Add to `~/.bashrc` or `~/.bash_profile`:

```bash
# Start ssh-agent automatically
if [ -z "$SSH_AUTH_SOCK" ] ; then
    eval "$(ssh-agent -s)"
    ssh-add ~/.ssh/id_ed25519
fi
```

---

**Last Updated:** 2025-11-09  
**System:** Ubuntu Linux with Bash shell
