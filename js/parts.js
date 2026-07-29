// Every object is built out of small parts sitting in one shared local frame:
//
//   x  across the cutter shafts   (-1 .. 1 of the object's half width)
//   y  above its middle           (-1 .. 1 of its half thickness)
//   z  along the feed direction   (-1 .. 1 of its half length)
//
// z = -1 is the edge that goes into the teeth first, so the order of the parts
// along z is exactly the order in which the machine takes the object apart.
// That is what makes each object die differently: the keys leave the keyboard
// before its plate is combed into strips, the bells snap off the alarm clock
// before the shell is crushed, and the battery inside the phone is only
// reached once the case around it is gone.

const STEEL = [.66, .70, .76];
const DARK = [.09, .11, .13];
const SHEET = [.93, .94, .96];
const GOLD = [.87, .72, .3];
const COPPER = [.8, .48, .26];
const GLASS = [.72, .84, .92];
const RUBBER = [.15, .16, .19];

// What a part is and how it comes apart.
//   shell  structural, combed into strips by the discs
//   trim   printed or glued onto the shell, goes with it
//   loose  held on by the shell, pops off just before the teeth reach it
//   glass  brittle, bursts into shards
//   core   inside the object, spills out once the shell is opened
const DEFAULTS = { x: 0, y: 0, z: 0, w: .2, d: .2, h: .2, mesh: 'cube', kind: 'shell', color: 'body', gloss: .2 };

function ruled(z, w, x = 0, color = 'accent') {
  return { x, z, y: 1.02, w, d: .04, h: .32, kind: 'trim', color, gloss: .05 };
}

// A loose sheet of paper: nothing but surface, so it folds into the teeth and
// combs out as strips.
function paperParts() {
  const parts = [{ w: 1, d: 1, h: 1, kind: 'shell', color: 'body', gloss: .06 }];
  for (let i = 0; i < 6; i += 1) {
    parts.push(ruled(-.74 + i * .29, i === 0 ? .44 : .82, i % 2 ? -.06 : .05));
  }
  return parts;
}

// Bank card: hard plastic. The chip is the one thing the teeth cannot chew, so
// it is flicked out.
function cardParts() {
  return [
    { w: 1, d: 1, h: 1, kind: 'shell', color: 'body', gloss: .45 },
    { x: -.44, z: -.34, y: 1.04, w: .22, d: .3, h: .4, kind: 'loose', color: GOLD, gloss: .9, pop: .7 },
    { z: .68, w: 1, d: .18, h: .35, kind: 'trim', color: DARK, gloss: .15 },
    { x: .12, z: .18, w: .58, d: .07, y: 1.04, h: .35, kind: 'trim', color: 'accent', gloss: .55 },
    { x: -.34, z: .38, w: .28, d: .06, y: 1.04, h: .35, kind: 'trim', color: 'accent', gloss: .55 }
  ];
}

// Clipboard: a stack of pages on a board with a steel clip at the far end. The
// pages go quietly, then the clip hits the teeth and the machine stalls.
function boardParts() {
  const parts = [
    { y: -.3, w: 1, d: 1, h: .5, kind: 'shell', color: 'body', gloss: .14 },
    { z: -.04, y: .45, w: .9, d: .92, h: .4, kind: 'shell', color: SHEET, gloss: .05 }
  ];
  for (let i = 0; i < 7; i += 1) {
    parts.push({ x: i % 2 ? -.05 : .04, z: -.78 + i * .21, y: .88, w: .72, d: .03, h: .2, kind: 'trim', color: 'accent', gloss: .04 });
  }
  parts.push({ z: .84, y: .95, w: .46, d: .12, h: .55, kind: 'loose', color: STEEL, gloss: .95, jam: .55, pop: .5 });
  parts.push({ z: .7, y: .95, w: .16, d: .1, h: .45, kind: 'loose', color: STEEL, gloss: .9, pop: .4 });
  return parts;
}

// Optical disc: it does not get eaten, it cracks. One bite and the whole thing
// bursts into wedges that are then dragged in one by one.
function discParts() {
  return [
    { w: 1, d: 1, h: 1, mesh: 'cylinder', axis: 'y', kind: 'glass', color: 'body', gloss: .95, shatter: 7 },
    { w: .78, d: .78, h: 1.06, mesh: 'cylinder', axis: 'y', kind: 'glass', color: 'accent', gloss: 1, shatter: 5 },
    { w: .3, d: .3, h: 1.12, mesh: 'cylinder', axis: 'y', kind: 'trim', color: [.86, .88, .92], gloss: .6 },
    { w: .13, d: .13, h: 1.2, mesh: 'cylinder', axis: 'y', kind: 'trim', color: DARK, gloss: .1 }
  ];
}

// Phone: glass first, then the case, then the battery inside it.
function phoneParts() {
  return [
    { y: -.2, w: 1, d: 1, h: .8, kind: 'shell', color: 'body', gloss: .8 },
    { z: -.04, y: .6, w: .88, d: .86, h: .22, kind: 'glass', color: [.12, .15, .18], gloss: 1, shatter: 9 },
    { z: -.04, y: .66, w: .8, d: .78, h: .18, kind: 'glass', color: 'accent', gloss: 1, glow: .3, shatter: 6 },
    { z: .92, y: .5, w: .26, d: .05, h: .3, kind: 'trim', color: DARK, gloss: .4 },
    { z: -.88, y: .5, w: .2, d: .06, h: .3, kind: 'trim', color: DARK, gloss: .4 },
    { z: .12, y: -.55, w: .68, d: .46, h: .4, kind: 'core', color: [.24, .7, .44], gloss: .5, flash: 1, pop: .6 },
    { x: -.5, z: .74, y: -.9, w: .26, d: .26, h: .3, mesh: 'cylinder', axis: 'y', kind: 'trim', color: STEEL, gloss: .9 }
  ];
}

// Alarm clock: bells snap off, the glass goes, the hands fly, then the works
// spill out of the shell.
function clockParts() {
  const parts = [
    { w: 1, d: 1, h: 1, mesh: 'cylinder', axis: 'y', kind: 'shell', color: 'body', gloss: .65 },
    { w: .84, d: .84, h: 1.04, mesh: 'cylinder', axis: 'y', kind: 'trim', color: [.95, .95, .92], gloss: .1 },
    { w: .86, d: .86, h: 1.1, mesh: 'cylinder', axis: 'y', kind: 'glass', color: GLASS, gloss: 1, shatter: 7 },
    { z: -.22, y: 1.14, w: .05, d: .4, h: .3, kind: 'loose', color: DARK, gloss: .3, pop: .9 },
    { x: .26, z: .1, y: 1.14, w: .3, d: .05, h: .3, kind: 'loose', color: 'accent', gloss: .3, pop: .9 },
    { x: -.74, z: .68, y: .35, w: .32, d: .32, h: .85, mesh: 'cylinder', axis: 'y', kind: 'loose', color: STEEL, gloss: 1, pop: .8 },
    { x: .74, z: .68, y: .35, w: .32, d: .32, h: .85, mesh: 'cylinder', axis: 'y', kind: 'loose', color: STEEL, gloss: 1, pop: .8 },
    { x: -.3, z: .1, y: -.5, w: .26, d: .26, h: .3, mesh: 'cylinder', axis: 'y', kind: 'core', color: COPPER, gloss: .95, pop: .5 },
    { x: .16, z: -.2, y: -.5, w: .2, d: .2, h: .3, mesh: 'cylinder', axis: 'y', kind: 'core', color: COPPER, gloss: .95, pop: .5 },
    { x: .04, z: .34, y: -.5, w: .15, d: .15, h: .3, mesh: 'cylinder', axis: 'y', kind: 'core', color: GOLD, gloss: .95, pop: .5 },
    { x: -.52, z: -.76, y: -.7, w: .16, d: .16, h: .5, kind: 'loose', color: STEEL, gloss: .8, pop: .4 },
    { x: .52, z: -.76, y: -.7, w: .16, d: .16, h: .5, kind: 'loose', color: STEEL, gloss: .8, pop: .4 }
  ];
  return parts;
}

// Keyboard: a thin plate carrying a lot of small loose things. The keys leave
// row by row as the cut line arrives under them.
function keyboardParts() {
  const parts = [
    { y: -.45, w: 1, d: 1, h: .55, kind: 'shell', color: 'body', gloss: .35 },
    { y: -.1, w: .97, d: .96, h: .3, kind: 'shell', color: 'accent', gloss: .25 }
  ];
  const rows = [-.62, -.21, .2, .61];
  rows.forEach((z, row) => {
    if (row === 3) {
      parts.push({ z, y: .55, w: .34, d: .13, h: .5, kind: 'loose', color: [.86, .88, .9], gloss: .3, pop: .8 });
      [-.72, -.44, .44, .72].forEach((x) => {
        parts.push({ x, z, y: .55, w: .1, d: .13, h: .5, kind: 'loose', color: [.8, .82, .85], gloss: .3, pop: .8 });
      });
      return;
    }
    for (let col = 0; col < 15; col += 1) {
      const x = -.92 + col * .1314;
      const dark = row === 0 && (col === 0 || col === 14);
      parts.push({
        x, z, y: .55, w: .052, d: .13, h: .5, kind: 'loose', pop: .8, gloss: .3,
        color: dark ? DARK : (col + row) % 7 === 3 ? 'accent' : [.84, .86, .89]
      });
    }
  });
  parts.push({ x: .2, z: 1.04, y: -.1, w: .05, d: .12, h: .3, mesh: 'cylinder', axis: 'z', kind: 'loose', color: RUBBER, gloss: .4, pop: .5 });
  return parts;
}

// Cardboard tray: the walls fold in on themselves as they are pulled down, and
// the paperwork inside spills out.
function boxParts() {
  return [
    { y: -.86, w: 1, d: 1, h: .14, kind: 'shell', color: 'body', gloss: .06 },
    { x: -.93, w: .07, d: 1, h: 1, kind: 'shell', color: 'body', gloss: .06, fold: [0, -1] },
    { x: .93, w: .07, d: 1, h: 1, kind: 'shell', color: 'body', gloss: .06, fold: [0, 1] },
    { z: -.93, w: 1, d: .07, h: 1, kind: 'shell', color: 'body', gloss: .06, fold: [1, 0] },
    { z: .93, w: 1, d: .07, h: 1, kind: 'shell', color: 'body', gloss: .06, fold: [-1, 0] },
    { z: -.94, y: .25, w: .46, d: .06, h: .34, kind: 'trim', color: 'accent', gloss: .1 },
    { x: -.06, z: -.1, y: -.5, w: .82, d: .8, h: .12, kind: 'core', color: SHEET, gloss: .05, pop: .5 },
    { x: .08, z: .1, y: -.25, w: .78, d: .76, h: .1, kind: 'core', color: SHEET, gloss: .05, pop: .5 },
    { x: -.02, z: .02, y: -.03, w: .7, d: .72, h: .1, kind: 'core', color: [.95, .82, .8], gloss: .05, pop: .5 }
  ];
}

// Foam cube: it does not cut, it squashes flat against the teeth and then
// tears.
function cubeParts() {
  return [
    { w: 1, d: 1, h: 1, kind: 'shell', color: 'body', gloss: .18, squish: .55 },
    { z: -.4, y: 1.01, w: .2, d: .34, h: .12, kind: 'trim', color: 'accent', gloss: .3, squish: .55 },
    { z: -.02, y: 1.01, w: .1, d: .1, h: .12, kind: 'trim', color: 'accent', gloss: .3, squish: .55 },
    { x: .5, z: .3, y: 1.01, w: .32, d: .32, h: .12, kind: 'trim', color: [.98, .98, 1], gloss: .3, squish: .55 }
  ];
}

const PART_SETS = {
  paper: paperParts,
  card: cardParts,
  board: boardParts,
  disc: discParts,
  phone: phoneParts,
  clock: clockParts,
  keyboard: keyboardParts,
  box: boxParts,
  cube: cubeParts
};

export function buildParts(item) {
  const build = PART_SETS[item.shape] || paperParts;
  return build().map((raw, index) => {
    const part = { ...DEFAULTS, ...raw, index };
    // Where the part starts and ends along the feed, as a fraction of the
    // object measured from the edge that goes in first.
    part.front = (part.z - part.d + 1) / 2;
    part.back = (part.z + part.d + 1) / 2;
    return part;
  });
}

export function partColor(part, item) {
  if (part.color === 'body') return item.color;
  if (part.color === 'accent') return item.accent;
  return part.color;
}
