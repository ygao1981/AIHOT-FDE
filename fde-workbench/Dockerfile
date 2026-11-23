FROM node:24.22.3-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
# Installing Codex is optional; the base image supports API/off without its disk cost.
ARG CODEX_VERSION
RUN if [ -n "$CODEX_VERSION" ]; then npm install -g --ignore-scripts --no-audit --no-fund "@openai/codex@$CODEX_VERSION" && npm cache clean --force; fi
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node config ./config
COPY --chown=node:node prompts ./prompts
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 3210
CMD ["node","src/main.mjs"]
