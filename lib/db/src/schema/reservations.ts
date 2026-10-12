import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";

export const reservationRequestsTable = pgTable("rental_reservation_requests", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  moveInDate: date("move_in_date", { mode: "string" }).notNull(),
  moveOutDate: date("move_out_date", { mode: "string" }).notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("requested"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertReservationRequestSchema = createInsertSchema(
  reservationRequestsTable,
).omit({ id: true, status: true, createdAt: true });

export type InsertReservationRequest = z.infer<
  typeof insertReservationRequestSchema
>;
export type ReservationRequest = typeof reservationRequestsTable.$inferSelect;
