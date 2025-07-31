FROM node:22.12.0-alpine

WORKDIR /usr/src/app

COPY package* .
COPY ./prisma .
    
RUN npm install
RUN npx prisma generate

COPY . .

EXPOSE 3000

RUN npx tsc --build

RUN rm -rf src/
RUN rm -rf tsconfig.json

CMD ["node", "dist/index.js" ]