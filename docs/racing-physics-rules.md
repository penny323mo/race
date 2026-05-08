# Racing Physics Rules

This project uses an arcade-realistic model: fast enough to feel like a racing game, but still bounded by cornering, grip, and wall contact.

## Speed Model

- Launch should feel immediate, not sluggish.
- The target solo launch band is roughly:
  - 0.5s: 35-55 km/h
  - 1.0s: 75-95 km/h
  - 1.5s: 90-120 km/h, depending on steering and wall contact
- 0-100 km/h should be quick, but not instant. The car must still need steering before the first corner.
- 100-180 km/h should continue pulling, but with less force than launch.
- 180 km/h+ should taper through aero drag and gearing.
- Nitro can exceed the normal pull curve, but should not override cornering limits.

## Grip And Drift

- Normal throttle uses high rear grip and light traction control so launch does not turn into uncontrolled wheelspin.
- Handbrake deliberately drops rear side friction and allows yaw rotation.
- Powered drift keeps rear grip low while the player holds throttle, but engine assist is reduced during drift so the car cannot accelerate unrealistically while sideways.
- Releasing handbrake or throttle should recover rear grip quickly enough to catch the slide.
- Lateral slip can count as drift only when the car is already moving fast enough and sliding hard enough.

## Steering Assist

- Racing-line assist is allowed only when:
  - the player is accelerating,
  - the player is not pressing left or right,
  - the player is not using handbrake,
  - speed is above a low crawl threshold.
- Assist should be mild and should never override manual steering or drift.
- The goal is to stop mobile players from immediately hitting the first wall when pressing only GAS, not to autopilot the lap.

## Wall Contact

- Barriers should be low-friction so side swipes slide instead of sticking.
- Wall restitution should be high enough to deflect the car, but not so high that the car bounces like an arcade pinball.
- A direct wall hit should still cost speed.

## Smoke And Visual Feedback

- Launch smoke must stay thin, short-lived, and low-opacity, especially on mobile.
- Drift smoke can be stronger than launch smoke, but must not hide the road or HUD.
- Particle opacity and growth must be stored per particle; fade updates must not reset every particle to a fixed high opacity.
