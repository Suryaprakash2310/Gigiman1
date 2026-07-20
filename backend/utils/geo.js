/**
 * Computes the distance in meters between two coordinates [longitude, latitude]
 * using the Haversine formula.
 * 
 * @param {Array<number>} coords1 - [longitude, latitude] of first location
 * @param {Array<number>} coords2 - [longitude, latitude] of second location
 * @returns {number} Distance in meters
 */
const getDistance = (coords1, coords2) => {
  if (!Array.isArray(coords1) || !Array.isArray(coords2) || coords1.length < 2 || coords2.length < 2) {
    return Infinity;
  }
  const [lon1, lat1] = coords1;
  const [lon2, lat2] = coords2;

  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
};

/**
 * Normalizes a location/city/region name into a canonical region slug.
 * 
 * @param {string} name 
 * @returns {string} Normalized region name
 */
const normalizeRegionName = (name) => {
  if (!name) return "";
  const clean = name.toLowerCase().trim();
  if (clean.includes("trichy") || clean.includes("tiruchy") ||
      clean.includes("tiruchirappalli") || clean.includes("tiruchirapalli")) {
    return "trichy";
  }
  if (clean.includes("thanjavur") || clean.includes("tanjore")) return "thanjavur";
  if (clean.includes("coimbatore") || clean.includes("kovai"))  return "coimbatore";
  if (clean.includes("chennai")    || clean.includes("madras")) return "chennai";
  if (clean.includes("madurai"))    return "madurai";
  return clean;
};

module.exports = {
  getDistance,
  normalizeRegionName,
};

