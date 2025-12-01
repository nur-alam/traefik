Option 1: Use Cloudflare (Recommended)
Transfer your DNS management to Cloudflare (free) while keeping domain at Hostinger. This is the easiest and most reliable option.

Steps:
1. Sign up for Cloudflare (free)
2. Add your domain wptriggermail.com
3. Update nameservers at Hostinger to Cloudflare's
4. Get Cloudflare API token

Option 2: Manual Wildcard Certificate
Get a wildcard certificate manually using certbot and load it into Traefik.



Which option do you prefer? 

If you choose Option 1 (Cloudflare), I can guide you through the setup. It takes about 10 minutes and gives you better DNS management plus automatic wildcard SSL.

If you want to stick with Hostinger DNS, we'd need to use Option 2, but you'd have to manually renew the certificate every 90 days.

I recommend Option 1 - it's free, automated, and widely used. Let me know which you'd like to proceed with!