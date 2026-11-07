'use strict';
// ---------- Arsenal ----------
// aim: power (hold fire to charge), direct (fires instantly along aim), drop (at feet), melee,
//      target (click/tap a spot), utility (tool, does not end turn), none
B.WEAPONS = {
  bazooka:   { name: 'Bazooka', icon: 'bazooka', row: 0, aim: 'power', ammo: -1, delay: 0, desc: 'Rocket. Wind pushes it around. Hold FIRE to charge.' },
  homing:    { name: 'Homing Missile', icon: 'homing', row: 0, aim: 'power', target: true, ammo: 2, delay: 1, desc: 'Tap/click a target first, then fire. Locks on after launch.' },
  grenade:   { name: 'Grenade', icon: 'grenade', row: 1, aim: 'power', fuse: true, ammo: -1, delay: 0, desc: 'Bouncy. Keys 1–5 (or tap fuse) set the timer.' },
  cluster:   { name: 'Cluster Bomb', icon: 'cluster', row: 1, aim: 'power', fuse: true, ammo: 3, delay: 0, desc: 'Splits into 5 bomblets.' },
  plantain:  { name: 'Plantain Bomb', icon: 'plantain', row: 1, aim: 'power', fuse: true, ammo: 1, delay: 2, desc: 'Bursts into five explosive plantain slices. Very nasty.' },
  bonnet:    { name: 'Scotch Bonnet', icon: 'bonnet', row: 1, aim: 'power', ammo: 1, delay: 3, desc: 'The hottest thing in the arsenal. Huge 3-second blast. Irie!' },
  shotgun:   { name: 'Shotgun', icon: 'shotgun', row: 2, aim: 'direct', shots: 2, ammo: -1, delay: 0, desc: 'Two shots per turn. Fires instantly.' },
  dynamite:  { name: 'Dynamite', icon: 'dynamite', row: 2, aim: 'drop', ammo: 2, delay: 0, desc: 'Drop it and run. 5 second fuse.' },
  punch:     { name: 'Bean Punch', icon: 'punch', row: 3, aim: 'melee', ammo: -1, delay: 0, desc: 'Flaming uppercut. Launches beans skyward.' },
  bat:       { name: 'Bat', icon: 'bat', row: 3, aim: 'melee', ammo: 2, delay: 0, desc: 'Home run! Knocks a bean along your aim.' },
  airstrike: { name: 'Airstrike', icon: 'airstrike', row: 4, aim: 'target', ammo: 1, delay: 2, desc: 'Tap/click a target. Five missiles from the sky.' },
  coconut:   { name: 'Concrete Coconut', icon: 'coconut', row: 4, aim: 'target', ammo: 1, delay: 4, desc: 'Drops from the heavens and smashes its way down.' },
  goat:      { name: 'Goat', icon: 'goat', row: 5, aim: 'drop', ammo: 2, delay: 0, desc: 'Walks and hops. Press FIRE again to detonate.' },
  madgoats:  { name: 'Mad Goats', icon: 'madgoats', row: 5, aim: 'drop', ammo: 1, delay: 3, desc: 'A stampede of five explosive goats.' },
  rope:      { name: 'Ninja Rope', icon: 'rope', row: 6, aim: 'utility', ammo: 5, delay: 0, desc: 'FIRE to shoot. ←/→ swing, ↑/↓ length, FIRE to let go (and fire again mid-air).' },
  jetpack:   { name: 'Jetpack', icon: 'jetpack', row: 6, aim: 'utility', ammo: 2, delay: 0, desc: 'FIRE to start. ↑ thrust, ←/→ steer, FIRE to drop.' },
  parachute: { name: 'Parachute', icon: 'parachute', row: 6, aim: 'utility', ammo: 2, delay: 0, desc: 'FIRE while falling. No fall damage.' },
  girder:    { name: 'Girder', icon: 'girder', row: 6, aim: 'target', utility: true, ammo: 3, delay: 0, desc: 'Tap/click to place. ↑/↓ rotates.' },
  teleport:  { name: 'Teleport', icon: 'teleport', row: 6, aim: 'target', utility: true, ammo: 2, delay: 0, desc: 'Tap/click anywhere open to beam there.' },
  skip:      { name: 'Skip Go', icon: 'skip', row: 7, aim: 'none', ammo: -1, delay: 0, desc: 'Pass your turn.' },
  surrender: { name: 'Surrender', icon: 'surrender', row: 7, aim: 'none', ammo: -1, delay: 0, desc: 'Wave the white flag. Your team is out.' },
};
B.WEAPON_ORDER = Object.keys(B.WEAPONS);
B.CRATE_WEAPONS = ['homing', 'cluster', 'plantain', 'bonnet', 'dynamite', 'bat', 'airstrike', 'coconut', 'goat', 'madgoats', 'rope', 'jetpack', 'girder', 'teleport'];
