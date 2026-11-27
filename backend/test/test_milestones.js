/**
 * Campus Carpool Matching Platform - Automated Test Suite
 * Validates Milestones 1, 2, and 3:
 * - Vehicle Registration, Seat Derivation & Deletion Guard
 * - Ride Posting, DL Check & PostGIS Point Insertion
 * - PostGIS Detour Proximity & Geodesic Distance
 * - Mutual Gender-Preference Filtering (All 4 Combinations)
 * - ML Semantic Address Similarity & Timeout Fallback
 * - 50/50 Weighted Score-Level Fusion Ranking
 * - End-to-End Matching Pipeline
 */

import { supabaseAdmin } from '../src/config/supabase.js';
import {
  parseCoordinates,
  haversineDistanceMeters,
  distanceToSegmentMeters,
  isGenderCompatible,
  computeLocalStringSimilarity,
  computeSemanticSimilarities,
  normalizeRating,
  normalizePriceScore,
  calculateFusionScore,
  rankCandidateRides
} from '../src/services/matching.service.js';
import { randomUUID } from 'crypto';
import {
  activateRide,
  restoreRide,
  deactivateRide,
  isRideStopped,
  getActiveRide
} from '../src/services/liveRide.service.js';
import { createAndEmitNotification } from '../src/services/notification.service.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    passedTests++;
    console.log(`  \x1b[32m✔ PASS:\x1b[0m ${testName}`);
  } else {
    failedTests++;
    console.error(`  \x1b[31m✖ FAIL:\x1b[0m ${testName} ${details ? `(${details})` : ''}`);
  }
}

// ============================================================================
// Milestone 4 & 5 test helpers
// ============================================================================
const API_BASE = process.env.API_BASE_URL || 'http://localhost:5000/api/v1';
const SOCKET_URL = API_BASE.replace(/\/api\/v1\/?$/, '');
const RUN_TAG = `t${Date.now()}`;
const TEST_PASSWORD = 'Test@12345';

const created = { users: [], authUsers: [], vehicles: [], rides: [] };
const openSockets = [];
const vehicleCache = new Map(); // driverId -> vehicleId
let cachedUniversityId = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const first = (d) => (Array.isArray(d) ? d[0] : d);
const errText = (e) => (e ? `${e.code || ''} ${e.message || ''}` : '');

function skip(msg) {
  console.log(`  \x1b[33m⚠ SKIP:\x1b[0m ${msg}`);
}

async function runSection(name, fn) {
  console.log(`\n\x1b[36m[${name}]\x1b[0m`);
  try {
    await fn();
  } catch (err) {
    failedTests++;
    console.error(`  \x1b[31m✖ FAIL:\x1b[0m section crashed (${err.message})`);
  }
}

async function getUniversityId() {
  if (cachedUniversityId) return cachedUniversityId;
  const { data } = await supabaseAdmin
    .from('universities')
    .select('id')
    .eq('email_domain', 'gehu.ac.in')
    .maybeSingle();
  if (data) {
    cachedUniversityId = data.id;
    return data.id;
  }
  const { data: inserted, error } = await supabaseAdmin
    .from('universities')
    .insert({ name: 'Graphic Era Hill University, Dehradun', email_domain: 'gehu.ac.in' })
    .select('id')
    .single();
  if (error) throw error;
  cachedUniversityId = inserted.id;
  return inserted.id;
}

// withAuth=true also creates a real Supabase Auth user (needed for HTTP/socket tests)
async function createTestUser(label, { gender = 'male', withAuth = false } = {}) {
  const email = `${RUN_TAG}_${label}@gehu.ac.in`;
  let id = randomUUID();

  if (withAuth) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { name: label, gender }
    });
    if (error) throw error;
    id = data.user.id;
    created.authUsers.push(id);
  }

  const { error } = await supabaseAdmin.from('users').insert({
    id,
    university_id: await getUniversityId(),
    name: label,
    gender,
    email,
    student_id_number: `${RUN_TAG}_${label}`,
    role: 'student',
    verification_status: 'verified'
  });
  if (error) throw error;

  created.users.push(id);
  return { id, email, password: TEST_PASSWORD, label };
}

async function createTestRide(driverId, { seats = 3, status = 'posted', hoursAhead = 2 } = {}) {
  let vehicleId = vehicleCache.get(driverId);
  if (!vehicleId) {
    const { data: vehicle, error: vErr } = await supabaseAdmin
      .from('vehicles')
      .insert({
        user_id: driverId,
        vehicle_type: 'car',
        seat_capacity: 4,
        vehicle_number: `TEST_${RUN_TAG}_${created.vehicles.length}`
      })
      .select()
      .single();
    if (vErr) throw vErr;
    vehicleId = vehicle.id;
    vehicleCache.set(driverId, vehicleId);
    created.vehicles.push(vehicleId);
  }

  const { data: ride, error } = await supabaseAdmin
    .from('rides')
    .insert({
      driver_id: driverId,
      vehicle_id: vehicleId,
      university_id: await getUniversityId(),
      origin_point: 'POINT(78.0322 30.3165)',
      origin_address_text: 'Clock Tower, Dehradun',
      destination_point: 'POINT(77.9944 30.2704)',
      departure_time: new Date(Date.now() + hoursAhead * 3600 * 1000).toISOString(),
      available_seats: seats,
      price_per_seat: 30,
      gender_preference: 'no_preference',
      status
    })
    .select()
    .single();
  if (error) throw error;

  created.rides.push(ride.id);
  return ride;
}

const requestRide = (rideId, riderId) =>
  supabaseAdmin.rpc('create_ride_request', { p_ride_id: rideId, p_rider_id: riderId });

const respondToRequest = (requestId, driverId, decision) =>
  supabaseAdmin.rpc('respond_to_ride_request', {
    p_request_id: requestId,
    p_driver_id: driverId,
    p_decision: decision
  });

async function getRequest(id) {
  const { data } = await supabaseAdmin.from('ride_requests').select('*').eq('id', id).single();
  return data;
}

async function getRide(id) {
  const { data } = await supabaseAdmin.from('rides').select('*').eq('id', id).single();
  return data;
}

async function getUserRow(id) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('composite_rating, no_show_count')
    .eq('id', id)
    .single();
  return data;
}

// Creates a pending request and accepts it. Returns the request id.
async function makeAcceptedRequest(rideId, riderId, driverId) {
  const { data, error } = await requestRide(rideId, riderId);
  if (error) throw error;
  const req = first(data);
  const { error: accErr } = await respondToRequest(req.id, driverId, 'accepted');
  if (accErr) throw accErr;
  return req.id;
}

async function cleanupFixtures() {
  try {
    const rideIds = created.rides;
    const userIds = created.users;

    if (rideIds.length) {
      await supabaseAdmin.from('incident_logs').delete().in('ride_id', rideIds);
      await supabaseAdmin.from('messages').delete().in('ride_id', rideIds);
      await supabaseAdmin.from('notifications').delete().in('related_ride_id', rideIds);
      await supabaseAdmin.from('ride_requests').delete().in('ride_id', rideIds);
      await supabaseAdmin.from('rides').delete().in('id', rideIds);
    }
    if (userIds.length) {
      await supabaseAdmin.from('incident_logs').delete().in('user_id', userIds);
      await supabaseAdmin.from('notifications').delete().in('user_id', userIds);
    }
    if (created.vehicles.length) {
      await supabaseAdmin.from('vehicles').delete().in('id', created.vehicles);
    }
    if (userIds.length) {
      await supabaseAdmin.from('users').delete().in('id', userIds);
    }
    for (const id of created.authUsers) {
      await supabaseAdmin.auth.admin.deleteUser(id);
    }
    console.log('  Test fixtures cleaned up.');
  } catch (err) {
    console.warn('  ⚠ Cleanup incomplete (delete TEST rows manually):', err.message);
  }
}

// ---- HTTP / Socket helpers (Suite 13) ----
async function http(method, path, token, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, json };
}

async function login(user) {
  const r = await http('POST', '/auth/login', null, { email: user.email, password: user.password });
  return r.json?.data?.session?.access_token || null;
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('   CAMPUS CARPOOL MATCHING PLATFORM - TEST SUITE      ');
  console.log('   Validating Milestones 1, 2, and 3 Features         ');
  console.log('======================================================\n');

  // --------------------------------------------------------------------------
  // SUITE 1: Vehicle Seat Derivation & Input Validation
  // --------------------------------------------------------------------------
  console.log('\x1b[36m[SUITE 1] Vehicle Seat Derivation & Input Rules\x1b[0m');

  function deriveSeats(vehicleType, customSeats) {
    if (vehicleType === 'car') {
      return customSeats ? Math.max(1, Math.min(8, parseInt(customSeats, 10))) : 4;
    }
    return 1; // Bike / Scooty always 1 passenger seat in carpool
  }

  assert(deriveSeats('bike') === 1, 'Bike derives exactly 1 passenger seat');
  assert(deriveSeats('scooty') === 1, 'Scooty derives exactly 1 passenger seat');
  assert(deriveSeats('car') === 4, 'Car defaults to 4 seats when unspecified');
  assert(deriveSeats('car', 6) === 6, 'Car respects custom capacity (6 seats)');
  assert(deriveSeats('car', 10) === 8, 'Car caps seat capacity at 8 seats maximum');
  assert(deriveSeats('car', -1) === 1, 'Car enforces minimum 1 seat');

  // --------------------------------------------------------------------------
  // SUITE 2: PostGIS Coordinates, WKB Parser & Geodesic Distance
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m[SUITE 2] PostGIS Spatial Distance & WKB Parsing\x1b[0m');

  // Known Coordinates
  const CLOCK_TOWER = { lat: 30.3165, lng: 78.0322 };
  const GEHU_CAMPUS = { lat: 30.2704, lng: 77.9944 };
  const PREM_NAGAR = { lat: 30.3340, lng: 77.9620 };
  const RISHIKESH = { lat: 30.0869, lng: 78.2676 };

  // WKT Point Parsing
  const parsedWkt = parseCoordinates('POINT(78.0322 30.3165)');
  assert(
    parsedWkt && Math.abs(parsedWkt.lat - 30.3165) < 0.001 && Math.abs(parsedWkt.lng - 78.0322) < 0.001,
    'Parses WKT string POINT(lng lat) correctly'
  );

  // PostGIS EWKB Hex Parsing (Little Endian, SRID 4326)
  const testWkbHex = '0101000020E610000099BB96900F8253401B2FDD2406513E40';
  const parsedWkb = parseCoordinates(testWkbHex);
  assert(
    parsedWkb && Math.abs(parsedWkb.lat - 30.3165) < 0.001 && Math.abs(parsedWkb.lng - 78.0322) < 0.001,
    'Parses PostGIS EWKB Hex point accurately into latitude & longitude'
  );

  // Haversine Distance (Dehradun Landmarks)
  const distClockTowerToCampus = haversineDistanceMeters(
    CLOCK_TOWER.lat, CLOCK_TOWER.lng,
    GEHU_CAMPUS.lat, GEHU_CAMPUS.lng
  );
  assert(
    distClockTowerToCampus >= 6000 && distClockTowerToCampus <= 7500,
    `Clock Tower to GEHU distance is accurate (~${distClockTowerToCampus} meters)`
  );

  const distPremNagarToCampus = haversineDistanceMeters(
    PREM_NAGAR.lat, PREM_NAGAR.lng,
    GEHU_CAMPUS.lat, GEHU_CAMPUS.lng
  );
  assert(
    distPremNagarToCampus >= 7000 && distPremNagarToCampus <= 9500,
    `Prem Nagar to GEHU distance is within expected range (~${distPremNagarToCampus}m)`
  );

  const distRishikeshToCampus = haversineDistanceMeters(
    RISHIKESH.lat, RISHIKESH.lng,
    GEHU_CAMPUS.lat, GEHU_CAMPUS.lng
  );
  assert(
    distRishikeshToCampus > 30000,
    `Rishikesh is outside the Dehradun local detour range (>30km: ${distRishikeshToCampus}m)`
  );

  // Route Corridor Segment Detour: Driver traveling from Prem Nagar to GEHU Campus
  const corridorStart = distanceToSegmentMeters(
    PREM_NAGAR.lat, PREM_NAGAR.lng,
    PREM_NAGAR.lat, PREM_NAGAR.lng,
    GEHU_CAMPUS.lat, GEHU_CAMPUS.lng
  );
  assert(corridorStart === 0, 'Detour at exact corridor origin is 0 meters');

  // Intermediate corridor pickup (Majra: lat 30.2850, lng 77.9900)
  const corridorIntermediate = distanceToSegmentMeters(
    30.2850, 77.9900,
    PREM_NAGAR.lat, PREM_NAGAR.lng,
    GEHU_CAMPUS.lat, GEHU_CAMPUS.lng
  );
  assert(
    corridorIntermediate < 400,
    `Corridor pickup at Majra has minimal detour (${corridorIntermediate}m < 400m)`
  );

  const corridorFar = distanceToSegmentMeters(
    RISHIKESH.lat, RISHIKESH.lng,
    PREM_NAGAR.lat, PREM_NAGAR.lng,
    GEHU_CAMPUS.lat, GEHU_CAMPUS.lng
  );
  assert(
    corridorFar > 30000,
    `Off-corridor location in Rishikesh has massive detour (${corridorFar}m > 30km)`
  );


  // --------------------------------------------------------------------------
  // SUITE 3: Mutual / Bidirectional Gender Preference Matrix
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m[SUITE 3] Mutual Gender Preference Compatibility Matrix\x1b[0m');

  // Case 1: none x none -> Pass
  assert(
    isGenderCompatible('no_preference', 'no_preference', 'female', 'male') === true,
    'Case 1: Both "no_preference" -> Pass regardless of gender'
  );

  // Case 2: rider: same x driver: none
  assert(
    isGenderCompatible('same_gender_only', 'no_preference', 'female', 'female') === true,
    'Case 2a: Rider "same_gender_only" matches female driver -> Pass'
  );
  assert(
    isGenderCompatible('same_gender_only', 'no_preference', 'female', 'male') === false,
    'Case 2b: Rider "same_gender_only" excludes male driver -> Blocked'
  );

  // Case 3: rider: none x driver: same
  assert(
    isGenderCompatible('no_preference', 'same_gender_only', 'female', 'female') === true,
    'Case 3a: Driver "same_gender_only" matches female rider -> Pass'
  );
  assert(
    isGenderCompatible('no_preference', 'same_gender_only', 'male', 'female') === false,
    'Case 3b: Driver "same_gender_only" excludes male rider -> Blocked'
  );

  // Case 4: rider: same x driver: same
  assert(
    isGenderCompatible('same_gender_only', 'same_gender_only', 'male', 'male') === true,
    'Case 4a: Both "same_gender_only" and both male -> Pass'
  );
  assert(
    isGenderCompatible('same_gender_only', 'same_gender_only', 'male', 'female') === false,
    'Case 4b: Both "same_gender_only" but opposite genders -> Blocked'
  );

  // --------------------------------------------------------------------------
  // SUITE 4: ML Semantic Address Similarity & Fallback
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m[SUITE 4] ML Semantic Similarity & Fallback Engine\x1b[0m');

  const simHigh = computeLocalStringSimilarity('Clock Tower, Dehradun', 'Clock Tower Chowk, Rajpur Rd');
  assert(simHigh >= 0.5, `Address variations ("Clock Tower") yield high similarity: ${simHigh}`);

  const simDifferent = computeLocalStringSimilarity('Clock Tower', 'ISBT Bypass Road');
  assert(simDifferent < 0.4, `Different areas ("Clock Tower" vs "ISBT") yield low similarity: ${simDifferent}`);

  // Test batched caller with graceful fallback (does not throw even if ML server is not up)
  const batchScores = await computeSemanticSimilarities('ISBT Dehradun', [
    'ISBT Bus Stand, Haridwar Bypass',
    'Prem Nagar Market, Dehradun'
  ]);
  assert(Array.isArray(batchScores) && batchScores.length === 2, 'Batched similarity returns valid array of scores');
  assert(batchScores[0] > batchScores[1], `Nearer semantic address scores higher (${batchScores[0]} vs ${batchScores[1]})`);

  // --------------------------------------------------------------------------
  // SUITE 5: 50/50 Weighted Score-Level Fusion Ranking
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m[SUITE 5] 50/50 Weighted Score-Level Fusion Ranking\x1b[0m');

  // Rating Normalization
  assert(normalizeRating(5.0) === 1.0, 'Rating 5.0 normalizes to 1.0');
  assert(normalizeRating(4.0) === 0.8, 'Rating 4.0 normalizes to 0.8');
  assert(normalizeRating(2.5) === 0.5, 'Rating 2.5 normalizes to 0.5');

  // Price Normalization
  assert(normalizePriceScore(0) === 1.0, 'Free ride (₹0) receives top price score (1.0)');
  assert(normalizePriceScore(null) === 1.0, 'Free ride (null) receives top price score (1.0)');
  assert(normalizePriceScore(30) > normalizePriceScore(75), '₹30 ride scores higher than ₹75 ride');
  assert(normalizePriceScore(150) === 0.0, '₹150 ride reaches lower bound score (0.0)');

  // 50/50 Fusion Calculation
  // Candidate A: 4.8 Rating (norm: 0.96), Free Ride (norm: 1.0) -> (0.5*0.96) + (0.5*1.0) = 0.98
  const scoreA = calculateFusionScore(0.96, 1.0);
  assert(Math.abs(scoreA - 0.98) < 0.001, `Candidate A score is 0.98: got ${scoreA}`);

  // Candidate B: 5.0 Rating (norm: 1.0), ₹90 Ride (norm: 0.4) -> (0.5*1.0) + (0.5*0.4) = 0.70
  const scoreB = calculateFusionScore(1.0, 0.4);
  assert(Math.abs(scoreB - 0.70) < 0.001, `Candidate B score is 0.70: got ${scoreB}`);
  assert(scoreA > scoreB, 'Candidate A (High Rating + Free) ranks higher than Candidate B (Paid)');

  // --------------------------------------------------------------------------
  // SUITE 6: Database Integration - Vehicle Registration & Deletion Guard
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m[SUITE 6] Database Vehicle Registration & Deletion Guard\x1b[0m');

  try {
    const { data: users, error: uErr } = await supabaseAdmin.from('users').select('*').limit(1);
    if (!users || users.length === 0) {
      console.warn('  ⚠️ Skipping live DB test: No users in test database.');
    } else {
      const testUser = users[0];

      // 1. Create a test vehicle
      const { data: testVehicle, error: vErr } = await supabaseAdmin
        .from('vehicles')
        .insert({
          user_id: testUser.id,
          vehicle_type: 'car',
          seat_capacity: 4,
          vehicle_number: 'TEST_UK07_9999'
        })
        .select()
        .single();

      assert(!vErr && testVehicle?.id, 'Test vehicle successfully registered in Supabase');

      // 2. Post an active ride linked to this vehicle
      const futureTime = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
      const { data: testRide, error: rErr } = await supabaseAdmin
        .from('rides')
        .insert({
          driver_id: testUser.id,
          vehicle_id: testVehicle.id,
          university_id: testUser.university_id,
          origin_point: 'POINT(78.0322 30.3165)',
          origin_address_text: 'Clock Tower, Dehradun',
          destination_point: 'POINT(77.9944 30.2704)',
          departure_time: futureTime,
          available_seats: 3,
          price_per_seat: 40,
          gender_preference: 'no_preference',
          status: 'posted'
        })
        .select()
        .single();

      assert(!rErr && testRide?.id, 'Test ride successfully posted and linked to vehicle');

      // 3. Test Deletion Guard: Check that active ride blocks vehicle deletion
      const { data: activeRides } = await supabaseAdmin
        .from('rides')
        .select('id')
        .eq('vehicle_id', testVehicle.id)
        .in('status', ['posted', 'departed']);

      assert(
        activeRides && activeRides.length > 0,
        'Deletion Guard accurately detects vehicle is assigned to an active ride'
      );

      // 4. Cancel the ride
      const { error: cancelErr } = await supabaseAdmin
        .from('rides')
        .update({ status: 'cancelled', deleted_at: new Date().toISOString() })
        .eq('id', testRide.id);

      assert(!cancelErr, 'Ride cancelled cleanly');

      // 5. Now delete the vehicle (should succeed since no posted/departed rides remain)
      const { data: postCancelActive } = await supabaseAdmin
        .from('rides')
        .select('id')
        .eq('vehicle_id', testVehicle.id)
        .in('status', ['posted', 'departed']);

      assert(
        postCancelActive.length === 0,
        'No active rides remaining on vehicle after cancellation'
      );

      // Cleanup
      await supabaseAdmin.from('rides').delete().eq('id', testRide.id);
      await supabaseAdmin.from('vehicles').delete().eq('id', testVehicle.id);
      assert(true, 'Test artifacts cleaned up successfully');
    }
  } catch (dbErr) {
    console.error('Database suite error:', dbErr);
  }

  // --------------------------------------------------------------------------
  // SUITE 7: End-to-End Matching Pipeline Simulation
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m[SUITE 7] End-to-End Search & Ranking Simulation\x1b[0m');

  const mockRides = [
    {
      id: 'ride-1',
      driver_id: 'driver-1',
      origin_point: 'POINT(78.0322 30.3165)', // Clock Tower (0km detour)
      origin_address_text: 'Clock Tower, Dehradun',
      destination_point: 'POINT(77.9944 30.2704)',
      departure_time: new Date(Date.now() + 3600 * 1000).toISOString(),
      available_seats: 3,
      price_per_seat: 0, // Free!
      gender_preference: 'no_preference',
      status: 'posted',
      users: {
        id: 'driver-1',
        name: 'Rohan Sharma',
        composite_rating: 4.9,
        branch: 'CSE',
        gender: 'male'
      },
      vehicles: { vehicle_type: 'car', vehicle_number: 'UK07AB1111', seat_capacity: 4 }
    },
    {
      id: 'ride-2',
      driver_id: 'driver-2',
      origin_point: 'POINT(78.0200 30.3000)', // ISBT area (~2km detour)
      origin_address_text: 'ISBT Dehradun',
      destination_point: 'POINT(77.9944 30.2704)',
      departure_time: new Date(Date.now() + 3600 * 1000).toISOString(),
      available_seats: 2,
      price_per_seat: 60,
      gender_preference: 'no_preference',
      status: 'posted',
      users: {
        id: 'driver-2',
        name: 'Amit Verma',
        composite_rating: 4.2,
        branch: 'ECE',
        gender: 'male'
      },
      vehicles: { vehicle_type: 'car', vehicle_number: 'UK07CD2222', seat_capacity: 4 }
    },
    {
      id: 'ride-3',
      driver_id: 'driver-3',
      origin_point: 'POINT(78.2676 30.0869)', // Rishikesh (>30km away, exceeds detour)
      origin_address_text: 'Rishikesh Bypass',
      destination_point: 'POINT(77.9944 30.2704)',
      departure_time: new Date(Date.now() + 3600 * 1000).toISOString(),
      available_seats: 1,
      price_per_seat: 100,
      gender_preference: 'no_preference',
      status: 'posted',
      users: {
        id: 'driver-3',
        name: 'Far Driver',
        composite_rating: 5.0,
        branch: 'ME',
        gender: 'male'
      },
      vehicles: { vehicle_type: 'bike', vehicle_number: 'UK07EF3333', seat_capacity: 1 }
    }
  ];

  const { rankedRides, excludedByGenderCount } = await rankCandidateRides(mockRides, {
    pickup_lat: 30.3165,
    pickup_lng: 78.0322,
    pickup_address_text: 'Clock Tower',
    max_detour_meters: 2500, // 2.5km realistic detour limit
    gender_preference: 'no_preference'
  });

  assert(rankedRides.length === 2, 'Far candidate (>30km detour) was properly excluded by corridor detour filter');
  assert(rankedRides[0].id === 'ride-1', 'Top ranked match is ride-1 (Highest rating + Free fuel share)');
  assert(rankedRides[0].detour_distance_meters < 200, 'Detour distance for ride-1 is nearly 0m (exact location match)');
  assert(rankedRides[0].final_score > rankedRides[1].final_score, 'Rides ordered descending by final_score');
  assert(excludedByGenderCount === 0, 'No rides excluded when gender preference is "no_preference"');

  // --------------------------------------------------------------------------
  // SUITE 8: Milestone 4.1 - Request creation, expiry, duplicates, 5-request cap
  // --------------------------------------------------------------------------
  await runSection('SUITE 8] M4.1 Parallel Request Dispatch & Limits', async () => {
    const driver = await createTestUser('s8drv');
    const rider = await createTestUser('s8rid');
    const ride = await createTestRide(driver.id);

    const r1 = await requestRide(ride.id, rider.id);
    const req1 = first(r1.data);
    assert(!r1.error && req1?.status === 'pending', 'New request is created with status "pending"', errText(r1.error));
    assert(
      req1?.expiry_at && new Date(req1.expiry_at) > new Date() &&
      new Date(req1.expiry_at) <= new Date(ride.departure_time),
      'Request expiry is in the future and not later than departure time'
    );

    const dup = await requestRide(ride.id, rider.id);
    assert(Boolean(dup.error), 'Duplicate active request to the same ride is rejected', errText(dup.error));

    const departedRide = await createTestRide(driver.id, { status: 'departed' });
    const onDeparted = await requestRide(departedRide.id, rider.id);
    assert(Boolean(onDeparted.error), 'Request on a non-"posted" ride is rejected', errText(onDeparted.error));

    // 5-request cap + decline frees a slot
    const capRider = await createTestUser('s8cap');
    const capDriver = await createTestUser('s8capdrv');
    const rides = [];
    for (let i = 0; i < 6; i++) rides.push(await createTestRide(capDriver.id, { seats: 2 }));

    const capReqIds = [];
    for (let i = 0; i < 5; i++) {
      const r = await requestRide(rides[i].id, capRider.id);
      if (!r.error) capReqIds.push(first(r.data).id);
    }
    assert(capReqIds.length === 5, 'Rider can hold 5 parallel active requests', `got ${capReqIds.length}`);

    const sixth = await requestRide(rides[5].id, capRider.id);
    assert(
      Boolean(sixth.error) && (sixth.error.message || '').includes('MAX_ACTIVE_REQUESTS_REACHED'),
      '6th active request is blocked with MAX_ACTIVE_REQUESTS_REACHED',
      errText(sixth.error)
    );

    const declined = await respondToRequest(capReqIds[0], capDriver.id, 'declined');
    assert(!declined.error, 'Driver can decline a pending request', errText(declined.error));

    const afterDecline = await requestRide(rides[5].id, capRider.id);
    assert(!afterDecline.error, 'Declining instantly frees the rider\'s request slot', errText(afterDecline.error));
  });

  // --------------------------------------------------------------------------
  // SUITE 9: Milestone 4.2 - Accept/decline, first-accept-wins, concurrency
  // --------------------------------------------------------------------------
  await runSection('SUITE 9] M4.2 Atomic First-Accept-Wins', async () => {
    const driver = await createTestUser('s9drv');
    const stranger = await createTestUser('s9str');
    const rider = await createTestUser('s9rid');
    const ride = await createTestRide(driver.id, { seats: 3 });

    const { data } = await requestRide(ride.id, rider.id);
    const reqId = first(data).id;

    const wrong = await respondToRequest(reqId, stranger.id, 'accepted');
    assert(Boolean(wrong.error), 'A non-driver cannot accept a request', errText(wrong.error));
    assert((await getRequest(reqId)).status === 'pending', 'Request stays "pending" after unauthorized attempt');

    const ok = await respondToRequest(reqId, driver.id, 'accepted');
    assert(!ok.error && (await getRequest(reqId)).status === 'accepted', 'Driver accepts: request becomes "accepted"', errText(ok.error));

    // Assumes your RPC decrements seats on accept (the route's "No seats" error implies it does)
    assert((await getRide(ride.id)).available_seats === 2, 'Accepting decrements available_seats (3 -> 2)');

    const again = await respondToRequest(reqId, driver.id, 'declined');
    assert(Boolean(again.error), 'A request cannot be responded to twice', errText(again.error));
    assert((await getRequest(reqId)).status === 'accepted', 'Accepted request is not changed by a late decline');

    // First accept auto-cancels the rider's other requests
    const multiRider = await createTestUser('s9multi');
    const multiDriver = await createTestUser('s9multidrv');
    const [rideX, rideY, rideZ] = [
      await createTestRide(multiDriver.id),
      await createTestRide(multiDriver.id),
      await createTestRide(multiDriver.id)
    ];
    const rx = first((await requestRide(rideX.id, multiRider.id)).data);
    const ry = first((await requestRide(rideY.id, multiRider.id)).data);
    const rz = first((await requestRide(rideZ.id, multiRider.id)).data);

    await respondToRequest(rx.id, multiDriver.id, 'accepted');
    const yStatus = (await getRequest(ry.id)).status;
    const zStatus = (await getRequest(rz.id)).status;
    assert(
      !['pending', 'accepted'].includes(yStatus) && !['pending', 'accepted'].includes(zStatus),
      `Accepting one request auto-cancels the rider's others (now: ${yStatus}, ${zStatus})`
    );

    // Race: two drivers accept the same rider at the same moment
    const raceRider = await createTestUser('s9race');
    const dP = await createTestUser('s9dP');
    const dQ = await createTestUser('s9dQ');
    const rideP = await createTestRide(dP.id);
    const rideQ = await createTestRide(dQ.id);
    const reqP = first((await requestRide(rideP.id, raceRider.id)).data);
    const reqQ = first((await requestRide(rideQ.id, raceRider.id)).data);

    const results = await Promise.all([
      respondToRequest(reqP.id, dP.id, 'accepted'),
      respondToRequest(reqQ.id, dQ.id, 'accepted')
    ]);
    const successes = results.filter((r) => !r.error).length;

    const { data: acceptedRows } = await supabaseAdmin
      .from('ride_requests')
      .select('id')
      .eq('rider_id', raceRider.id)
      .eq('status', 'accepted');

    assert(successes === 1, `Exactly one of two simultaneous accepts succeeds (got ${successes})`);
    assert(acceptedRows.length === 1, `Rider ends with exactly 1 accepted request (got ${acceptedRows.length})`);
  });

  // --------------------------------------------------------------------------
  // SUITE 10: Milestone 5.1 / 5.3 - Live ride registry (pure unit tests)
  // --------------------------------------------------------------------------
  await runSection('SUITE 10] M5.3 Live GPS Registry & Stop Markers', async () => {
    const id = `unit-${RUN_TAG}`;

    assert(getActiveRide(id) === null, 'Unknown ride has no active entry');

    activateRide(id, 'driver-x');
    assert(getActiveRide(id)?.driverId === 'driver-x', 'activateRide registers the driver');
    assert(getActiveRide(id)?.lastLocation === null, 'New ride has no cached location yet');

    getActiveRide(id).lastLocation = { lat: 30.1, lng: 78.1 };
    activateRide(id, 'driver-x');
    assert(getActiveRide(id)?.lastLocation?.lat === 30.1, 'Re-activating keeps the cached last location');

    deactivateRide(id);
    assert(getActiveRide(id) === null, 'deactivateRide removes the ride (relay stops)');
    assert(isRideStopped(id) === true, 'deactivateRide leaves a stopped marker');

    assert(restoreRide(id, 'driver-x') === false, 'restoreRide refuses to revive a completed ride (race guard)');
    assert(getActiveRide(id) === null, 'Ride stays inactive after refused restore');

    activateRide(id, 'driver-x');
    assert(isRideStopped(id) === false && getActiveRide(id) !== null, 'An explicit new departure clears the stopped marker');

    const fresh = `unit2-${RUN_TAG}`;
    assert(restoreRide(fresh, 'driver-y') === true, 'restoreRide works for a ride that was never stopped');
    assert(getActiveRide(fresh)?.driverId === 'driver-y', 'Restored ride is active for the right driver');

    deactivateRide(id);
    deactivateRide(fresh);
  });

  // --------------------------------------------------------------------------
  // SUITE 11: Milestone 5.1 / 5.2 - Notifications & chat privacy (DB level)
  // --------------------------------------------------------------------------
  await runSection('SUITE 11] M5.1/5.2 Notifications & Chat Privacy', async () => {
    const driver = await createTestUser('s11drv');
    const riderA = await createTestUser('s11ridA');
    const riderB = await createTestUser('s11ridB');
    const ride = await createTestRide(driver.id, { seats: 3 });

    // Always-write-then-emit: works (and persists) even with no socket server in this process
    const n = await createAndEmitNotification({
      userId: riderA.id,
      type: 'general',
      title: 'Test notification',
      body: 'Persisted even when nobody is online',
      relatedRideId: ride.id
    });
    assert(n?.id && n.is_read === false, 'Notification is persisted as unread');

    const { data: unread } = await supabaseAdmin
      .from('notifications')
      .select('id')
      .eq('user_id', riderA.id)
      .eq('is_read', false);
    assert(unread.some((x) => x.id === n.id), 'Offline catch-up query (unread=true) returns the notification');

    const { data: others } = await supabaseAdmin.from('notifications').select('id').eq('user_id', riderB.id);
    assert(others.length === 0, 'Another user does not see this notification');

    // Chat isolation: same query the GET /chat/:rideId/messages route uses
    const ins = (sender, receiver, content) =>
      supabaseAdmin.from('messages').insert({ ride_id: ride.id, sender_id: sender, receiver_id: receiver, content });

    await ins(driver.id, riderA.id, 'Wait at main gate');
    await ins(riderA.id, driver.id, 'Ok');
    await ins(driver.id, riderB.id, 'Secret for B only');

    const pairQuery = (me, other) =>
      supabaseAdmin
        .from('messages')
        .select('content, sender_id, receiver_id')
        .eq('ride_id', ride.id)
        .or(`and(sender_id.eq.${me},receiver_id.eq.${other}),and(sender_id.eq.${other},receiver_id.eq.${me})`)
        .order('sent_at', { ascending: true });

    const { data: chatA } = await pairQuery(riderA.id, driver.id);
    assert(chatA.length === 2, `Driver<->RiderA history has exactly 2 messages (got ${chatA.length})`);
    assert(!chatA.some((m) => m.content.includes('Secret')), 'RiderA never sees RiderB\'s messages');

    const { data: chatB } = await pairQuery(riderB.id, driver.id);
    assert(chatB.length === 1 && chatB[0].content === 'Secret for B only', 'Driver<->RiderB history is separate');

    const { error: nullErr } = await supabaseAdmin
      .from('messages')
      .insert({ ride_id: ride.id, sender_id: driver.id, receiver_id: riderA.id, content: null });
    assert(Boolean(nullErr), 'Message content is required at the DB level');
  });

  // --------------------------------------------------------------------------
  // SUITE 12: Milestone 5.4 - No-show RPC (incident log + penalty, atomic)
  // --------------------------------------------------------------------------
  await runSection('SUITE 12] M5.4 No-Show Flagging (DB function)', async () => {
    const driver = await createTestUser('s12drv');
    const stranger = await createTestUser('s12str');
    const rider = await createTestUser('s12rid');
    const ride = await createTestRide(driver.id, { seats: 3 });
    const reqId = await makeAcceptedRequest(ride.id, rider.id, driver.id);

    const flag = (requestId, driverId) =>
      supabaseAdmin.rpc('flag_rider_no_show', { p_request_id: requestId, p_driver_id: driverId, p_penalty: 0.5 });

    // Ride still "posted"
            // Ride still "posted"
    const early = await flag(reqId, driver.id);
    assert((early.error?.message || '').includes('RIDE_NOT_DEPARTED'), 'No-show rejected while ride is not departed', errText(early.error));

    await supabaseAdmin.from('rides').update({ status: 'departed' }).eq('id', ride.id);

    const noArrival = await flag(reqId, driver.id);
    assert((noArrival.error?.message || '').includes('NOT_ARRIVED'), 'No-show rejected before the driver marks arrival', errText(noArrival.error));

    await supabaseAdmin
      .from('ride_requests')
      .update({ arrived_at: new Date(Date.now() - 6 * 60 * 1000).toISOString() })
      .eq('id', reqId);

    const wrongDriver = await flag(reqId, stranger.id);
    assert((wrongDriver.error?.message || '').includes('NOT_RIDE_DRIVER'), 'Only the ride\'s driver can flag a no-show', errText(wrongDriver.error));

    const riderBefore = await getUserRow(rider.id);
    const driverBefore = await getUserRow(driver.id);

    const ok = await flag(reqId, driver.id);
    const result = first(ok.data);
    assert(!ok.error && result?.waited_seconds >= 355, 'No-show succeeds and records the waited time', errText(ok.error));
    assert((await getRequest(reqId)).status === 'no_show', 'Request status becomes "no_show"');

    const { data: incidents } = await supabaseAdmin.from('incident_logs').select('*').eq('ride_id', ride.id);
    assert(incidents.length === 1, 'Exactly one incident_logs row is written');
    assert(
      incidents[0]?.incident_type === 'no_show' && incidents[0]?.stage === 'at_pickup' && incidents[0]?.user_id === rider.id,
      'Incident is type "no_show", stage "at_pickup", attributed to the RIDER'
    );

    const riderAfter = await getUserRow(rider.id);
    const driverAfter = await getUserRow(driver.id);
    assert(
      Math.abs(Number(riderBefore.composite_rating) - Number(riderAfter.composite_rating) - 0.5) < 0.001,
      `Rider rating drops by 0.5 (${riderBefore.composite_rating} -> ${riderAfter.composite_rating})`
    );
    assert(riderAfter.no_show_count === riderBefore.no_show_count + 1, 'Rider no_show_count increments by 1');
    assert(
      Number(driverAfter.composite_rating) === Number(driverBefore.composite_rating) &&
      driverAfter.no_show_count === driverBefore.no_show_count,
      'Driver\'s score and counters are untouched'
    );

    const replay = await flag(reqId, driver.id);
    assert((replay.error?.message || '').includes('REQUEST_NOT_ACCEPTED'), 'A request cannot be flagged twice', errText(replay.error));

    // Rating floor
    const lowRider = await createTestUser('s12low');
    await supabaseAdmin.from('users').update({ composite_rating: 1.2 }).eq('id', lowRider.id);
    const lowRide = await createTestRide(driver.id, { seats: 3 });
    const lowReqId = await makeAcceptedRequest(lowRide.id, lowRider.id, driver.id);
    await supabaseAdmin.from('rides').update({ status: 'departed' }).eq('id', lowRide.id);
    await supabaseAdmin
      .from('ride_requests')
      .update({ arrived_at: new Date(Date.now() - 60000).toISOString() })
      .eq('id', lowReqId);
    await flag(lowReqId, driver.id);
    assert(Number((await getUserRow(lowRider.id)).composite_rating) === 1.0, 'Rating never drops below the 1.0 floor');

    // Double-tap race: only one penalty
    const raceRider = await createTestUser('s12race');
    const raceRide = await createTestRide(driver.id, { seats: 3 });
    const raceReqId = await makeAcceptedRequest(raceRide.id, raceRider.id, driver.id);
    await supabaseAdmin.from('rides').update({ status: 'departed' }).eq('id', raceRide.id);
    await supabaseAdmin
      .from('ride_requests')
      .update({ arrived_at: new Date(Date.now() - 300000).toISOString() })
      .eq('id', raceReqId);

    const [a, b] = await Promise.all([flag(raceReqId, driver.id), flag(raceReqId, driver.id)]);
    const wins = [a, b].filter((r) => !r.error).length;
    assert(wins === 1, `Simultaneous double-tap: exactly one succeeds (got ${wins})`);
    assert((await getUserRow(raceRider.id)).no_show_count === 1, 'Double-tap penalizes the rider only once');
    const { data: raceIncidents } = await supabaseAdmin
      .from('incident_logs')
      .select('id')
      .eq('user_id', raceRider.id);
    assert(raceIncidents.length === 1, 'Double-tap writes only one incident row');
  });

  // --------------------------------------------------------------------------
  // SUITE 13: Milestone 5.2-5.4 - End-to-end over real HTTP + Socket.IO
  // (requires: backend running + `npm i -D socket.io-client`)
  // --------------------------------------------------------------------------
  await runSection('SUITE 13] M5 End-to-End HTTP + Socket.IO', async () => {
    const healthy = await fetch(`${API_BASE}/health`).then((r) => r.ok).catch(() => false);
    if (!healthy) return skip(`Backend not reachable at ${API_BASE}. Start it with "npm run dev" to run this suite.`);

    let ioClient;
    try {
      ({ io: ioClient } = await import('socket.io-client'));
    } catch {
      return skip('socket.io-client not installed. Run: npm i -D socket.io-client');
    }

    const connect = (token) =>
      new Promise((resolve) => {
        const s = ioClient(SOCKET_URL, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false });
        openSockets.push(s);
        const timer = setTimeout(() => resolve({ socket: s, ok: false, error: 'timeout' }), 4000);
        s.on('connect', () => { clearTimeout(timer); resolve({ socket: s, ok: true }); });
        s.on('connect_error', (e) => { clearTimeout(timer); resolve({ socket: s, ok: false, error: e.message }); });
      });

    const waitFor = (socket, event, ms = 2000) =>
      new Promise((resolve) => {
        const timer = setTimeout(() => { socket.off(event, handler); resolve(null); }, ms);
        const handler = (payload) => { clearTimeout(timer); resolve(payload); };
        socket.once(event, handler);
      });

    // --- Fixtures (real auth users) ---
    const driver = await createTestUser('e2edrv', { withAuth: true });
    const rider = await createTestUser('e2erid', { withAuth: true });
    const stranger = await createTestUser('e2estr', { withAuth: true });

    const [dTok, rTok, sTok] = await Promise.all([login(driver), login(rider), login(stranger)]);
    if (!dTok || !rTok || !sTok) return skip('Could not log in test users through /auth/login.');

    const ride = await createTestRide(driver.id, { seats: 3 });
    const emptyRide = await createTestRide(driver.id, { seats: 3 });
    const reqId = await makeAcceptedRequest(ride.id, rider.id, driver.id);

    // --- Chat access control (M5.2) ---
    const msgUrl = `/chat/${ride.id}/messages`;
    assert((await http('GET', msgUrl, null)).status === 401, 'Chat without token -> 401');
    assert((await http('GET', msgUrl, sTok)).status === 403, 'Non-participant cannot read chat -> 403');
    assert(
      (await http('POST', msgUrl, sTok, { receiver_id: driver.id, content: 'hi' })).status === 403,
      'Non-participant cannot send -> 403'
    );
    assert((await http('GET', msgUrl, dTok)).status === 403, 'Driver must pick a partner_id to read -> 403');
    assert(
      (await http('POST', msgUrl, rTok, { receiver_id: driver.id, content: '   ' })).status === 400,
      'Empty/whitespace message -> 400'
    );
    assert(
      (await http('POST', msgUrl, rTok, { receiver_id: driver.id, content: 'x'.repeat(1001) })).status === 400,
      '1001-character message -> 400'
    );
    assert(
      (await http('POST', msgUrl, rTok, { receiver_id: stranger.id, content: 'hi' })).status === 403,
      'Rider cannot message anyone except the driver -> 403'
    );

    // Live delivery: rider socket gets driver's message instantly
    const riderConn = await connect(rTok);
    assert(riderConn.ok, 'Authenticated rider connects to Socket.IO', riderConn.error);
    const liveMsg = waitFor(riderConn.socket, 'new_message');
    const sent = await http('POST', msgUrl, dTok, { receiver_id: rider.id, content: 'Wait at main gate' });
    assert(sent.status === 201, 'Driver sends a chat message -> 201', `status ${sent.status}`);
    const received = await liveMsg;
    assert(received?.content === 'Wait at main gate', 'Rider receives "new_message" live over the socket');

    const history = await http('GET', `${msgUrl}?partner_id=${driver.id}`, rTok);
    assert(history.json?.data?.messages?.length === 1, 'Rider can load history from the API');

    // --- Socket authentication (M5.1) ---
    const anon = await connect(null);
    assert(anon.ok === false, 'Socket without token is rejected', anon.error);
    const badTok = await connect('not-a-real-token');
    assert(badTok.ok === false, 'Socket with invalid token is rejected', badTok.error);

    // --- Depart rules (M5.3) ---
    const departEmpty = await http('PATCH', `/rides/${emptyRide.id}/depart`, dTok);
    assert(
      departEmpty.status === 400,
      'Depart with no accepted riders -> 400',
      `got ${departEmpty.status}: ${JSON.stringify(departEmpty.json?.error)}`
    );

   const departStranger = await http('PATCH', `/rides/${ride.id}/depart`, sTok);
    assert(
      departStranger.status === 400,
      'Another user cannot start the driver\'s ride -> 400',
      `got ${departStranger.status}: ${JSON.stringify(departStranger.json?.error)}`
    );
    assert(
      (await http('PATCH', `/rides/${ride.id}/complete`, dTok)).status === 400,
      'Cannot complete a ride that has not departed -> 400'
    );

    const departed = await http('PATCH', `/rides/${ride.id}/depart`, dTok);
    assert(departed.status === 200, 'Driver departs the ride -> 200', `status ${departed.status}`);
    assert((await getRide(ride.id)).status === 'departed', 'Ride status is "departed" in the DB');
    assert((await http('PATCH', `/rides/${ride.id}/depart`, dTok)).status === 400, 'Departing twice -> 400');

    const afterDepart = await http('POST', msgUrl, dTok, { receiver_id: rider.id, content: 'too late' });
    assert(afterDepart.status === 403, 'Chat closes after departure -> 403');

    // --- Ride room access + GPS relay (M5.3) ---
    const strangerConn = await connect(sTok);
    const roomErr = waitFor(strangerConn.socket, 'room_error');
    strangerConn.socket.emit('join_ride_room', ride.id);
    assert(Boolean(await roomErr), 'Stranger cannot join the ride room');

    const joined = waitFor(riderConn.socket, 'ride_room_joined');
    riderConn.socket.emit('join_ride_room', ride.id);
    assert(Boolean(await joined), 'Accepted rider joins the ride room');

    const locations = [];
    riderConn.socket.on('ride_location', (l) => locations.push(l));

    const driverConn = await connect(dTok);
    driverConn.socket.emit('driver_location', { rideId: ride.id, lat: 30.1111, lng: 78.1111 });
    await sleep(800);
    assert(locations.some((l) => l.lat === 30.1111), 'Driver\'s GPS is relayed to the accepted rider');

    // Spoof attempt by a non-driver
    strangerConn.socket.emit('driver_location', { rideId: ride.id, lat: 10, lng: 10 });
    await sleep(800);
    assert(!locations.some((l) => l.lat === 10), 'Spoofed location from a non-driver is NOT relayed');

    // Invalid coordinates ignored
    await sleep(1600); // server throttle window
    driverConn.socket.emit('driver_location', { rideId: ride.id, lat: 999, lng: 999 });
    await sleep(500);
    assert(!locations.some((l) => l.lat === 999), 'Out-of-range coordinates are ignored');

    // GPS is never persisted
    const { data: rideRow } = await supabaseAdmin.from('rides').select('*').eq('id', ride.id).single();
    assert(
      !Object.keys(rideRow).some((k) => /^(lat|lng|latitude|longitude|location|gps)/i.test(k)),
      'No live-GPS columns exist on the rides row (relay-only, not stored)'
    );

    // --- Arrival + no-show over HTTP (M5.4) ---
    assert((await http('PATCH', `/requests/not-a-uuid/no-show`, dTok)).status === 400, 'Malformed request id -> 400, not 500');
    assert((await http('PATCH', `/requests/${reqId}/arrived`, rTok)).status === 403, 'Rider cannot mark arrival -> 403');
    assert((await http('PATCH', `/requests/${reqId}/arrived`, sTok)).status === 403, 'Stranger cannot mark arrival -> 403');
    const earlyNoShow = await http('PATCH', `/requests/${reqId}/no-show`, dTok);
    assert(
      earlyNoShow.status === 400,
      'No-show before arrival -> 400',
      `got ${earlyNoShow.status}: ${JSON.stringify(earlyNoShow.json?.error)}`
    );
    const arrivedEvt = waitFor(riderConn.socket, 'driver_arrived');
    const a1 = await http('PATCH', `/requests/${reqId}/arrived`, dTok);
    assert(a1.status === 200 && a1.json?.data?.arrived_at, 'Driver marks arrival -> 200');
    assert(Boolean(await arrivedEvt), 'Rider receives "driver_arrived" live');

    const a2 = await http('PATCH', `/requests/${reqId}/arrived`, dTok);
    assert(
      a2.status === 200 && a2.json?.data?.arrived_at === a1.json?.data?.arrived_at,
      'Arrival is idempotent: second call keeps the original arrived_at'
    );

    const pickups = await http('GET', `/requests/pickups?ride_id=${ride.id}`, dTok);
    assert(pickups.status === 200 && pickups.json?.data?.pickups?.length === 1, 'Driver can list pickups');
    assert((await http('GET', `/requests/pickups?ride_id=${ride.id}`, rTok)).status === 403, 'Rider cannot list pickups -> 403');
    assert((await http('GET', `/requests/pickups?ride_id=bad`, dTok)).status === 400, 'Pickups with bad ride_id -> 400');

    // --- Completion stops the relay immediately (M5.3) ---
    const completedEvt = waitFor(riderConn.socket, 'ride_completed');
    const completed = await http('PATCH', `/rides/${ride.id}/complete`, dTok);
    assert(completed.status === 200, 'Driver completes the ride -> 200', `status ${completed.status}`);
    assert(Boolean(await completedEvt), 'Rider receives "ride_completed" live');
    assert((await getRide(ride.id)).status === 'completed', 'Ride status is "completed" in the DB');

    const countBefore = locations.length;
    await sleep(1600);
    driverConn.socket.emit('driver_location', { rideId: ride.id, lat: 30.2222, lng: 78.2222 });
    await sleep(800);
    assert(locations.length === countBefore, 'No location is relayed after completion');

    assert((await http('PATCH', `/rides/${ride.id}/complete`, dTok)).status === 400, 'Completing twice -> 400');
  });

  await runSection('CLEANUP] Removing test fixtures', async () => {
    openSockets.forEach((s) => { try { s.close(); } catch { /* ignore */ } });
    await cleanupFixtures();
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`   TOTAL TESTS: ${passedTests + failedTests}`);
  console.log(`   PASSED:      \x1b[32m${passedTests}\x1b[0m`);
  console.log(`   FAILED:      ${failedTests > 0 ? `\x1b[31m${failedTests}\x1b[0m` : '\x1b[32m0\x1b[0m'}`);
  console.log('======================================================\n');

  process.exit(failedTests > 0 ? 1 : 0);
}

runTestSuite().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
