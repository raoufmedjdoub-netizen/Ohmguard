# Frontend Dockerfile - React (Multi-stage build)
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN yarn install --network-timeout 100000

COPY . .

ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

RUN yarn build

# Production
FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
