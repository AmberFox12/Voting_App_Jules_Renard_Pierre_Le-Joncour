FROM node:26.13.1-alpine3.24

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 8888

USER node

CMD ["npm", "start"]