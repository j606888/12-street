// Store details shown in the shop footer and on the order-complete page.

const name = "十二街影像生活館";
const address = "臺南市永康區復國一路 186 號";

export const SHOP = {
  name,
  address,
  /** Opens the shop in Google Maps (app on phones). */
  mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`)}`,
  hours: ["週一至週五 12:00–21:00", "週六 12:00–17:00", "週日休息"],
} as const;
