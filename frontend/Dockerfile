# --- build stage ---
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Optional platform bearer token, inlined at build time so the gated prod UI can
# authenticate to its own backend. Pass with: --build-arg VITE_API_TOKEN=...
ARG VITE_API_TOKEN=""
ENV VITE_API_TOKEN=$VITE_API_TOKEN
RUN pnpm build

# --- serve stage ---
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
