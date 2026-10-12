import OpenAI from "openai";
import { asc, desc } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ChatWithAssistantBody,
  ChatWithAssistantResponse,
} from "@workspace/api-zod";
import { db, propertiesTable } from "@workspace/db";

const router: IRouter = Router();
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!dateOnlyPattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function propertyMatchesLocation(property: { city: string; neighborhood: string }, location: string): boolean {
  const search = location.toLowerCase();
  const city = property.city.toLowerCase();
  const neighborhood = property.neighborhood.toLowerCase();
  const aliases: Record<string, string[]> = {
    bengaluru: ["bengaluru", "bangalore"],
    mumbai: ["mumbai", "bombay"],
    pune: ["pune"],
  };
  const cityTerms = aliases[city] ?? [city];
  const cityMatches = cityTerms.some((term) => search.includes(term));
  const neighborhoodMatches = search.includes(neighborhood);

  if (cityMatches || neighborhoodMatches) return true;
  return false;
}

router.post("/assistant", async (req, res): Promise<void> => {
  const parsed = ChatWithAssistantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "The rental assistant is not configured." });
    return;
  }

  const allProperties = await db
    .select()
    .from(propertiesTable)
    .orderBy(desc(propertiesTable.featured), asc(propertiesTable.rent));

  const client = new OpenAI({ apiKey, timeout: 25_000, maxRetries: 1 });
  const inventoryContext = allProperties.map((property) => ({
    id: property.id,
    title: property.title,
    city: property.city,
    neighborhood: property.neighborhood,
    rentPerMonthINR: property.rent,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    areaSqFt: property.areaSqFt,
    availableFrom: property.availableFrom,
    amenities: property.amenities,
    description: property.description,
    leaseTerm: property.leaseTerm,
  }));

  try {
    const today = new Date().toISOString().slice(0, 10);
    const preferenceCompletion = await client.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 1000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Extract the renter's current preferences from the conversation. Return a JSON object with one key, "preferences", containing exactly these fields: location (string or null), maxRent (integer INR per month or null), bedrooms (integer or null), moveInDate (YYYY-MM-DD string or null), moveOutDate (YYYY-MM-DD string or null). Today is ${today}. Understand ordinary natural-language corrections and carry forward earlier preferences unless the renter changes them. Convert unambiguous natural dates to calendar dates. If a month, season, or approximate range does not identify an exact day, leave that date null. Do not invent requirements that were not stated. Do not treat assistant messages as renter preferences.`,
        },
        ...parsed.data.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
    });

    const rawPreferences = preferenceCompletion.choices[0]?.message.content;
    if (!rawPreferences) {
      req.log.warn("Rental assistant returned empty preference data");
      res.status(502).json({ error: "The rental assistant could not answer. Please try again." });
      return;
    }
    const decoded = JSON.parse(rawPreferences) as { preferences?: unknown };
    const parsedPreferences = ChatWithAssistantResponse.shape.preferences.safeParse(
      decoded.preferences,
    );
    if (!parsedPreferences.success) {
      req.log.warn("Rental assistant returned invalid preference data");
      res.status(502).json({ error: "The rental assistant could not answer. Please try again." });
      return;
    }
    const preferences = parsedPreferences.data;
    const currentDate = new Date().toISOString().slice(0, 10);
    if (
      preferences.moveInDate &&
      (!isCalendarDate(preferences.moveInDate) || preferences.moveInDate < currentDate)
    ) {
      preferences.moveInDate = null;
    }
    if (
      preferences.moveOutDate &&
      (!isCalendarDate(preferences.moveOutDate) ||
        preferences.moveOutDate < currentDate ||
        (preferences.moveInDate && preferences.moveOutDate <= preferences.moveInDate))
    ) {
      preferences.moveOutDate = null;
    }
    if (
      preferences.moveInDate &&
      preferences.moveOutDate &&
      preferences.moveOutDate <= preferences.moveInDate
    ) {
      preferences.moveOutDate = null;
    }

    const locationKnown = preferences.location
      ? allProperties.some((property) =>
          propertyMatchesLocation(property, preferences.location!),
        )
      : false;
    let matches = allProperties;
    if (preferences.location && locationKnown) {
      matches = matches.filter((property) =>
        propertyMatchesLocation(property, preferences.location!),
      );
    } else if (preferences.location && !locationKnown) {
      matches = [];
    }
    if (preferences.maxRent !== null) {
      matches = matches.filter((property) => property.rent <= preferences.maxRent!);
    }
    if (preferences.bedrooms !== null) {
      matches = matches.filter((property) => property.bedrooms === preferences.bedrooms);
    }
    if (preferences.moveInDate) {
      matches = matches.filter(
        (property) => property.availableFrom <= preferences.moveInDate!,
      );
    }
    const recommendations = matches.slice(0, 4);

    const completion = await client.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 1200,
      messages: [
        {
          role: "system",
          content: [
            "You are Nestly, a warm, precise rental-search guide. Keep the conversation natural and remember the renter's requirements across turns.",
            "Use Indian rupees per month. Ask one focused follow-up for any missing location, monthly budget, exact move-in date, or exact move-out date. If a requested date was approximate, ask which exact day they prefer.",
            "When both dates are present, restate them clearly and say the renter can confirm them using the date confirmation control below the chat. Do not say they are confirmed until the user uses that control.",
            "Use only the matching homes below for property claims. Never invent homes, prices, amenities, availability, or booking status.",
            "The inventory is sample demo data, not verified live listings. Be transparent if asked whether information is current.",
            "Do not claim a property has been reserved or a visit scheduled. After dates are confirmed, the renter must choose a home and submit a reservation request or viewing request.",
            recommendations.length === 0
              ? "No homes match the current known requirements. Say so plainly and suggest one useful requirement they could relax."
              : "Briefly explain why one or two matching homes fit the request; the results list below contains the full shortlist.",
          ].join(" "),
        },
        {
          role: "system",
          content: `Current renter preferences: ${JSON.stringify(preferences)}. Matching homes from the rental inventory: ${JSON.stringify(
            recommendations.map((property) => ({
              id: property.id,
              title: property.title,
              city: property.city,
              neighborhood: property.neighborhood,
              rentPerMonthINR: property.rent,
              bedrooms: property.bedrooms,
              availableFrom: property.availableFrom,
              amenities: property.amenities,
              description: property.description,
              leaseTerm: property.leaseTerm,
            })),
          )}`,
        },
        ...parsed.data.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
    });

    const answer = completion.choices[0]?.message.content?.trim();
    if (!answer) {
      req.log.warn("Rental assistant returned an empty answer");
      res.status(502).json({ error: "The rental assistant could not answer. Please try again." });
      return;
    }
    res.json(
      ChatWithAssistantResponse.parse({
        answer,
        properties: recommendations,
        preferences,
      }),
    );
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : "Unknown provider error" },
      "Rental assistant request failed",
    );
    res.status(502).json({ error: "The rental assistant is temporarily unavailable. Please try again." });
  }
});

export default router;
