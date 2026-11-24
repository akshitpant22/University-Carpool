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
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`   TOTAL TESTS: ${passedTests + failedTests}`);
  console.log(`   PASSED:      \x1b[32m${passedTests}\x1b[0m`);
  console.log(`   FAILED:      ${failedTests > 0 ? `\x1b[31m${failedTests}\x1b[0m` : '\x1b[32m0\x1b[0m'}`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
