### curl -I https://node-app.localhost

curl: (60) SSL: no alternative certificate subject name matches target host name 'node-app.localhost'
More details here: https://curl.se/docs/sslcerts.html

curl failed to verify the legitimacy of the server and therefore could not
establish a secure connection to it. To learn more about this situation and
how to fix it, please visit the web page mentioned above.

Ah! I found the issue. The certificate doesn't include node-app.localhost as a subject alternative name. Let me recreate the certificate with the correct domains:

## mkcert node-app.localhost nginx.localhost localhost 127.0.0.1 ::1

curl -I https://node-app.localhost
HTTP/2 200 
content-type: text/html; charset=utf-8
date: Mon, 03 Nov 2025 20:00:34 GMT
etag: W/"1724-KI3lkTw+TyaM5XgPon7o3nQ2JKA"
x-powered-by: Express
content-length: 5924