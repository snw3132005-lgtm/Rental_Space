import { boolean, date, integer, pgTable, serial, text } from "drizzle-orm/pg-core";

export const propertiesTable = pgTable("rental_properties", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  neighborhood: text("neighborhood").notNull(),
  rent: integer("rent").notNull(),
  bedrooms: integer("bedrooms").notNull(),
  bathrooms: integer("bathrooms").notNull(),
  areaSqFt: integer("area_sq_ft").notNull(),
  availableFrom: date("available_from", { mode: "string" }).notNull(),
  description: text("description").notNull(),
  amenities: text("amenities").array().notNull(),
  imageUrl: text("image_url").notNull(),
  propertyType: text("property_type").notNull(),
  leaseTerm: text("lease_term").notNull(),
  featured: boolean("featured").notNull().default(false),
});

export type Property = typeof propertiesTable.$inferSelect;
