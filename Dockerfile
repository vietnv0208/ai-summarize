# Build stage
FROM node:22.4-alpine AS build

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY . .

# Increase memory for TypeScript compilation
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:22.4-alpine

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

COPY entrypoint.sh /app/entrypoint.sh
RUN sed -i 's/\r$//' /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["sh", "/app/entrypoint.sh"]
