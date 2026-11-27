-- Milestone 5.4: arrival tracking + atomic no-show flagging

-- 1. When the driver reported arriving at this rider's pickup (starts the soft wait hint)
ALTER TABLE ride_requests
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;

-- 2. Atomic no-show: status change + incident log + rider penalty in ONE transaction
CREATE OR REPLACE FUNCTION flag_rider_no_show(
  p_request_id UUID,
  p_driver_id  UUID,
  p_penalty    DECIMAL DEFAULT 0.5
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_req     ride_requests%ROWTYPE;
  v_ride    rides%ROWTYPE;
  v_waited  INT;
  v_rating  DECIMAL(2,1);
  v_count   INT;
BEGIN
  -- Lock the request row: concurrent taps queue here and the second one fails the status check
  SELECT * INTO v_req
  FROM ride_requests
  WHERE id = p_request_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND';
  END IF;

  SELECT * INTO v_ride
  FROM rides
  WHERE id = v_req.ride_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RIDE_NOT_FOUND';
  END IF;

  IF v_ride.driver_id <> p_driver_id THEN
    RAISE EXCEPTION 'NOT_RIDE_DRIVER';
  END IF;

  IF v_ride.status <> 'departed' THEN
    RAISE EXCEPTION 'RIDE_NOT_DEPARTED';
  END IF;

  IF v_req.status <> 'accepted' THEN
    RAISE EXCEPTION 'REQUEST_NOT_ACCEPTED';
  END IF;

  IF v_req.arrived_at IS NULL THEN
    RAISE EXCEPTION 'NOT_ARRIVED';
  END IF;

  v_waited := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_req.arrived_at))::INT);

  -- 1. Request becomes no_show
  UPDATE ride_requests SET status = 'no_show' WHERE id = v_req.id;

  -- 2. Incident row (user_id = the penalized rider)
  INSERT INTO incident_logs (ride_id, user_id, incident_type, stage, notes)
  VALUES (
    v_req.ride_id,
    v_req.rider_id,
    'no_show',
    'at_pickup',
    format('Flagged by driver %s after waiting %s seconds at pickup.', p_driver_id, v_waited)
  );

  -- 3. Penalize ONLY the rider. The driver's row is never touched.
  UPDATE users
  SET no_show_count    = no_show_count + 1,
      composite_rating = GREATEST(1.0, COALESCE(composite_rating, 5.0) - p_penalty),
      updated_at       = now()
  WHERE id = v_req.rider_id
  RETURNING composite_rating, no_show_count INTO v_rating, v_count;

  RETURN jsonb_build_object(
    'request_id',          v_req.id,
    'ride_id',             v_req.ride_id,
    'rider_id',            v_req.rider_id,
    'waited_seconds',      v_waited,
    'rider_rating',        v_rating,
    'rider_no_show_count', v_count
  );
END;
$$;

-- The function trusts p_driver_id, so only the backend (service role) may call it.
-- Without this, anyone holding your public anon key could call it through PostgREST.
REVOKE ALL ON FUNCTION flag_rider_no_show(UUID, UUID, DECIMAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION flag_rider_no_show(UUID, UUID, DECIMAL) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION flag_rider_no_show(UUID, UUID, DECIMAL) TO service_role;