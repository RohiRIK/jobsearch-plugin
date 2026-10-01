FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

COPY data/ ./data/
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY templates/ ./templates/
COPY assets/cv/ ./assets/cv/
COPY assets/cover_letters/ ./assets/cover_letters/

ENV HOST=0.0.0.0
EXPOSE 8317
CMD ["bun", "run", "scripts/api/server.ts", "--port", "8317"]
