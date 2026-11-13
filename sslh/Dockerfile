# sslh: SSH and HTTPS on the one forwarded port 443. It reads the first bytes of each connection:
# an SSH client goes to the server's own sshd, everything else (TLS) to Caddy, untouched.
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends sslh && rm -rf /var/lib/apt/lists/*
ENTRYPOINT ["sslh-select", "-f", "--listen", "0.0.0.0:443", "--ssh", "127.0.0.1:22", "--tls", "127.0.0.1:8443", "--anyprot", "127.0.0.1:8443"]
