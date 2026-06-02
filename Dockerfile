FROM node:24-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN mkdir -p /flags && mv assets/* /flags/ && rmdir assets
EXPOSE 3000
CMD ["node", "server.js"]
ENV ALFRED_PSW=sCw2QA6H