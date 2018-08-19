FROM node:8

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm install --only=production

# Bundle app source
COPY . .

EXPOSE 3000

RUN ["apt-get", "update"]
RUN ["apt-get", "install", "-y", "sqlite3"]
RUN sqlite3 urls.db < urls.sql
RUN sqlite3 urls.db < stats.sql
CMD [ "npm", "start" ]
