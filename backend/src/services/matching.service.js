/**
 * Campus Carpool Matching Platform - Milestone 3
 * Matching Engine & Scoring Service
 * 
 * Implements:
 * 1. PostGIS Coordinate & Geodesic Detour Calculation
 * 2. Mutual / Bidirectional Gender Preference Filtering
 * 3. ML Semantic Address Similarity with 2-second timeout & local fallback
 * 4. 50/50 Weighted Score-Level Fusion Ranking (Rating + Price)
 */

import dotenv from 'dotenv';
dotenv.config();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const ML_TIMEOUT_MS = 2000; // 2 seconds strict budget as specified in SRS

/**
 * Parses coordinates from PostGIS WKB hex, WKT string, or GeoJSON
 * @param {string|object} point - Point representation
 * @returns {{ lng: number, lat: number } | null}
 */
export function parseCoordinates(point) {
  if (!point) return null;

  if (typeof point === 'object') {
    if (point.lng !== undefined && point.lat !== undefined) {
      return { lng: parseFloat(point.lng), lat: parseFloat(point.lat) };
    }
    if (point.longitude !== undefined && point.latitude !== undefined) {
      return { lng: parseFloat(point.longitude), lat: parseFloat(point.latitude) };
    }
    if (Array.isArray(point.coordinates) && point.coordinates.length >= 2) {
      return { lng: parseFloat(point.coordinates[0]), lat: parseFloat(point.coordinates[1]) };
    }
  }

  if (typeof point === 'string') {
    const trimmed = point.trim();

    // Check for WKT format: POINT(lng lat)
    if (trimmed.toUpperCase().startsWith('POINT')) {
      const match = trimmed.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
      if (match) {
        return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
      }
    }

    // Check for PostGIS WKB / EWKB hex string
    if (/^[0-9A-Fa-f]+$/.test(trimmed) && trimmed.length >= 42) {
      try {
        const buf = Buffer.from(trimmed, 'hex');
        const isLittleEndian = buf[0] === 1;
        const geomType = isLittleEndian ? buf.readUInt32LE(1) : buf.readUInt32BE(1);
        const hasSrid = (geomType & 0x20000000) !== 0;
        const offset = hasSrid ? 9 : 5;
        const lng = isLittleEndian ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset);
        const lat = isLittleEndian ? buf.readDoubleLE(offset + 8) : buf.readDoubleBE(offset + 8);
        if (!isNaN(lng) && !isNaN(lat)) {
          return { lng, lat };
        }
      } catch (err) {
        console.warn('[MatchingService] Error parsing WKB hex point:', err.message);
      }
    }
  }

  return null;
}

/**
 * Calculates Great-Circle Geodesic Distance between two coordinates in meters (Haversine formula)
 * Equivalent to PostGIS ST_Distance(geography, geography).
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    return Infinity;
  }
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Calculates perpendicular/shortest distance in meters from a point P to a route corridor line segment AB.
 * Supports campus carpooling where students can be picked up or dropped off anywhere along the corridor
 * between Home/Landmark and GEHU Campus.
 */
export function distanceToSegmentMeters(pLat, pLng, aLat, aLng, bLat, bLng) {
  if (pLat === undefined || pLng === undefined || aLat === undefined || aLng === undefined) {
    return Infinity;
  }
  // If destination is not provided, fall back to direct distance to origin
  if (bLat === undefined || bLng === undefined || (aLat === bLat && aLng === bLng)) {
    return haversineDistanceMeters(pLat, pLng, aLat, aLng);
  }

  const R = 6371000;
  const toRad = Math.PI / 180;
  const midLat = ((aLat + bLat) / 2) * toRad;
  const cosLat = Math.cos(midLat);

  // Local metric projection centered at A (0,0)
  const ax = 0, ay = 0;
  const bx = (bLng - aLng) * toRad * R * cosLat;
  const by = (bLat - aLat) * toRad * R;
  const px = (pLng - aLng) * toRad * R * cosLat;
  const py = (pLat - aLat) * toRad * R;

  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;

  if (abLenSq === 0) {
    return Math.round(Math.sqrt(px * px + py * py));
  }

  // Projection fraction t of point P onto line segment AB
  let t = ((px - ax) * abx + (py - ay) * aby) / abLenSq;
  t = Math.max(0, Math.min(1, t)); // Clamped to strictly between A and B

  // Projected nearest point on segment
  const closestX = ax + t * abx;
  const closestY = ay + t * aby;
  const dx = px - closestX;
  const dy = py - closestY;

  return Math.round(Math.sqrt(dx * dx + dy * dy));
}


/**
 * Evaluates Mutual / Bidirectional Gender Preference
 * As mandated in SRS Section 5.3 & TEST_PLAN.md:
 * 1. rider: none x driver: none -> Pass
 * 2. rider: same x driver: none -> Pass ONLY if riderGender === driverGender
 * 3. rider: none x driver: same -> Pass ONLY if riderGender === driverGender
 * 4. rider: same x driver: same -> Pass ONLY if riderGender === driverGender
 */
export function isGenderCompatible(riderPref, driverPref, riderGender, driverGender) {
  const normRiderPref = riderPref === 'same_gender_only' ? 'same_gender_only' : 'no_preference';
  const normDriverPref = driverPref === 'same_gender_only' ? 'same_gender_only' : 'no_preference';

  // If both have no preference, match unconditionally
  if (normRiderPref === 'no_preference' && normDriverPref === 'no_preference') {
    return true;
  }

  // Either one or both require same gender:
  const rGen = riderGender ? String(riderGender).trim().toLowerCase() : null;
  const dGen = driverGender ? String(driverGender).trim().toLowerCase() : null;

  if (!rGen || !dGen) {
    // If gender information is not specified for either party, cannot satisfy "same gender only" restriction
    return false;
  }

  return rGen === dGen;
}

/**
 * Robust Local String/Token Similarity Fallback
 * Used when Python ML microservice is unreachable or exceeds 2-second timeout.
 * Computes token-level Jaccard overlap + normalized edit distance.
 */
export function computeLocalStringSimilarity(queryText, candidateText) {
  if (!queryText || !candidateText) return 0.0;

  // Landmark aliases mapping in Dehradun
  const normalizeAliases = (str) =>
    str.toLowerCase()
      .replace(/ghanta\s*ghar/g, 'clock tower')
      .replace(/inter\s*state\s*bus\s*(terminal|stand)/g, 'isbt')
      .replace(/graphic\s*era\s*(hill\s*)?university/g, 'gehu')
      .replace(/turner\s*road/g, 'clement town');

  const normQ = normalizeAliases(queryText);
  const normC = normalizeAliases(candidateText);

  // Generic stop words in location descriptions that carry little distinguishing value
  const stopWords = new Set([
    'dehradun', 'doon', 'uttarakhand', 'road', 'rd', 'chowk', 'stand',
    'near', 'opp', 'opposite', 'beside', 'campus', 'bypass', 'the', 'in', 'at'
  ]);

  const tokenize = (str) =>
    str.replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

  const qAll = tokenize(normQ);
  const cAll = tokenize(normC);

  if (qAll.length === 0 || cAll.length === 0) return 0.0;

  // Focus primarily on landmark keywords
  const qCore = qAll.filter((t) => !stopWords.has(t));
  const cCore = cAll.filter((t) => !stopWords.has(t));

  const qTokens = qCore.length > 0 ? qCore : qAll;
  const cTokens = cCore.length > 0 ? cCore : cAll;
  const cSet = new Set(cTokens);

  let coreMatches = 0;
  for (const token of qTokens) {
    if (cSet.has(token)) {
      coreMatches += 1;
    } else {
      for (const cToken of cSet) {
        if (cToken.includes(token) || token.includes(cToken)) {
          coreMatches += 0.5;
          break;
        }
      }
    }
  }

  // Query coverage & Dice similarity
  const queryCoverage = coreMatches / qTokens.length;
  const dice = (2 * coreMatches) / (qTokens.length + cTokens.length);

  // Bigram / phrase matching bonus (e.g. 'clock tower')
  let phraseBonus = 0;
  for (let i = 0; i <= qTokens.length - 2; i++) {
    const biGram = qTokens[i] + ' ' + qTokens[i + 1];
    if (normC.includes(biGram)) {
      phraseBonus += 0.25;
      break;
    }
  }

  const rawScore = (queryCoverage * 0.55) + (dice * 0.25) + phraseBonus;
  return Math.min(1.0, Math.round(Math.max(0.0, rawScore) * 100) / 100);
}


/**
 * Batched Semantic Address Similarity
 * Calls Python ML Microservice with 2-second AbortController timeout.
 * Gracefully falls back to local string similarity without throwing errors.
 * 
 * @param {string} queryAddress
 * @param {string[]} candidateAddresses
 * @returns {Promise<number[]>} Array of similarity scores (0.0 to 1.0)
 */
export async function computeSemanticSimilarities(queryAddress, candidateAddresses) {
  if (!candidateAddresses || candidateAddresses.length === 0) return [];
  if (!queryAddress) return candidateAddresses.map(() => 0.5);

  const fallbackScores = () =>
    candidateAddresses.map((cand) => computeLocalStringSimilarity(queryAddress, cand));

  // If node-fetch or global fetch is available
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);

    const res = await fetch(`${ML_SERVICE_URL}/embed-similarity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query_text: queryAddress,
        candidate_texts: candidateAddresses
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.results)) {
        return data.results.map((r) => Math.max(0.0, Math.min(1.0, Number(r.similarity_score) || 0.0)));
      }
    }
  } catch (err) {
    // Timeout or network connection error -> Graceful degradation to local string similarity
    // Search NEVER breaks or blocks!
    // console.log(`[MatchingService] Notice: ML microservice offline or timeout (>2s), using local similarity engine.`);
  }

  return fallbackScores();
}

/**
 * Normalizes user composite rating to 0.0 - 1.0 scale
 * 5.0 -> 1.0, 1.0 -> 0.2
 */
export function normalizeRating(compositeRating) {
  const rating = compositeRating !== undefined && compositeRating !== null ? parseFloat(compositeRating) : 5.0;
  return Math.max(0.2, Math.min(1.0, rating / 5.0));
}

/**
 * Normalizes fuel share price to 0.0 - 1.0 score
 * Free rides (₹0 or null) get the maximum price score (1.0).
 * Paid rides are scored inversely: cheaper is higher score.
 * Formula benchmarked for college commutes (₹20 to ₹150 range).
 */
export function normalizePriceScore(pricePerSeat) {
  if (pricePerSeat === null || pricePerSeat === undefined || parseFloat(pricePerSeat) <= 0) {
    return 1.0; // Free rides receive highest price score
  }
  const price = parseFloat(pricePerSeat);
  // Scale against ₹150 max typical campus fare in Dehradun
  return Math.max(0.0, Math.min(1.0, 1 - (price / 150)));
}

/**
 * 50/50 Weighted Score-Level Fusion Ranking
 * Final Score = (0.5 * normalized_rating) + (0.5 * normalized_price_score)
 * As defined in SRS PRD Section 5.3 & ARCHITECTURE.md Section 4
 */
export function calculateFusionScore(normalizedRating, normalizedPriceScore) {
  const score = (0.5 * normalizedRating) + (0.5 * normalizedPriceScore);
  return Math.round(score * 1000) / 1000;
}

/**
 * Full Matching Pipeline Orchestrator
 * Performs:
 * 1. PostGIS Detour Proximity Filter
 * 2. Mutual Gender Filter & Transparent Fallback Tracking
 * 3. ML Semantic Address Similarity (with 2s timeout & local fallback)
 * 4. 50/50 Weighted Score-Level Fusion
 * 5. Deterministic Tie-Breaking & Descending Sorting
 * 
 * @param {Array} candidateRides - Raw rides retrieved from database
 * @param {Object} queryParams - Search parameters
 * @returns {Promise<{ rankedRides: Array, excludedByGenderCount: number }>}
 */
export async function rankCandidateRides(candidateRides, queryParams) {
  const {
    pickup_lat,
    pickup_lng,
    pickup_address_text,
    max_detour_meters = 2000,
    gender_preference = 'no_preference',
    rider_gender = null,
    commute_direction = 'all',
    current_user_id = null
  } = queryParams;

  const pickupLat = pickup_lat !== undefined ? parseFloat(pickup_lat) : null;
  const pickupLng = pickup_lng !== undefined ? parseFloat(pickup_lng) : null;
  // Reasonable student commute detour threshold (default 1.5km, capped at 3km)
  const maxDetour = Math.min(3000, Math.max(500, parseFloat(max_detour_meters) || 1500));

  let excludedByGenderCount = 0;
  const proximityFiltered = [];

  // Campus anchor coords
  const GEHU_CAMPUS_LAT = 30.2704;
  const GEHU_CAMPUS_LNG = 77.9944;

  // Step 1: Spatial Route Corridor Detour Filter
  for (const ride of candidateRides) {
    const originCoords = parseCoordinates(ride.origin_point);
    const destCoords = parseCoordinates(ride.destination_point) || { lat: GEHU_CAMPUS_LAT, lng: GEHU_CAMPUS_LNG };

    if (!originCoords) continue;

    // Determine ride direction:
    // If origin is near GEHU (within 500m), it's "from_campus" (heading home)
    // If destination is near GEHU, it's "to_campus" (heading to college)
    const distOriginToCampus = haversineDistanceMeters(originCoords.lat, originCoords.lng, GEHU_CAMPUS_LAT, GEHU_CAMPUS_LNG);
    const rideDirection = distOriginToCampus < 600 ? 'from_campus' : 'to_campus';

    if (commute_direction && commute_direction !== 'all' && commute_direction !== rideDirection) {
      continue; // Direction mismatch
    }

    let detourMeters = 0;
    if (pickupLat !== null && pickupLng !== null) {
      // Calculate shortest distance from rider's pickup/dropoff point to the driver's route corridor
      detourMeters = distanceToSegmentMeters(
        pickupLat, pickupLng,
        originCoords.lat, originCoords.lng,
        destCoords.lat, destCoords.lng
      );

      if (detourMeters > maxDetour) {
        continue; // Exceeds corridor detour budget
      }
    }

    // Step 2: Mutual Gender Filter
    const driverGender = ride.users?.gender || ride.driver_gender || null;
    const isCompatible = isGenderCompatible(
      gender_preference,
      ride.gender_preference,
      rider_gender,
      driverGender
    );

    if (!isCompatible) {
      excludedByGenderCount++;
      continue;
    }

    proximityFiltered.push({
      ...ride,
      _parsed_origin: originCoords,
      _parsed_dest: destCoords,
      _ride_direction: rideDirection,
      detour_distance_meters: detourMeters
    });
  }

  if (proximityFiltered.length === 0) {
    return { rankedRides: [], excludedByGenderCount };
  }

  // Step 3: Semantic Address Similarity (batched with 2s timeout & local fallback)
  const candidateAddresses = proximityFiltered.map((r) => r.origin_address_text || '');
  const similarityScores = await computeSemanticSimilarities(pickup_address_text, candidateAddresses);

  // Step 4: 50/50 Weighted Score-Level Fusion Scoring
  const ranked = proximityFiltered.map((ride, idx) => {
    const compositeRating = ride.users?.composite_rating ?? 5.0;
    const normRating = normalizeRating(compositeRating);
    const normPrice = normalizePriceScore(ride.price_per_seat);
    const fusionScore = calculateFusionScore(normRating, normPrice);
    const semanticSim = similarityScores[idx] !== undefined ? similarityScores[idx] : 0.5;

    // Qualitative Match Quality badge
    let matchQuality = 'Good';
    if (fusionScore >= 0.85) matchQuality = 'Excellent';
    else if (fusionScore < 0.65) matchQuality = 'Fair';

    const isOwnRide = Boolean(current_user_id && ride.driver_id === current_user_id);

    return {
      id: ride.id,
      driver_id: ride.driver_id,
      is_own_ride: isOwnRide,
      commute_direction: ride._ride_direction,
      driver: {
        id: ride.users?.id || ride.driver_id,
        name: ride.users?.name || 'Campus Peer',
        branch: ride.users?.branch || 'Graphic Era Hill University',
        course: ride.users?.course || 'Student',
        profile_photo_url: ride.users?.profile_photo_url || null,
        composite_rating: compositeRating,
        completed_rides_count: ride.users?.completed_rides_count || 0,
        gender: ride.users?.gender || null
      },
      vehicle: ride.vehicles || {
        vehicle_type: 'car',
        vehicle_number: 'Campus Commute',
        seat_capacity: ride.available_seats
      },
      origin_point: ride.origin_point,
      origin_coords: ride._parsed_origin,
      origin_address_text: ride.origin_address_text,
      destination_point: ride.destination_point,
      destination_coords: ride._parsed_dest,
      destination_address_text: ride._ride_direction === 'from_campus'
        ? (ride.destination_address_text || 'Home / Off-Campus Dropoff')
        : 'Graphic Era Hill University (GEHU Campus), Dehradun',
      departure_time: ride.departure_time,
      available_seats: ride.available_seats,
      price_per_seat: ride.price_per_seat,
      is_free: ride.price_per_seat === null || parseFloat(ride.price_per_seat) === 0,
      gender_preference: ride.gender_preference,
      status: ride.status,
      // Milestone 3 Metrics
      detour_distance_meters: ride.detour_distance_meters,
      detour_distance_km: (ride.detour_distance_meters / 1000).toFixed(1) + ' km',
      semantic_similarity: semanticSim,
      normalized_rating: normRating,
      normalized_price_score: normPrice,
      final_score: fusionScore,
      match_quality: matchQuality
    };
  });

  // Step 5: Sort Descending by final_score (Tie-break by closest detour distance, then semantic similarity)
  ranked.sort((a, b) => {
    if (b.final_score !== a.final_score) {
      return b.final_score - a.final_score;
    }
    if (a.detour_distance_meters !== b.detour_distance_meters) {
      return a.detour_distance_meters - b.detour_distance_meters;
    }
    return b.semantic_similarity - a.semantic_similarity;
  });

  return { rankedRides: ranked, excludedByGenderCount };
}

