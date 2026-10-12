import { and, asc, desc, eq, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateViewingBody,
  CreateViewingResponse,
  CreateReservationBody,
  CreateReservationResponse,
  GetPropertyAvailabilityParams,
  GetPropertyAvailabilityResponse,
  GetPropertyParams,
  GetPropertyResponse,
  ListPropertiesQueryParams,
  ListPropertiesResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  propertiesTable,
  reservationRequestsTable,
  viewingsTable,
} from "@workspace/db";
import {
  isValidViewingDate,
  isValidViewingTime,
  viewingSlots,
} from "@workspace/db";

const router: IRouter = Router();

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

router.get("/properties", async (req, res): Promise<void> => {
  const query = ListPropertiesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { city, maxRent, bedrooms, featured } = query.data;
  const conditions = [];
  if (city?.trim()) {
    conditions.push(eq(propertiesTable.city, city.trim()));
  }
  if (maxRent !== undefined) {
    conditions.push(lte(propertiesTable.rent, maxRent));
  }
  if (bedrooms !== undefined) {
    conditions.push(eq(propertiesTable.bedrooms, bedrooms));
  }
  if (featured !== undefined) {
    conditions.push(eq(propertiesTable.featured, featured));
  }

  const rows = await db
    .select()
    .from(propertiesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(propertiesTable.featured), asc(propertiesTable.rent));

  res.json(ListPropertiesResponse.parse(rows));
});

router.get("/properties/:propertyId", async (req, res): Promise<void> => {
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, params.data.propertyId));

  if (!property) {
    res.status(404).json({ error: "Property not found" });
    return;
  }

  res.json(GetPropertyResponse.parse(property));
});

router.get(
  "/properties/:propertyId/availability/:date",
  async (req, res): Promise<void> => {
    const params = GetPropertyAvailabilityParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const { propertyId, date } = params.data;
    if (!isValidViewingDate(date)) {
      res.status(400).json({ error: "Choose a valid date today or later." });
      return;
    }

    const [property] = await db
      .select({ id: propertiesTable.id })
      .from(propertiesTable)
      .where(eq(propertiesTable.id, propertyId));
    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    const reserved = await db
      .select({ preferredTime: viewingsTable.preferredTime })
      .from(viewingsTable)
      .where(
        and(
          eq(viewingsTable.propertyId, propertyId),
          eq(viewingsTable.preferredDate, date),
        ),
      );
    const unavailable = new Set(reserved.map((item) => item.preferredTime));
    res.json(
      GetPropertyAvailabilityResponse.parse({
        propertyId,
        date,
        slots: viewingSlots.filter((slot) => !unavailable.has(slot)),
      }),
    );
  },
);

router.post("/viewings", async (req, res): Promise<void> => {
  const input = CreateViewingBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }

  const data = input.data;
  if (!isValidViewingDate(data.preferredDate)) {
    res.status(400).json({ error: "Choose a valid date today or later." });
    return;
  }
  if (!isValidViewingTime(data.preferredTime)) {
    res.status(400).json({ error: "Choose one of the listed visit times." });
    return;
  }

  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, data.propertyId));
  if (!property) {
    res.status(404).json({ error: "Property not found" });
    return;
  }

  const reserved = await db
    .select({ preferredTime: viewingsTable.preferredTime })
    .from(viewingsTable)
    .where(
      and(
        eq(viewingsTable.propertyId, data.propertyId),
        eq(viewingsTable.preferredDate, data.preferredDate),
        eq(viewingsTable.preferredTime, data.preferredTime),
      ),
    );
  if (reserved.length) {
    res.status(400).json({ error: "That visit time was just booked. Choose another slot." });
    return;
  }

  try {
    const [viewing] = await db
      .insert(viewingsTable)
      .values({
        propertyId: data.propertyId,
        fullName: data.fullName.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone?.trim() || null,
        preferredDate: data.preferredDate,
        preferredTime: data.preferredTime,
        notes: data.notes?.trim() || null,
      })
      .returning();

    res.status(201).json(
      CreateViewingResponse.parse({
        ...viewing,
        propertyTitle: property.title,
        createdAt: viewing.createdAt.toISOString(),
      }),
    );
  } catch (error) {
    const errorCode =
      error && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
    if (errorCode === "23505") {
      res.status(400).json({ error: "That visit time was just booked. Choose another slot." });
      return;
    }
    req.log.error(
      { error: error instanceof Error ? error.message : "Unknown database error" },
      "Could not save viewing request",
    );
    res.status(500).json({ error: "Could not save the viewing request." });
  }
});

router.post("/reservations", async (req, res): Promise<void> => {
  const input = CreateReservationBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }

  const data = input.data;
  const today = new Date().toISOString().slice(0, 10);
  if (
    !isValidCalendarDate(data.moveInDate) ||
    !isValidCalendarDate(data.moveOutDate) ||
    data.moveInDate < today ||
    data.moveOutDate <= data.moveInDate
  ) {
    res.status(400).json({
      error: "Choose valid future move-in and move-out dates in the right order.",
    });
    return;
  }

  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, data.propertyId));
  if (!property) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  if (property.availableFrom > data.moveInDate) {
    res.status(400).json({
      error: "This home is not available by your preferred move-in date.",
    });
    return;
  }

  try {
    const [reservation] = await db
      .insert(reservationRequestsTable)
      .values({
        propertyId: data.propertyId,
        fullName: data.fullName.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone?.trim() || null,
        moveInDate: data.moveInDate,
        moveOutDate: data.moveOutDate,
        notes: data.notes?.trim() || null,
      })
      .returning();

    res.status(201).json(
      CreateReservationResponse.parse({
        ...reservation,
        propertyTitle: property.title,
        createdAt: reservation.createdAt.toISOString(),
      }),
    );
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : "Unknown database error" },
      "Could not save reservation request",
    );
    res.status(500).json({ error: "Could not save the reservation request." });
  }
});

export default router;
