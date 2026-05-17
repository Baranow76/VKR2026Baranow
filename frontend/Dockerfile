FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install --no-audit --no-fund --legacy-peer-deps

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]