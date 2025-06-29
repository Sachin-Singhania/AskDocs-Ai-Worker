-- CreateEnum
CREATE TYPE "status" AS ENUM ('WAITING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TYPE" AS ENUM ('URL', 'PDF');

-- CreateEnum
CREATE TYPE "Sender" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "googleID" TEXT NOT NULL,
    "tokenExpiry" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "limit" INTEGER DEFAULT 5,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TYPE" NOT NULL,
    "topic" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "collectionName" TEXT,
    "status" "status" NOT NULL DEFAULT 'WAITING',

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "URL" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "collectionName" TEXT NOT NULL,

    CONSTRAINT "URL_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "Sender" "Sender" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleID_key" ON "User"("googleID");

-- CreateIndex
CREATE INDEX "User_id_email_idx" ON "User"("id", "email");

-- CreateIndex
CREATE INDEX "Chat_id_userId_idx" ON "Chat"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "URL_url_key" ON "URL"("url");

-- CreateIndex
CREATE INDEX "URL_id_url_idx" ON "URL"("id", "url");

-- CreateIndex
CREATE INDEX "Message_id_chatId_idx" ON "Message"("id", "chatId");

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
