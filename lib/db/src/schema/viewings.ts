import {
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";

export const viewingsTable = pgTable(
  "rental_viewings",
  {
    id: serial("id").primaryKey(),
    propertyId: integer("property_id")
      .notNull()
      .references(() => propertiesTable.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    preferredDate: date("preferred_date", { mode: "string" }).notNull(),
    preferredTime: text("preferred_time").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("rental_viewings_property_slot_unique").on(
      table.propertyId,
      table.preferredDate,
      table.preferredTime,
    ),
  ],
);

export type Viewing = typeof viewingsTable.$inferSelect;

export const viewingSlots = ["10:00", "12:00", "14:00", "16:00"] as const;

export function isValidViewingDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    value >= new Date().toISOString().slice(0, 10)
  );
}

export function isValidViewingTime(value: string): boolean {
  return (viewingSlots as readonly string[]).includes(value);
}

