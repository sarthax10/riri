# Caddy with the DuckDNS DNS plugin, so it can get one wildcard certificate (*.your-domain) for RiRi's artifacts.
# A wildcard keeps each artifact's random address out of the public certificate-transparency logs.
FROM caddy:2.10.2-builder-alpine AS build
RUN xcaddy build v2.10.2 --with github.com/caddy-dns/duckdns

FROM caddy:2.10.2-alpine
COPY --from=build /usr/bin/caddy /usr/bin/caddy
