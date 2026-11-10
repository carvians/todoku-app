# syntax=docker/dockerfile:1
# =====================================================================
# Image frontend + reverse proxy TodoKu (Nginx)
#   - Menyajikan file statis (HTML/CSS/JS)
#   - Meneruskan /api/* ke container "app" melalui network internal
# =====================================================================
FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="todoku-web" \
      org.opencontainers.image.description="Frontend & reverse proxy TodoKu"

# Template konfigurasi: variabel ${API_UPSTREAM} dll. diisi saat container start
COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY public /usr/share/nginx/html

ARG APP_VERSION=2.0.0
ENV API_UPSTREAM=app:3000 \
    CLIENT_MAX_BODY_SIZE=6m \
    APP_VERSION=${APP_VERSION}
LABEL org.opencontainers.image.version=${APP_VERSION}

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/nginx-health || exit 1
