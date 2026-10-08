# UI/UX Design Document
# Campus Carpool Matching Platform

**Scope note:** This document covers screen inventory, navigation flow, and interaction logic only. Visual styling (colors, typography, spacing, component library choices) is intentionally left open for the frontend team to decide during implementation, and is not specified here.

---

## 1. Design Philosophy

- **No fixed driver/rider identity anywhere in the UI.** The Home screen presents "Find a Ride" and "Offer a Ride" as two equally-weighted, always-visible actions — never a persistent mode toggle. This reflects the core product decision that any user can act as driver one day and rider the next, sometimes the same day.
- **Phase-I shows ranked list/cards, not a map.** Search results are presented as scannable cards (distance, time, price, rating as text/numbers) rather than map pins — this is a deliberate sequencing decision (prove the matching engine works first, add visual map polish in Phase-II), not a limitation to hide.
- **Driver is never required to actively watch a live map while driving.** This shapes the Active Ride screen specifically — live tracking is present but not designed to demand constant attention (see Screen 15 below).

---

## 2. Complete Screen Inventory

### Auth & Onboarding
1. **Landing/Login** — entry point for existing users
2. **Signup** — university email + password
3. **Email Verification Pending** — holding screen while awaiting email confirmation
4. **Profile Creation** — name, branch, course, year, semester, phone, parent contact, UPI ID
5. **ID Card Upload** — image upload for admin verification
6. **Pending Verification Home** — a restricted version of the main app; browse-only, with a persistent banner indicating "Your account is under review"

### Core App (post-verification)
7. **Home / Dashboard** — the two primary actions ("Find a Ride" / "Offer a Ride"), always both visible, no mode switching
8. **Vehicle Management** — add/edit registered vehicles; reached from "Offer a Ride" if the user has no vehicle registered yet
9. **Post a Ride** — origin, destination, departure time, price, seats, gender preference
10. **Search Ride** — enter pickup location/time, toggle gender filter
11. **Search Results** — ranked list/cards (Phase-I; no map)
12. **Ride Details** — tapped from a search result card; shows the driver's public profile, rating, price, and the "Request Ride" action
13. **My Requests** — rider's outgoing requests, showing status (pending/accepted/expired) and expiry countdown
14. **Incoming Requests** — driver's view of requests on their posted rides, with accept/decline actions
15. **Active Ride** — shown once a request is accepted; contains in-app chat, live location relay (once departed), and role-appropriate action buttons ("Mark as Departed" for driver, "Mark Arrived"/no-show trigger as applicable)
16. **Rate Ride** — auto-triggered for the rider the moment the driver marks the ride complete; no separate rider confirmation step precedes this
17. **My Rides History** — past rides, covering both roles (as driver and as rider)

### Supporting Screens
18. **Notifications Inbox** — persisted notification list (unread/read), backed by the always-write/always-emit pattern
19. **Profile / Settings** — edit own profile, view own rating/reliability breakdown
20. **Public Profile View** — viewing another user's profile before sending a request (safe fields only — no phone, no parent contact, no ID card)

### Admin (separate, role-gated section)
21. **Admin Verification Queue** — list of pending ID verifications
22. **Admin Verification Detail** — full review view (ID card image via short-lived signed URL, side-by-side with typed profile details), approve/reject actions
23. **Admin Incident Log** — read-only view of logged no-shows/cancellations (Phase-I: view-only; Phase-II: acted upon for abuse-pattern detection)

---

## 3. Navigation Flow

```
Landing/Login
   |
   +-- (new user) --> Signup --> Email Verification Pending --> Profile Creation --> ID Card Upload --> Pending Verification Home
   |
   +-- (existing, verified user) --> Home/Dashboard
                                          |
              +---------------------------+---------------------------+
              |                                                       |
       "Find a Ride"                                          "Offer a Ride"
              |                                                       |
        Search Ride                                       (has vehicle?) --no--> Vehicle Management
              |                                                       |
       Search Results                                            Post a Ride
              |                                                       |
        Ride Details                                          My Rides History
              |                                                       |
     (Request Ride) --> My Requests                           Incoming Requests
              |                                                       |
      (accepted) -----------------> Active Ride <---------------(accepted)
                                          |
                                   Rate Ride (rider only,
                                   auto-triggered on completion)
```

Notifications Inbox, Profile/Settings, and Public Profile View are reachable from a persistent navigation element (e.g., a header/tab bar) across all core-app screens, not tied to a single linear flow. Admin screens are only reachable to users with `role = 'admin'`, via a separate entry point not visible to regular students.

---

## 4. Screen-Level Interaction Notes

### Screen 6 — Pending Verification Home
- User can browse (view how search/matching would look) but cannot actually post a ride or send a request
- A persistent banner communicates status clearly, avoiding ambiguity about why certain actions are disabled

### Screen 7 — Home/Dashboard
- Deliberately no "you are currently in driver mode" or similar framing anywhere in this screen or its surrounding navigation
- Both primary actions are equally prominent — neither is treated as a secondary/hidden option

### Screen 9 — Post a Ride
- Vehicle selection determines seat capacity display (auto-derived, not manually entered)
- Gender preference toggle is optional and defaults to "no preference"
- Earlier posting is transparently indicated after posting (e.g., relative timestamp shown on the ride) to informally encourage posting ahead of departure time, without being an enforced rule

### Screen 10 — Search Ride
- Gender filter toggle is opt-in and applied **before** search executes, not as a post-search filter
- If the gender filter excludes all results, the UI transparently offers to show excluded (opposite-gender) results rather than silently returning an empty state

### Screen 11 — Search Results
- Cards display: driver name/photo, composite rating (exact decimal), price, estimated proximity/distance — no map in Phase-I
- Rider can select and send requests to **up to 5** cards in parallel from this screen

### Screen 13 — My Requests
- Each pending request shows a visual expiry indicator reflecting the dynamically computed expiry time (not a fixed countdown same for every request)
- Once any one request is accepted, the others visibly transition to a "no longer available" state (auto-cancelled), not left ambiguous

### Screen 15 — Active Ride
- Contains: in-app chat (pre-departure coordination), live location relay (post-departure)
- **Driver's view specifically:** live location of the rider is present but not designed to demand active attention — e.g., not a full-screen live map forcing constant glancing; a compact/minimized presentation is appropriate, with the expectation that pre-departure chat has already resolved the "where exactly" ambiguity
- **Rider's view:** can watch the driver's live location as the driver approaches (comparable to a delivery-tracking experience), since the rider is stationary and this poses no safety concern
- No-show flow: a manual "Cancel — Rider Not Found" action available to the driver once arrived, with a soft UI hint suggesting a reasonable wait time (not enforced as a timer)
- "Mark as Departed" and "Mark Ride Completed" are driver-only actions

### Screen 16 — Rate Ride
- Appears automatically for the rider immediately after the driver marks the ride complete — no independent rider confirmation step gates this
- Also appears for the driver, rating the rider, on the same trigger

### Screen 20 — Public Profile View
- Explicitly excludes: phone number, parent/emergency contact, exact student ID number, ID card reference — shows only name, profile photo, composite rating, completed rides count, and branch/course
- This field restriction is enforced at the API level (a separate endpoint, not a client-side filter), so the UI is simply rendering what it receives — it cannot accidentally display fields it was never given

### Screen 22 — Admin Verification Detail
- ID card image is fetched via a short-lived signed URL generated specifically for this admin's review session — the UI should not cache or persist this image URL beyond the review action
- Displays typed profile details (name, student ID number) alongside the image for the admin's manual cross-check

---

## 5. Explicitly Deferred UI Elements (Phase-II)

- Visual map with live pins (replacing Screen 11's card-based results and enhancing Screen 15's tracking view)
- Voice-input UI for Post a Ride (speech-to-text ride posting)
- Formal harassment/incident reporting screen (distinct from the star-rating flow)
- SOS trigger UI (button + confirmation flow, connected to real emergency-contact/admin dispatch)
- Full push notification permission/settings UI (Phase-I relies on in-app notification inbox only)
