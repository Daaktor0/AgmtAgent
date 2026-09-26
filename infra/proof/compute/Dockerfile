# Isolated Proof scan image (PWC-22). Signatures are baked at build time.
# Runtime has no secrets, no database, no R2 credentials, and no outbound
# network. Processing of OOXML happens in the web Worker after a clean receipt.

FROM node:22-bookworm-slim

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends clamav clamav-freshclam ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && freshclam \
  && date +%s > /proof-SIGNATURE_BUILT_AT \
  && mkdir -p /proof \
  && mv /proof-SIGNATURE_BUILT_AT /proof/SIGNATURE_BUILT_AT \
  && chown -R nobody:nogroup /proof

WORKDIR /proof
COPY scan.mjs process.mjs server.mjs ./
RUN chown -R nobody:nogroup /proof
ENV NODE_ENV=production \
    PORT=8080 \
    PROOF_SIGNATURE_BUILT_AT=/proof/SIGNATURE_BUILT_AT
USER nobody
EXPOSE 8080
CMD ["node", "server.mjs"]
