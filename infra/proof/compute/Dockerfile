# Isolated Proof scan/compute image (PWC-22/23).
# Do not build or push this image without founder D-01 authorization.
# No secrets, no database, no R2 credentials, no outbound network in the
# processing runtime. Signature updates use a separate daily workflow.

FROM node:22-bookworm-slim

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends clamav clamav-freshclam ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /proof
COPY scan.mjs process.mjs ./
# Application engine/validator bind-mounts are added at image build time after
# licence review. This file does not pull unpinned third-party scanners.

USER nobody
ENV NODE_ENV=production
CMD ["node", "scan.mjs"]
