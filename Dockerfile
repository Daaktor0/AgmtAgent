FROM node:22-bookworm-slim AS web-build

WORKDIR /app/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web ./

# Authentication stays enabled in every deployed build. Runtime secrets are
# injected by the Cloudflare Worker into the container; none are baked here.
ENV VITE_AUTH_ENABLED=true
RUN npm run build -- --config vite.cloudflare.config.ts

FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787

COPY --from=web-build /app/web/.output ./.output

# Non-root runtime. The Nitro bundle is read-only and all durable application
# state lives outside the container.
USER node

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" || exit 1

EXPOSE 8787

CMD ["node", ".output/server/index.mjs"]
