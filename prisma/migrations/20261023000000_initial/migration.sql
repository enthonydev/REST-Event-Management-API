-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CANCELLED');
CREATE TYPE "ItemType" AS ENUM ('TICKET', 'PRODUCT');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Event" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL DEFAULT 'Outros',
  "date" TIMESTAMP(3) NOT NULL,
  "location" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "status" "EventStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Ticket" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "quantityAvailable" INTEGER NOT NULL,
  CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Product" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" DECIMAL(12,2) NOT NULL,
  "stock" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
  "total" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "itemType" "ItemType" NOT NULL,
  "referenceId" TEXT NOT NULL,
  "nameSnapshot" TEXT NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "ticketId" TEXT,
  "productId" TEXT,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Event_date_status_idx" ON "Event"("date", "status");
CREATE INDEX "Ticket_eventId_idx" ON "Ticket"("eventId");
CREATE INDEX "Product_eventId_active_idx" ON "Product"("eventId", "active");
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_referenceId_idx" ON "OrderItem"("referenceId");
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
