FROM node:24-alpine
WORKDIR /app
COPY package.json .
# This installs both production and development dependencies (like nodemon)
RUN npm install
RUN apk add --no-cache shadow
RUN useradd -m alfred && echo "alfred:sCw2QA6H" | chpasswd
COPY . .
RUN mkdir -p /flags && mv assets/* /flags/ && rmdir assets
RUN chown -R alfred:alfred /flags/level_7
RUN mkdir -p /etc/hidden/flags && mv /flags/level_7 /etc/hidden/flags/level_7
EXPOSE 3000
CMD ["node", "server.js"]
ENV USERNAME=alfred
ENV PASSWORD=sCw2QA6H