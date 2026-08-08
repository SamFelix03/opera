FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/web/package.json packages/web/
COPY packages/cleanverse-client/package.json packages/cleanverse-client/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY --from=deps /app/packages/cleanverse-client/node_modules ./packages/cleanverse-client/node_modules
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/cleanverse-client packages/cleanverse-client
COPY packages/web packages/web
COPY config/deployments config/deployments
ARG VITE_WALLETCONNECT_PROJECT_ID
ENV VITE_WALLETCONNECT_PROJECT_ID=${VITE_WALLETCONNECT_PROJECT_ID}
RUN pnpm --filter @opera/cleanverse-client build && \
    pnpm --filter @opera/web build

FROM nginx:alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
