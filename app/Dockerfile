FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends tzdata openssh-client && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir fastapi==0.115.12 "uvicorn[standard]==0.34.2" httpx==0.28.1 "pywebpush>=2,<3" \
    && useradd -u 1000 -m app
WORKDIR /srv
# Front-end libraries and fonts are vendored at build time, so the site makes no third-party requests.
ADD --chmod=644 https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js web-vendor/marked.min.js
ADD --chmod=644 https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js web-vendor/purify.min.js
ADD --chmod=644 https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js web-vendor/highlight.min.js
ADD --chmod=644 https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js web-vendor/qrcode.js
ADD --chmod=644 https://cdn.jsdelivr.net/npm/@fontsource-variable/geist@5.1.0/files/geist-latin-wght-normal.woff2 web-vendor/fonts/geist.woff2
ADD --chmod=644 https://cdn.jsdelivr.net/npm/@fontsource-variable/geist-mono@5.1.0/files/geist-mono-latin-wght-normal.woff2 web-vendor/fonts/geist-mono.woff2
ADD --chmod=644 https://cdn.jsdelivr.net/npm/@fontsource-variable/funnel-display@5.1.0/files/funnel-display-latin-wght-normal.woff2 web-vendor/fonts/funnel-display.woff2
COPY server /srv/server
COPY web /srv/web
RUN cp -r web-vendor /srv/web/vendor && rm -rf web-vendor && chmod -R a+rX /srv/web /srv/server
USER app
ENV RELIQUARY_WEB=/srv/web PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-server-header"]
