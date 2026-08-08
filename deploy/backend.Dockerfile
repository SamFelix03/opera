FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/agents/package.json packages/agents/
COPY packages/cleanverse-client/package.json packages/cleanverse-client/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=deps /app/packages/agents/node_modules ./packages/agents/node_modules
COPY --from=deps /app/packages/cleanverse-client/node_modules ./packages/cleanverse-client/node_modules
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/cleanverse-client packages/cleanverse-client
COPY packages/agents packages/agents
COPY packages/backend packages/backend
COPY config/deployments config/deployments
RUN pnpm --filter @opera/cleanverse-client build && \
    pnpm --filter @opera/agents build && \
    pnpm --filter @opera/backend build

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=deps /app/packages/agents/node_modules ./packages/agents/node_modules
COPY --from=deps /app/packages/cleanverse-client/node_modules ./packages/cleanverse-client/node_modules
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/agents/dist ./packages/agents/dist
COPY --from=build /app/packages/cleanverse-client/dist ./packages/cleanverse-client/dist
COPY --from=build /app/packages/backend/package.json ./packages/backend/
COPY --from=build /app/packages/agents/package.json ./packages/agents/
COPY --from=build /app/packages/cleanverse-client/package.json ./packages/cleanverse-client/
COPY --from=build /app/config/deployments ./config/deployments
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=8787
ENV DATABASE_PATH=/app/data/opera-audit.sqlite
EXPOSE 8787

CMD ["node", "packages/backend/dist/index.js"]
