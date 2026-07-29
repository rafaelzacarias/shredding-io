import { buildParts, partColor } from './parts.js';

const VERTEX_SHADER = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  uniform mat4 uProjection;
  uniform mat4 uView;
  uniform mat4 uModel;
  uniform mat3 uNormalMatrix;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec4 world = uModel * vec4(aPosition, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(uNormalMatrix * aNormal);
    gl_Position = uProjection * uView * world;
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  const float FLOOR_SHADE_START = -2.2;
  const float FLOOR_SHADE_END = 1.8;
  varying vec3 vNormal;
  varying vec3 vWorld;
  uniform vec3 uColor;
  uniform float uMetallic;
  uniform float uGlow;
  uniform vec3 uCamera;
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 key = normalize(vec3(-0.45, 0.85, 0.55));
    vec3 fill = normalize(vec3(0.4, 0.75, -0.6));
    vec3 rimDir = normalize(uCamera - vWorld);
    float diffuse = max(dot(normal, key), 0.0);
    float bounce = max(dot(normal, fill), 0.0);
    float rim = pow(1.0 - max(dot(normal, rimDir), 0.0), 2.4);
    float floorShade = smoothstep(FLOOR_SHADE_START, FLOOR_SHADE_END, vWorld.y);
    vec3 color = uColor * (0.22 + diffuse * 0.68 + bounce * 0.3 + floorShade * 0.06);
    color += vec3(0.18, 0.48, 0.58) * rim * (0.22 + uMetallic * 0.38);
    color += uColor * uGlow;
    color = color / (color + vec3(0.72));
    gl_FragColor = vec4(pow(color, vec3(0.82)), 1.0);
  }
`;

const PARTICLE_VERTEX = `
  attribute vec3 aPosition;
  attribute vec3 aColor;
  uniform mat4 uProjection;
  uniform mat4 uView;
  uniform float uSize;
  varying vec3 vColor;
  void main() {
    vec4 viewPos = uView * vec4(aPosition, 1.0);
    gl_Position = uProjection * viewPos;
    gl_PointSize = uSize * (80.0 / max(1.0, -viewPos.z));
    vColor = aColor;
  }
`;

const PARTICLE_FRAGMENT = `
  precision mediump float;
  varying vec3 vColor;
  void main() {
    float d = distance(gl_PointCoord, vec2(0.5));
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.08, d));
  }
`;

const DISPLAY_CONFIG = {
  mobileBreakpoint: 700,
  mobilePixelRatioCap: 1.5,
  desktopPixelRatioCap: 2
};

// The machine is a rectangular hopper seen from above. Four sloped panels
// funnel everything toward the twin cutter shafts running across the middle.
const BAY = {
  halfWidth: 4,
  halfDepth: 2.25,
  wallThickness: 0.8,
  wallTop: 1.75,
  deckTop: 0.2,
  floorY: -1.4,
  throwPlaneY: 2.6,
  gravity: 11,
  slide: 8.5
};

// Opening the cutters sit in.
const MOUTH = {
  halfWidth: 3.2,
  halfDepth: 1.2
};

// The machine has one speed. Throwing something harder never makes it rush:
// every object is walked through the teeth at the drum's own surface speed.
const CUTTER = {
  radius: 0.62,
  offset: 0.55,
  axisY: BAY.floorY - 0.54,
  discPitch: 0.38,
  discHalf: 0.082,
  teeth: 5,
  speed: 1.05
};

const DRUM_TOP = CUTTER.axisY + CUTTER.radius;
const FEED_SPEED = CUTTER.radius * CUTTER.speed;
const BITE_STEP = FEED_SPEED * Math.PI / (CUTTER.teeth * CUTTER.speed);

const CAMERA = {
  fov: 0.7,
  margin: 1.04,
  tilt: 0.06
};

// Half extents of every thrown object, shared by the physics and the renderer.
const SHAPE_SIZE = {
  paper: [1.05, .7, .045],
  card: [.92, .58, .07],
  board: [.8, 1.05, .12],
  phone: [.55, .95, .12],
  keyboard: [1.35, .48, .14],
  box: [.8, .65, .48],
  cube: [.65, .65, .65],
  disc: [.72, .72, .1],
  clock: [.72, .72, .12]
};

function shapeSize(item) {
  return SHAPE_SIZE[item.shape] || [.8, .6, .25];
}

const PART_CACHE = new Map();

function itemParts(item) {
  if (!PART_CACHE.has(item.id)) PART_CACHE.set(item.id, buildParts(item));
  return PART_CACHE.get(item.id);
}

// What every object is made of. Soft things fold over the drums and comb out
// into strips; stiff things stay straight, resist, judder and snap off in
// chunks. `grab` is how long the teeth wrestle with it before it gives way.
const MATERIAL = {
  paper: { rigidity: .04, grab: .26, debris: 'ribbon' },
  card: { rigidity: .5, grab: .34, debris: 'chip' },
  board: { rigidity: .3, grab: .3, debris: 'ribbon' },
  phone: { rigidity: .92, grab: .52, debris: 'glass' },
  keyboard: { rigidity: .68, grab: .46, debris: 'keycap' },
  box: { rigidity: .34, grab: .32, debris: 'ribbon' },
  cube: { rigidity: .62, grab: .44, debris: 'chunk' },
  disc: { rigidity: .96, grab: .48, debris: 'glass' },
  clock: { rigidity: .86, grab: .5, debris: 'chunk' }
};

// Above this an object is treated as brittle: it breaks in steps instead of
// being drawn in smoothly.
const RIGID = .45;

function material(item) {
  return MATERIAL[item.shape] || { rigidity: .5, grab: .36, debris: 'chunk' };
}

// Debris that matches what the object was made of.
function debrisPiece(mat, item, index) {
  const accent = index % 3 === 0;
  const color = accent ? item.accent : item.color;
  switch (mat.debris) {
    case 'ribbon':
      return { scale: [CUTTER.discPitch * .34, random(.012, .022), random(.16, .38)], color, metallic: .1 };
    case 'chip':
      return { scale: [random(.05, .11), random(.018, .036), random(.06, .14)], color, metallic: .3 };
    case 'glass':
      return { scale: [random(.04, .1), random(.008, .018), random(.05, .13)], color, metallic: .85 };
    case 'keycap':
      return index % 4 === 0
        ? { scale: [.075, .05, .075], color: item.accent, metallic: .2 }
        : { scale: [random(.05, .14), random(.02, .05), random(.05, .12)], color: item.color, metallic: .45 };
    default:
      return { scale: [random(.06, .15), random(.04, .09), random(.06, .15)], color, metallic: .25 };
  }
}

// Brittle things do not slide in evenly: they hold, load up, then let go. The
// total time is untouched, so the machine still runs at one speed.
function stickSlip(progress, steps) {
  const scaled = progress * steps;
  const index = Math.floor(scaled);
  const phase = scaled - index;
  const hold = .58;
  const eased = phase < hold ? phase * (.16 / hold) : .16 + (phase - hold) / (1 - hold) * .84;
  return Math.min(1, (index + eased) / steps);
}

const vec3 = {
  normalize(v) {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  },
  cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  },
  subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }
};

const mat4 = {
  identity() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  },
  multiply(a, b) {
    const out = new Float32Array(16);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        out[column * 4 + row] =
          a[row] * b[column * 4] +
          a[4 + row] * b[column * 4 + 1] +
          a[8 + row] * b[column * 4 + 2] +
          a[12 + row] * b[column * 4 + 3];
      }
    }
    return out;
  },
  perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const range = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * range, -1, 0, 0, far * near * 2 * range, 0]);
  },
  lookAt(eye, center, up) {
    const z = vec3.normalize(vec3.subtract(eye, center));
    const x = vec3.normalize(vec3.cross(up, z));
    const y = vec3.cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -x[0] * eye[0] - x[1] * eye[1] - x[2] * eye[2],
      -y[0] * eye[0] - y[1] * eye[1] - y[2] * eye[2],
      -z[0] * eye[0] - z[1] * eye[1] - z[2] * eye[2], 1
    ]);
  },
  translate(x, y, z) {
    const out = mat4.identity();
    out[12] = x; out[13] = y; out[14] = z;
    return out;
  },
  scale(x, y, z) {
    const out = mat4.identity();
    out[0] = x; out[5] = y; out[10] = z;
    return out;
  },
  rotateX(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
  },
  rotateY(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  },
  rotateZ(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  },
  compose(position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
    let out = mat4.translate(...position);
    out = mat4.multiply(out, mat4.rotateZ(rotation[2]));
    out = mat4.multiply(out, mat4.rotateY(rotation[1]));
    out = mat4.multiply(out, mat4.rotateX(rotation[0]));
    return mat4.multiply(out, mat4.scale(...scale));
  }
};

function normalMatrix(matrix) {
  const a = matrix;
  const a00 = a[0], a01 = a[1], a02 = a[2];
  const a10 = a[4], a11 = a[5], a12 = a[6];
  const a20 = a[8], a21 = a[9], a22 = a[10];
  const b01 = a22 * a11 - a12 * a21;
  const b11 = -a22 * a10 + a12 * a20;
  const b21 = a21 * a10 - a11 * a20;
  const determinant = a00 * b01 + a01 * b11 + a02 * b21 || 1;
  return new Float32Array([
    b01 / determinant, b11 / determinant, b21 / determinant,
    (-a22 * a01 + a02 * a21) / determinant, (a22 * a00 - a02 * a20) / determinant, (-a21 * a00 + a01 * a20) / determinant,
    (a12 * a01 - a02 * a11) / determinant, (-a12 * a00 + a02 * a10) / determinant, (a11 * a00 - a01 * a10) / determinant
  ]);
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clampToBay(position, margin = .7) {
  const limitX = BAY.halfWidth - margin;
  const limitZ = BAY.halfDepth - margin;
  return [
    Math.max(-limitX, Math.min(limitX, position[0])),
    position[1],
    Math.max(-limitZ, Math.min(limitZ, position[2]))
  ];
}

// Height of the hopper panel under a point: flat across the cutters, rising
// along the four sloped feed panels.
function surfaceY(x, z) {
  const rampX = clamp01((Math.abs(x) - MOUTH.halfWidth) / (BAY.halfWidth - MOUTH.halfWidth));
  const rampZ = clamp01((Math.abs(z) - MOUTH.halfDepth) / (BAY.halfDepth - MOUTH.halfDepth));
  const ramp = Math.max(rampX, rampZ);
  return ramp > 0 ? BAY.floorY + ramp * (BAY.deckTop - BAY.floorY) : DRUM_TOP;
}

// Downhill direction of that panel, so anything landing on a slope always ends
// up in the cutters.
function slideDirection(x, z) {
  const rampX = (Math.abs(x) - MOUTH.halfWidth) / (BAY.halfWidth - MOUTH.halfWidth);
  const rampZ = (Math.abs(z) - MOUTH.halfDepth) / (BAY.halfDepth - MOUTH.halfDepth);
  if (rampX <= 0 && rampZ <= 0) return null;
  if (rampX >= rampZ) return [-Math.sign(x), 0];
  return [0, -Math.sign(z)];
}

// Height of the drum surface a sheet rides on while it is drawn into the nip.
function nipHeight(halfDepth) {
  const ride = Math.min(CUTTER.offset, halfDepth);
  return CUTTER.axisY + Math.sqrt(Math.max(.04, CUTTER.radius ** 2 - (CUTTER.offset - ride) ** 2));
}

// How each shape behaves in the air and when it hits something. A sheet of
// paper catches the air and flutters down flat; a phone drops like a stone and
// slaps onto a face; a disc spins up and rolls on its rim before it lies down.
const FLIGHT = {
  paper: { flutter: 1, roll: 0, restitution: .04, friction: 1.2, tumble: .55 },
  card: { flutter: .5, roll: .15, restitution: .34, friction: .8, tumble: 1 },
  board: { flutter: .3, roll: 0, restitution: .18, friction: .95, tumble: .8 },
  disc: { flutter: .35, roll: 1, restitution: .5, friction: .45, tumble: .3 },
  phone: { flutter: .05, roll: 0, restitution: .16, friction: 1, tumble: 1.1 },
  clock: { flutter: .06, roll: .85, restitution: .46, friction: .6, tumble: 1 },
  keyboard: { flutter: .12, roll: 0, restitution: .14, friction: 1.15, tumble: 1.2 },
  box: { flutter: .28, roll: .1, restitution: .26, friction: .9, tumble: 1 },
  cube: { flutter: .02, roll: .3, restitution: .62, friction: .7, tumble: .9 }
};

const ORIGIN = [0, 0, 0];
const UNIT = [1, 1, 1];
const QUARTER = Math.PI / 2;

function flightProfile(item) {
  return FLIGHT[item.shape] || FLIGHT.card;
}

// Half extents in the object's own frame: across, thickness, along.
function halfExtents(size) {
  return [size[0], size[2], size[1]];
}

function orientation(rotation) {
  return mat4.compose(ORIGIN, rotation, UNIT);
}

// How far the object reaches along a world axis in its current orientation:
// this is what decides how high off the ground it comes to rest.
function extentAlong(model, half, axis) {
  return Math.abs(model[axis]) * half[0] + Math.abs(model[4 + axis]) * half[1] + Math.abs(model[8 + axis]) * half[2];
}

function extentAlongNormal(model, half, n) {
  return Math.abs(model[0] * n[0] + model[1] * n[1] + model[2] * n[2]) * half[0]
    + Math.abs(model[4] * n[0] + model[5] * n[1] + model[6] * n[2]) * half[1]
    + Math.abs(model[8] * n[0] + model[9] * n[1] + model[10] * n[2]) * half[2];
}

// Normal of whatever surface is under a point.
function surfaceNormal(x, z) {
  const dir = slideDirection(x, z);
  if (!dir) return [0, 1, 0];
  const span = dir[0] ? BAY.halfWidth - MOUTH.halfWidth : BAY.halfDepth - MOUTH.halfDepth;
  const rise = BAY.deckTop - BAY.floorY;
  const length = Math.hypot(span, rise);
  return [dir[0] * rise / length, span / length, dir[1] * rise / length];
}

// The angle an object lying on that surface sits at.
function surfaceTilt(x, z) {
  const dir = slideDirection(x, z);
  if (!dir) return null;
  const rise = BAY.deckTop - BAY.floorY;
  if (dir[0]) return [2, -dir[0] * Math.atan2(rise, BAY.halfWidth - MOUTH.halfWidth)];
  return [0, dir[1] * Math.atan2(rise, BAY.halfDepth - MOUTH.halfDepth)];
}

// Square with the ground: whichever face it came down on ends up flat. The
// heading is left alone, because how an object is turned does not change how
// it lies.
function squareUp(rotation) {
  return [Math.round(rotation[0] / QUARTER) * QUARTER, rotation[1], Math.round(rotation[2] / QUARTER) * QUARTER];
}

// If the face it landed on is too small to hold it up, the face it falls onto
// instead. Returns null when it is already sitting as low as it can.
function topple(rotation, half) {
  const model = orientation(rotation);
  const height = extentAlong(model, half, 1);
  const footprint = Math.min(extentAlong(model, half, 0), extentAlong(model, half, 2));
  if (height <= footprint * 1.12) return null;
  let best = null;
  let lowest = height - .01;
  for (const axis of [0, 2]) {
    for (const step of [-QUARTER, QUARTER]) {
      const candidate = [...rotation];
      candidate[axis] += step;
      const drop = extentAlong(orientation(candidate), half, 1);
      if (drop < lowest) {
        lowest = drop;
        best = candidate;
      }
    }
  }
  return best;
}

// Cut an object into strips that line up with the real disc spacing. Only the
// edge in the teeth is ever drawn from these; the rest of the object stays in
// one piece until the cut reaches it.
function buildStrips(item, centerX, halfAcross, mat) {
  const pitch = CUTTER.discPitch;
  const left = centerX - halfAcross;
  const right = centerX + halfAcross;
  const cuts = [left];
  for (let k = Math.ceil(left / pitch); k * pitch < right; k += 1) {
    if (k * pitch > left + .05) cuts.push(k * pitch);
  }
  cuts.push(right);
  const strips = [];
  const brittle = mat.rigidity > RIGID;
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const width = cuts[i + 1] - cuts[i];
    if (width < .03) continue;
    strips.push({
      x: (cuts[i] + cuts[i + 1]) / 2,
      half: width / 2,
      // How much further into the teeth this strip already is, which is what
      // makes the cut edge ragged instead of a clean straight line.
      lead: brittle ? random(.1, 1) : random(0, .5),
      wobble: random(0, 6.3),
      roll: brittle ? random(-.5, .5) : random(-.12, .12),
      color: i % 4 === 1 ? mixColor(item.color, item.accent, .38) : item.color
    });
  }
  return strips;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

function program(gl, vertex, fragment) {
  const result = gl.createProgram();
  gl.attachShader(result, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(result, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(result);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
  return result;
}

function cubeGeometry() {
  const positions = [], normals = [], indices = [];
  const faces = [
    [[0, 0, 1], [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],
    [[0, 0,-1], [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]],
    [[1, 0, 0], [[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]],
    [[-1,0, 0], [[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]],
    [[0, 1, 0], [[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]],
    [[0,-1, 0], [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]]
  ];
  faces.forEach(([normal, vertices], face) => {
    vertices.forEach((vertex) => { positions.push(...vertex); normals.push(...normal); });
    const start = face * 4;
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  });
  return { positions, normals, indices };
}

function cylinderGeometry(segments = 20) {
  const positions = [], normals = [], indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = i / segments * Math.PI * 2;
    const y = Math.cos(angle), z = Math.sin(angle);
    positions.push(-1, y, z, 1, y, z);
    normals.push(0, y, z, 0, y, z);
    if (i < segments) {
      const start = i * 2;
      indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
    }
  }
  const sideCount = positions.length / 3;
  [-1, 1].forEach((x, cap) => {
    const center = positions.length / 3;
    positions.push(x, 0, 0); normals.push(x, 0, 0);
    for (let i = 0; i <= segments; i += 1) {
      const angle = i / segments * Math.PI * 2;
      positions.push(x, Math.cos(angle), Math.sin(angle));
      normals.push(x, 0, 0);
      if (i < segments) {
        const edge = center + 1 + i;
        indices.push(center, cap ? edge : edge + 1, cap ? edge + 1 : edge);
      }
    }
  });
  return { positions, normals, indices, sideCount };
}

function createMesh(gl, geometry) {
  const vao = {};
  vao.position = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vao.position);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.positions), gl.STATIC_DRAW);
  vao.normal = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vao.normal);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.normals), gl.STATIC_DRAW);
  vao.index = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, vao.index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geometry.indices), gl.STATIC_DRAW);
  vao.count = geometry.indices.length;
  return vao;
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function mixColor(a, b, amount) {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount];
}

export class ShredderRenderer extends EventTarget {
  constructor(canvas) {
    super();
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!this.gl) throw new Error('WebGL unavailable');
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.program = program(this.gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.particleProgram = program(this.gl, PARTICLE_VERTEX, PARTICLE_FRAGMENT);
    this.meshes = { cube: createMesh(this.gl, cubeGeometry()), cylinder: createMesh(this.gl, cylinderGeometry(24)) };
    this.items = [];
    this.fragments = [];
    this.particles = [];
    this.debris = [];
    this.preview = null;
    this.cutterAngle = 0;
    this.machineLoad = 0;
    this.shake = 0;
    this.lastTime = performance.now();
    this.camera = [0, BAY.floorY + 14, 2];
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.dispatchEvent(new Event('contextlost'));
    });
    this.resize();
  }

  start() {
    const frame = (time) => {
      const dt = Math.min(0.033, (time - this.lastTime) / 1000);
      this.lastTime = time;
      this.update(dt);
      this.render(time / 1000);
      this.frame = requestAnimationFrame(frame);
    };
    this.frame = requestAnimationFrame(frame);
  }

  resize() {
    const ratioCap = innerWidth < DISPLAY_CONFIG.mobileBreakpoint
      ? DISPLAY_CONFIG.mobilePixelRatioCap
      : DISPLAY_CONFIG.desktopPixelRatioCap;
    const ratio = Math.min(devicePixelRatio || 1, ratioCap);
    const width = Math.floor(this.canvas.clientWidth * ratio);
    const height = Math.floor(this.canvas.clientHeight * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  screenToWorld(clientX, clientY, planeY = BAY.throwPlaneY) {
    const rect = this.canvas.getBoundingClientRect();
    const aspect = rect.width / Math.max(1, rect.height);
    const ndcX = (clientX - rect.left) / rect.width * 2 - 1;
    const ndcY = 1 - (clientY - rect.top) / rect.height * 2;
    const setup = this.cameraSetup(aspect);
    const back = vec3.normalize(vec3.subtract(setup.eye, setup.target));
    const right = vec3.normalize(vec3.cross(setup.up, back));
    const up = vec3.cross(back, right);
    const tan = Math.tan(setup.fov / 2);
    const direction = right.map((value, index) =>
      value * ndcX * tan * aspect + up[index] * ndcY * tan - back[index]);
    const travel = (planeY - setup.eye[1]) / (direction[1] || -1);
    return clampToBay([
      setup.eye[0] + direction[0] * travel,
      planeY,
      setup.eye[2] + direction[2] * travel
    ]);
  }

  cameraSetup(aspect) {
    const tan = Math.tan(CAMERA.fov / 2);
    // Framed on the cutting area rather than the whole bay: the teeth are what
    // you are here to watch.
    const halfX = MOUTH.halfWidth + .3;
    const halfZ = BAY.halfDepth + .2;
    const reach = Math.max(halfZ / tan, halfX / (tan * Math.max(.4, aspect))) * CAMERA.margin
      + (BAY.deckTop - BAY.floorY);
    return {
      fov: CAMERA.fov,
      eye: [0, BAY.floorY + reach, reach * CAMERA.tilt],
      target: [0, BAY.floorY, 0],
      up: [0, 0, -1]
    };
  }

  setPreview(item, position) {
    this.preview = { item, position, rotation: [0, .18, 0] };
  }

  clearPreview() {
    this.preview = null;
  }

  // Start position and velocity for automatic throws: dropped over the hopper
  // so it slides down a feed panel into the cutters.
  rimSpawn() {
    const alongX = Math.random() < .6;
    const edge = Math.random() < .5 ? -1 : 1;
    const x = alongX ? random(-BAY.halfWidth + 1, BAY.halfWidth - 1) : edge * (BAY.halfWidth - 1);
    const z = alongX ? edge * (BAY.halfDepth - .9) : random(-BAY.halfDepth + .9, BAY.halfDepth - .9);
    return {
      position: [x, BAY.wallTop + 1.6, z],
      velocity: [-x * random(.15, .5), random(-.6, .6), -z * random(.15, .5)]
    };
  }

  throwItem(item, position, velocity) {
    const size = shapeSize(item);
    const flight = flightProfile(item);
    const speed = Math.hypot(velocity[0], velocity[1], velocity[2]);
    // A throw does not only move something, it sets it turning. The harder the
    // flick the more it tumbles, and heavy things resist it.
    const twist = flight.tumble * Math.min(2.8, speed * .5) / (.5 + item.mass * .7);
    this.items.push({
      item,
      size,
      half: halfExtents(size),
      flight,
      // How much of the object is surface. A sheet is nearly all surface and
      // rides on the air; a cube is not.
      flat: clamp01(1 - size[2] / Math.max(size[0], size[1])),
      position: clampToBay([...position]),
      velocity: [...velocity],
      // Thrown roughly the way it was held, not at a random angle.
      rotation: [random(-.3, .3), random(0, 6.3), random(-.3, .3)],
      spin: [
        -velocity[2] * twist + random(-.5, .5),
        random(-1, 1) * twist * .4 + (Math.random() < .5 ? -1 : 1) * flight.roll * speed * .8,
        velocity[0] * twist + random(-.5, .5)
      ],
      swayPhase: random(0, 6.3),
      age: 0,
      bounces: 0,
      state: 'flight'
    });
  }

  update(dt) {
    // One steady speed, always. A real shredder never revs up because you
    // threw something at it.
    this.cutterAngle += dt * CUTTER.speed;
    this.machineLoad = Math.max(0, this.machineLoad - dt * 1.1);
    this.shake = Math.max(0, this.shake - dt * 1.8);

    this.items.forEach((body) => {
      body.age += dt;
      if (body.state === 'captured') this.updateCaptured(body, dt);
      else this.updateFlight(body, dt);
    });
    this.items = this.items.filter((body) => !body.dead);

    this.fragments.forEach((fragment) => {
      fragment.life -= dt;
      fragment.velocity[1] -= 9 * dt;
      const slide = slideDirection(fragment.position[0], fragment.position[2]);
      if (slide) {
        fragment.velocity[0] += slide[0] * BAY.slide * .5 * dt;
        fragment.velocity[2] += slide[1] * BAY.slide * .5 * dt;
      } else {
        fragment.velocity[2] -= Math.sign(fragment.position[2] || 1) * 3.2 * dt;
      }
      fragment.position = fragment.position.map((value, index) => value + fragment.velocity[index] * dt);
      fragment.rotation = fragment.rotation.map((value, index) => value + fragment.spin[index] * dt);
      if (!slide && Math.abs(fragment.position[2]) < .26) {
        // Swallowed by the nip. Anything solid enough gets crunched on the way
        // down instead of just vanishing.
        if (fragment.position[1] < CUTTER.axisY + .1) {
          if (fragment.chewable) this.chewFragment(fragment);
          fragment.life = 0;
        }
      } else {
        const ground = surfaceY(fragment.position[0], fragment.position[2]) + .04;
        if (fragment.position[1] < ground) {
          fragment.position[1] = ground;
          fragment.velocity[1] *= -0.22;
          fragment.velocity[0] *= 0.8;
          fragment.velocity[2] *= 0.8;
        }
      }
      const limitX = BAY.halfWidth - .12;
      const limitZ = BAY.halfDepth - .12;
      if (Math.abs(fragment.position[0]) > limitX) {
        fragment.position[0] = Math.sign(fragment.position[0]) * limitX;
        fragment.velocity[0] *= -.4;
      }
      if (Math.abs(fragment.position[2]) > limitZ) {
        fragment.position[2] = Math.sign(fragment.position[2]) * limitZ;
        fragment.velocity[2] *= -.4;
      }
    });
    this.fragments = this.fragments.filter((fragment) => fragment.life > 0);

    this.particles.forEach((particle) => {
      particle.life -= dt;
      particle.velocity[1] -= 3.8 * dt;
      particle.position = particle.position.map((value, index) => value + particle.velocity[index] * dt);
    });
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  updateFlight(body, dt) {
    const model = orientation(body.rotation);
    const ground = surfaceY(body.position[0], body.position[2]);
    const normal = surfaceNormal(body.position[0], body.position[2]);
    const clearance = extentAlongNormal(model, body.half, normal) / Math.max(.35, normal[1]);
    const grounded = body.position[1] <= ground + clearance + .05;
    const slide = slideDirection(body.position[0], body.position[2]);

    body.velocity[1] -= BAY.gravity * dt;
    this.applyAir(body, model, dt, grounded);

    if (slide) {
      // Sloped feed panels: whatever lands on them slides down into the mouth.
      const grip = grounded ? 1 : .25;
      body.velocity[0] += slide[0] * BAY.slide * grip * dt;
      body.velocity[2] += slide[1] * BAY.slide * grip * dt;
      if (grounded) {
        const friction = Math.max(0, 1 - body.flight.friction * 2.8 * dt);
        body.velocity[0] *= friction;
        body.velocity[2] *= friction;
        // Anything that can roll goes down the panel end over end.
        if (body.flight.roll > .1) this.applyRoll(body, dt, body.flight.roll * 5 * dt);
      }
    } else if (grounded) {
      // On the drums the teeth walk the object toward the nip at the machine's
      // own pace, however fast it arrived.
      const target = -Math.sign(body.position[2] || 1) * FEED_SPEED * 1.6;
      const grab = Math.min(1, dt * 4);
      body.velocity[2] += (target - body.velocity[2]) * grab;
      body.velocity[0] -= body.velocity[0] * grab;
    }

    body.position = body.position.map((value, index) => value + body.velocity[index] * dt);
    body.rotation = body.rotation.map((value, index) => value + body.spin[index] * dt);

    this.collideWall(body, model);
    this.collideGround(body, dt, ground, normal, clearance);

    const overMouth = Math.abs(body.position[0]) < MOUTH.halfWidth + .5;
    const atNip = Math.abs(body.position[2]) < CUTTER.offset;
    // The teeth take it once it is down and lying on a face that holds it, not
    // while it is still bouncing, so it goes in the way it landed.
    const down = (body.resting && body.settleTarget && !topple(body.settleTarget, body.half)) || body.age > 9;
    if (overMouth && atNip && down && body.position[1] < DRUM_TOP + clearance + .12) {
      this.capture(body);
    } else if (body.age > 26) {
      body.dead = true;
      this.dispatchEvent(new CustomEvent('miss', { detail: body.item }));
    }
  }

  // Air is not the same for everything. A sheet falling face down has to push a
  // lot of it out of the way, so it slows, slips sideways and rocks; turned
  // edge on it drops. That alone makes paper and a phone fall differently.
  applyAir(body, model, dt, grounded) {
    const velocity = body.velocity;
    const speed = Math.hypot(velocity[0], velocity[1], velocity[2]);
    if (speed < .05) return;
    const face = Math.abs((velocity[0] * model[4] + velocity[1] * model[5] + velocity[2] * model[6]) / speed);
    const area = .18 + .82 * face * body.flat;
    const drag = body.item.drag * area * 2 / Math.max(.2, body.item.mass);
    const slow = Math.min(speed, drag * speed * speed * dt) / speed;
    velocity[0] -= velocity[0] * slow;
    velocity[1] -= velocity[1] * slow;
    velocity[2] -= velocity[2] * slow;
    if (grounded || body.flight.flutter < .05) return;

    // Light flat things do not fall straight down: they slide off to one side,
    // stall, and tip back the other way.
    const phase = body.age * 3.6 + body.swayPhase;
    const push = Math.sin(phase) * body.flight.flutter * area * speed * 1.4 * dt;
    const across = Math.hypot(velocity[0], velocity[2]) || 1;
    velocity[0] += -velocity[2] / across * push;
    velocity[2] += velocity[0] / across * push;
    body.spin[0] += Math.cos(phase) * body.flight.flutter * area * 6 * dt;
    body.spin[2] += Math.sin(phase * .73) * body.flight.flutter * area * 4 * dt;
    body.spin[1] *= Math.max(0, 1 - dt);
  }

  // Rolling without slipping: the axis is across the direction of travel.
  applyRoll(body, dt, grip) {
    const radius = Math.max(.12, (body.half[0] + body.half[2]) * .5);
    const wantX = body.velocity[2] / radius;
    const wantZ = -body.velocity[0] / radius;
    const blend = Math.min(1, grip);
    body.spin[0] += (wantX - body.spin[0]) * blend;
    body.spin[2] += (wantZ - body.spin[2]) * blend;
  }

  collideWall(body, model) {
    const restitution = .18 + body.item.bounce * .5;
    let impact = 0;
    for (const axis of [0, 2]) {
      // How wide the object actually is in that direction right now, so a sheet
      // on its edge can get closer to the wall than a box can.
      const limit = (axis === 0 ? BAY.halfWidth : BAY.halfDepth) - extentAlong(model, body.half, axis) * .75;
      if (Math.abs(body.position[axis]) <= limit) continue;
      const sign = Math.sign(body.position[axis]);
      body.position[axis] = sign * limit;
      if (body.velocity[axis] * sign <= 0) continue;
      impact = Math.max(impact, Math.abs(body.velocity[axis]));
      body.velocity[axis] *= -restitution;
    }
    if (!impact) return;
    // The corner it hits on kicks it into a tumble, and it loses height.
    const twist = Math.min(6, impact * .8) * body.flight.tumble;
    body.velocity[1] *= .84;
    body.spin[0] += random(-twist, twist);
    body.spin[1] += random(-twist, twist) * .5;
    body.spin[2] += random(-twist, twist);
    body.settleTarget = null;
    body.bounces += 1;
    this.spark([...body.position], body.item.accent, 5);
    this.shake = this.reducedMotion ? 0 : Math.max(this.shake, Math.min(.3, impact * .03));
    this.dispatchEvent(new CustomEvent('bounce', {
      detail: { item: body.item, intensity: Math.min(1, impact / 12) }
    }));
  }

  // Landing. Where an object comes to rest depends on how it is lying, so a
  // sheet ends up flush with the deck and a cube sits up on a face.
  collideGround(body, dt, ground, normal, clearance) {
    const rest = ground + clearance;
    if (body.position[1] > rest) {
      // Rocking on the spot changes how high the object has to sit. That must
      // not throw it back into the air, or it never comes to rest.
      if (body.resting && body.position[1] < rest + .14 && body.velocity[1] < .5) {
        body.position[1] = rest;
        body.velocity[1] = 0;
      } else {
        body.resting = false;
        body.settleTarget = null;
        return;
      }
    }
    const impact = -body.velocity[1];
    body.position[1] = rest;
    const flight = body.flight;

    if (impact > 1) {
      // A real hit: it comes back up, and whatever corner struck first throws
      // it into a tumble.
      body.velocity[1] = impact * flight.restitution;
      const twist = Math.min(7, impact * .9) * flight.tumble;
      body.spin[0] += random(-twist, twist) * .6 + body.velocity[2] * .7;
      body.spin[1] += random(-twist, twist) * .3;
      body.spin[2] += random(-twist, twist) * .6 - body.velocity[0] * .7;
      const skid = Math.max(0, 1 - flight.friction * .35);
      body.velocity[0] *= skid;
      body.velocity[2] *= skid;
      body.settleTarget = null;
      body.resting = false;
      body.rollTime = 0;
      if (impact > 2) {
        this.spark([body.position[0], rest, body.position[2]], body.item.accent, Math.min(9, Math.round(impact)));
        this.dispatchEvent(new CustomEvent('bounce', {
          detail: { item: body.item, intensity: Math.min(1, impact / 9) }
        }));
      }
      return;
    }

    body.resting = true;
    body.velocity[1] = Math.max(0, body.velocity[1]);
    const friction = Math.max(0, 1 - flight.friction * 7 * dt);
    body.velocity[0] *= friction;
    body.velocity[2] *= friction;
    this.settleOrientation(body, dt);
  }

  // Down but not yet still: it drops onto the face it landed on, wobbles, and
  // if that face is too small to hold it up it tips over onto one that is not.
  settleOrientation(body, dt) {
    const speed = Math.hypot(body.velocity[0], body.velocity[2]);
    body.rollTime = (body.rollTime || 0) + dt;
    if (body.flight.roll > .2 && speed > 1.1 && body.rollTime < body.flight.roll * 1.3) {
      // Round things run on their rim for a moment before they lie down.
      this.applyRoll(body, dt, dt * 6);
      body.settleTarget = null;
      return;
    }
    if (!body.settleTarget) {
      const target = squareUp(body.rotation);
      // On a feed panel it lies along the slope, not flat.
      const tilt = surfaceTilt(body.position[0], body.position[2]);
      if (tilt) target[tilt[0]] += tilt[1];
      body.settleTarget = target;
    }
    const target = body.settleTarget;
    const offset = Math.abs(target[0] - body.rotation[0]) + Math.abs(target[2] - body.rotation[2]);
    const slow = Math.abs(body.spin[0]) + Math.abs(body.spin[2]);
    if (offset < .17 && slow < 1.4) {
      const tip = topple(target, body.half);
      if (tip) {
        body.settleTarget = tip;
        // It goes over the edge rather than easing across.
        body.spin[0] += (tip[0] - target[0]) * 1.8;
        body.spin[2] += (tip[2] - target[2]) * 1.8;
        this.dispatchEvent(new CustomEvent('bounce', {
          detail: { item: body.item, intensity: .18 + body.item.mass * .12 }
        }));
      } else if (offset < .03 && slow < .3) {
        body.rotation[0] = target[0];
        body.rotation[2] = target[2];
        body.spin[0] = 0;
        body.spin[2] = 0;
        return;
      }
    }
    // A spring onto the face, loose enough that heavy things rock once or
    // twice before they stop.
    const damping = Math.max(0, 1 - (5 + body.flight.friction * 4) * dt);
    for (const axis of [0, 2]) {
      body.spin[axis] += (body.settleTarget[axis] - body.rotation[axis]) * 34 * dt;
      body.spin[axis] *= damping;
    }
    body.spin[1] *= Math.max(0, 1 - 4 * dt);
  }

  capture(body) {
    const size = body.size;
    const mat = material(body.item);
    body.state = 'captured';
    body.velocity = [0, 0, 0];
    body.material = mat;
    body.feedSide = Math.sign(body.position[2]) || 1;

    // It goes in the way it was lying. Squaring it up with the machine is all
    // the teeth do to it: whichever face ended up down stays down.
    const squared = body.settleTarget ? [...body.settleTarget] : squareUp(body.rotation);
    squared[1] = Math.round(squared[1] / QUARTER) * QUARTER;
    body.captureRotation = squared;
    const model = orientation(squared);
    const local = [size[0], size[2], size[1]];
    // Anything too tall to pass between the drums is not fed through at all.
    // It is held over the nip and ground away from the bottom up.
    const standing = extentAlong(model, body.half, 1);
    body.feedMode = standing > CUTTER.offset * .85 ? 'plunge' : 'sheet';
    const heading = body.feedMode === 'plunge' ? [0, -1, 0] : [0, 0, -body.feedSide];

    // Which of the object's own axes runs into the teeth, and which runs across
    // the shafts.
    body.feedAxis = 0;
    body.acrossAxis = 0;
    let along = 0;
    let across = 0;
    for (let i = 0; i < 3; i += 1) {
      const dot = model[i * 4] * heading[0] + model[i * 4 + 1] * heading[1] + model[i * 4 + 2] * heading[2];
      if (Math.abs(dot) > Math.abs(along)) { along = dot; body.feedAxis = i; }
      if (Math.abs(model[i * 4]) > Math.abs(across)) { across = model[i * 4]; body.acrossAxis = i; }
    }
    body.feedEnter = along > 0 ? -1 : 1;
    body.feedLength = local[body.feedAxis] * 2;
    body.across = local[body.acrossAxis];
    body.deep = extentAlong(model, body.half, 2);
    const reach = Math.max(.2, MOUTH.halfWidth - body.across);
    body.position[0] = Math.max(-reach, Math.min(reach, body.position[0]));

    body.grab = 0;
    body.grabDuration = this.reducedMotion ? mat.grab * .5 : mat.grab;
    body.judder = 0;
    body.feed = 0;
    body.feedTime = 0;
    // Stiff material fights the teeth, so it goes through slower. Still one
    // fixed pace per object: how hard it was thrown changes nothing.
    body.feedDuration = Math.max(1.6, body.feedLength / (FEED_SPEED * (1 - mat.rigidity * .42)));
    body.crunches = Math.max(2, Math.round(body.feedLength / (CUTTER.discPitch * (.8 + mat.rigidity * .8))));
    body.step = -1;
    body.strips = buildStrips(body.item, body.position[0], body.across, mat);
    body.nextBite = 0;
    body.jam = 0;
    // Every object is destroyed piece by piece, in the order the teeth reach
    // them along whichever way it went in.
    body.parts = itemParts(body.item).map((part) => {
      const centre = [part.x, part.y, part.z][body.feedAxis] * body.feedEnter;
      const half = [part.w, part.h, part.d][body.feedAxis];
      return { part, front: (centre - half + 1) / 2, back: (centre + half + 1) / 2, gone: false };
    });
    this.machineLoad = 1;
    this.shake = this.reducedMotion ? 0 : .22;
    this.dispatchEvent(new CustomEvent('impact', {
      detail: { item: body.item, intensity: .5 + body.item.mass * .3 }
    }));
  }

  // The object is dragged in at the machine's constant rate. It is grabbed and
  // worked over first, then eaten: smoothly if it is soft, in hard steps if it
  // is not. Nothing here depends on how it was thrown.
  updateCaptured(body, dt) {
    const mat = body.material;
    const settle = Math.min(1, dt * 5);
    body.position[2] -= body.position[2] * settle;
    for (let i = 0; i < 3; i += 1) {
      body.rotation[i] += (body.captureRotation[i] - body.rotation[i]) * settle;
    }
    body.judder = Math.max(0, body.judder - dt * 3.6);
    this.machineLoad = 1;
    this.shake = this.reducedMotion ? 0 : Math.max(this.shake, .1 + body.judder * .12);

    // The teeth catch the edge and work it over before anything gives way.
    if (body.grab < 1) {
      body.grab = Math.min(1, body.grab + dt / body.grabDuration);
      if (body.grab >= 1) {
        body.judder = mat.rigidity;
        this.crunch(body, mat.rigidity > RIGID ? 1.1 : .6);
      }
      return;
    }

    // Something the teeth cannot cut: the machine stalls against it, shakes
    // itself, and only gets moving again once the piece gives.
    if (body.jam > 0) {
      body.jam -= dt;
      body.judder = Math.max(body.judder, .8);
      if (Math.random() < dt * 26) {
        this.spark([body.position[0] + random(-.5, .5), nipHeight(0) + .14, random(-.2, .2)], [1, .62, .22], 5);
      }
      if (body.jam <= 0) this.crunch(body, 1.6);
      return;
    }

    body.feedTime = Math.min(1, body.feedTime + dt / body.feedDuration);
    if (mat.rigidity > RIGID) {
      body.feed = stickSlip(body.feedTime, body.crunches);
      const step = Math.min(body.crunches - 1, Math.floor(body.feedTime * body.crunches));
      if (step > body.step) {
        body.step = step;
        body.judder = .6 + mat.rigidity * .5;
        this.crunch(body, .9 + mat.rigidity * .4);
      }
    } else {
      body.feed = body.feedTime;
    }

    this.updateParts(body);

    const fed = body.feed * body.feedLength;
    if (fed >= body.nextBite) {
      this.bite(body, body.feed);
      body.nextBite = fed + BITE_STEP;
    }
    if (body.feed >= 1) {
      body.dead = true;
      this.destroy(body);
    }
  }

  // Walk the cut line through the object. Anything it reaches is dealt with
  // according to what it is: bolted-on pieces are flicked off just before the
  // teeth get them, glass bursts, and whatever was inside falls out.
  updateParts(body) {
    const cut = body.feed;
    for (const state of body.parts) {
      if (state.gone) continue;
      const part = state.part;
      if (part.jam && !state.jammed && cut >= state.front - .05) {
        state.jammed = true;
        body.jam = part.jam;
        this.shake = this.reducedMotion ? 0 : .45;
        this.spark([body.position[0], nipHeight(0) + .16, 0], [1, .7, .3], 22);
        this.dispatchEvent(new CustomEvent('jam', { detail: { item: body.item } }));
        return;
      }
      if (part.kind === 'loose' || part.kind === 'core') {
        if (cut >= state.front - .04) this.detachPart(body, state);
      } else if (part.kind === 'glass') {
        // Brittle material does not get cut, it cracks: a burst of shards
        // every time the teeth take another bite out of it.
        if (cut < state.front) continue;
        const grain = (state.back - state.front) / (part.shatter || 5);
        if (state.cracked === undefined) {
          state.cracked = state.front;
          this.shatterPart(body, state, 2.4);
        }
        while (cut >= state.cracked + grain) {
          state.cracked += grain;
          this.shatterPart(body, state, 1);
        }
        if (cut >= state.back) state.gone = true;
      } else if (cut >= state.back) {
        state.gone = true;
      }
    }
  }

  // A part that was only held on by the object around it: it pops out, lands
  // on the deck and gets dragged back in for a second helping.
  detachPart(body, state) {
    const part = state.part;
    const size = body.size;
    state.gone = true;
    const pop = part.pop ?? .5;
    const position = this.partWorld(body, state, Math.max(body.feed, state.front));
    this.fragments.push({
      mesh: part.mesh,
      position,
      velocity: [
        part.x * 1.4 + random(-1, 1) * pop,
        random(1.4, 3.6) * (.5 + pop),
        -body.feedSide * random(.2, 1.8) * pop
      ],
      rotation: [random(0, 6), random(0, 6), random(0, 6)],
      spin: [random(-9, 9), random(-9, 9), random(-9, 9)],
      scale: [part.w * size[0], part.h * size[2], part.d * size[1]],
      color: partColor(part, body.item),
      metallic: part.gloss,
      glow: part.glow || 0,
      life: random(3.4, 5.5),
      chewable: true
    });
    if (part.flash) {
      // Something that really should not have gone through a shredder.
      this.spark(position, [1, .92, .6], this.reducedMotion ? 6 : 26);
      this.shake = this.reducedMotion ? 0 : .5;
      this.dispatchEvent(new CustomEvent('bite', { detail: { item: body.item, intensity: 1.8 } }));
    } else {
      this.spark(position, partColor(part, body.item), 3);
    }
  }

  // A crack running through brittle material: shards off the edge that is in
  // the teeth right now.
  shatterPart(body, state, strength = 1) {
    const part = state.part;
    const size = body.size;
    const count = this.reducedMotion ? 2 : Math.round(2 + strength * 2.4);
    const origin = this.partWorld(body, state, Math.max(body.feed, state.front));
    const color = partColor(part, body.item);
    for (let i = 0; i < count; i += 1) {
      const spread = random(-1, 1) * part.w * size[0];
      this.fragments.push({
        mesh: 'cube',
        position: [origin[0] + spread, origin[1] + .05, origin[2] + random(-.1, .1)],
        velocity: [spread * random(.6, 1.8), random(1.4, 3.4) * strength, random(-1.8, 1.8)],
        rotation: [random(0, 6), random(0, 6), random(0, 6)],
        spin: [random(-13, 13), random(-13, 13), random(-13, 13)],
        scale: [part.w * size[0] * random(.1, .26), Math.max(.012, part.h * size[2] * .7), part.d * size[1] * random(.1, .26)],
        color,
        metallic: part.gloss,
        glow: part.glow || 0,
        life: random(2.4, 4.2),
        chewable: true
      });
    }
    this.spark(origin, color, this.reducedMotion ? 3 : Math.round(6 * strength));
    this.shake = this.reducedMotion ? 0 : Math.max(this.shake, .16 + strength * .1);
    this.dispatchEvent(new CustomEvent('bite', {
      detail: { item: body.item, intensity: .7 + strength * .5 }
    }));
  }

  // The part of the object that is sitting at the teeth right now, so the
  // shreds coming out are made of whatever is actually being cut.
  partAtCut(body) {
    for (const state of body.parts) {
      if (state.gone) continue;
      const part = state.part;
      if (part.kind !== 'shell' && part.kind !== 'trim') continue;
      if (body.feed >= state.front && body.feed <= state.back) return part;
    }
    return null;
  }

  // A piece snapping off: louder, sharper and with a shower of material.
  crunch(body, strength) {
    const count = this.reducedMotion ? 2 : Math.round(3 + strength * 4);
    const mat = body.material;
    const span = Math.max(.2, body.size[0] * .8);
    const under = body.feedMode === 'plunge' ? Math.min(BAY.halfDepth - .3, body.deep) : 0;
    for (let i = 0; i < count; i += 1) {
      const piece = debrisPiece(mat, body.item, i);
      const side = Math.random() < .5 ? -1 : 1;
      this.fragments.push({
        position: [body.position[0] + random(-span, span), nipHeight(0) + .12, under ? side * under : random(-.16, .16)],
        velocity: [random(-2, 2), random(1.6, 3.6) * strength, under ? side * random(1.2, 3) : random(-2.2, 2.2)],
        rotation: [random(0, 6), random(0, 6), random(0, 6)],
        spin: [random(-9, 9), random(-9, 9), random(-9, 9)],
        scale: piece.scale,
        color: piece.color,
        metallic: piece.metallic,
        life: random(1.8, 3.4)
      });
    }
    this.spark([body.position[0] + random(-span, span), nipHeight(0) + .14, 0],
      mat.rigidity > RIGID ? [1, .58, .2] : body.item.accent,
      Math.round(count * (1 + mat.rigidity * 1.6)));
    this.shake = this.reducedMotion ? 0 : Math.max(this.shake, .18 + mat.rigidity * .16);
    this.dispatchEvent(new CustomEvent('bite', {
      detail: { item: body.item, intensity: .8 + strength * .6 }
    }));
  }

  // One tooth pass: a few pieces torn off and flicked out of the nip. The
  // shreds are made of whatever part of the object is at the teeth right now,
  // and when the object is being ground from below they come out from under
  // its edges.
  bite(body, progress) {
    const count = this.reducedMotion ? 2 : 3 + Math.round(body.item.mass);
    const hard = body.item.sound > .65;
    const span = Math.max(.2, body.size[0]);
    const cutting = this.partAtCut(body);
    const under = body.feedMode === 'plunge' ? Math.min(BAY.halfDepth - .3, body.deep) : 0;
    for (let i = 0; i < count; i += 1) {
      const strip = body.strips[Math.floor(Math.random() * body.strips.length)] || { x: body.position[0] };
      const piece = debrisPiece(body.material, body.item, i);
      const side = Math.random() < .5 ? -1 : 1;
      this.fragments.push({
        mesh: 'cube',
        position: [strip.x + random(-.06, .06), nipHeight(0) + .1, under ? side * under : random(-.12, .12)],
        velocity: [random(-1.1, 1.1), random(1.2, 2.8), under ? side * random(1, 2.6) : random(-1.6, 1.6)],
        rotation: [random(0, 6), random(0, 6), random(0, 6)],
        spin: [random(-6, 6), random(-6, 6), random(-6, 6)],
        scale: piece.scale,
        color: cutting ? partColor(cutting, body.item) : piece.color,
        metallic: cutting ? cutting.gloss : piece.metallic,
        life: random(1.8, 3.4)
      });
    }
    this.spark([body.position[0] + random(-span, span), nipHeight(0) + .12, 0],
      hard ? [1, .52, .16] : body.item.accent, hard ? count * 2 : count);
    this.dispatchEvent(new CustomEvent('bite', {
      detail: { item: body.item, intensity: .45 + progress * .35 }
    }));
  }

  destroy(body) {
    const count = this.reducedMotion ? 3 : 5 + Math.round(body.item.mass * 2);
    for (let i = 0; i < count; i += 1) {
      const piece = debrisPiece(body.material, body.item, i);
      this.fragments.push({
        position: [body.position[0] + random(-body.size[0], body.size[0]), nipHeight(0) + .12, random(-.14, .14)],
        velocity: [random(-1.6, 1.6), random(1.6, 3.4), random(-2, 2)],
        rotation: [random(0, 6), random(0, 6), random(0, 6)],
        spin: [random(-8, 8), random(-8, 8), random(-8, 8)],
        scale: piece.scale,
        color: piece.color,
        metallic: piece.metallic,
        life: random(2, 3.6)
      });
    }
    for (let i = 0; i < Math.max(2, Math.round(body.item.mass * 2)); i += 1) {
      const alongX = Math.random() < .5;
      const side = Math.random() < .5 ? -1 : 1;
      const ramp = random(.15, .85);
      const x = alongX
        ? random(-BAY.halfWidth + .4, BAY.halfWidth - .4)
        : side * (MOUTH.halfWidth + ramp * (BAY.halfWidth - MOUTH.halfWidth));
      const z = alongX
        ? side * (MOUTH.halfDepth + ramp * (BAY.halfDepth - MOUTH.halfDepth))
        : random(-BAY.halfDepth + .4, BAY.halfDepth - .4);
      const tilt = alongX
        ? [-side * Math.atan2(BAY.deckTop - BAY.floorY, BAY.halfDepth - MOUTH.halfDepth), random(0, 6), 0]
        : [0, random(0, 6), side * Math.atan2(BAY.deckTop - BAY.floorY, BAY.halfWidth - MOUTH.halfWidth)];
      const piece = debrisPiece(body.material, body.item, i);
      this.debris.push({
        position: [x, surfaceY(x, z) + .05, z],
        rotation: tilt,
        scale: piece.scale,
        color: piece.color
      });
    }
    while (this.debris.length > 42) this.debris.shift();
    this.dispatchEvent(new CustomEvent('shred', { detail: body.item }));
  }

  spark(position, color, count) {
    for (let i = 0; i < count; i += 1) {
      this.particles.push({
        position: [...position],
        velocity: [random(-2.4, 2.4), random(0.6, 3.6), random(-1.6, 1.6)],
        color,
        life: random(.3, 1)
      });
    }
  }

  // A piece that popped off earlier and has now found its own way back into
  // the teeth.
  chewFragment(fragment) {
    const position = [fragment.position[0], nipHeight(0) + .1, 0];
    const size = Math.max(...fragment.scale);
    for (let i = 0; i < (this.reducedMotion ? 1 : 3); i += 1) {
      this.fragments.push({
        position: [...position],
        velocity: [random(-1.4, 1.4), random(1.4, 3), random(-1.4, 1.4)],
        rotation: [random(0, 6), random(0, 6), random(0, 6)],
        spin: [random(-9, 9), random(-9, 9), random(-9, 9)],
        scale: [size * random(.2, .4), size * .3, size * random(.2, .45)],
        color: fragment.color,
        metallic: fragment.metallic,
        life: random(1.4, 2.6)
      });
    }
    this.spark(position, fragment.metallic > .6 ? [1, .6, .22] : fragment.color, this.reducedMotion ? 3 : 9);
    this.machineLoad = Math.max(this.machineLoad, .7);
    this.shake = this.reducedMotion ? 0 : Math.max(this.shake, .16);
    this.dispatchEvent(new CustomEvent('chew', { detail: { size } }));
  }

  render(time) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.018, 0.03, 0.04, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const setup = this.cameraSetup(aspect);
    const camera = [
      setup.eye[0] + (this.shake ? Math.sin(time * 83) * .07 * this.shake : 0),
      setup.eye[1],
      setup.eye[2] + (this.shake ? Math.cos(time * 71) * .07 * this.shake : 0)
    ];
    const projection = mat4.perspective(setup.fov, aspect, .1, 140);
    const view = mat4.lookAt(camera, setup.target, setup.up);
    this.camera = camera;
    this.beginShapes(projection, view);
    this.drawEnvironment();
    this.drawMachine();
    this.items.forEach((body) => {
      if (body.state === 'captured') this.drawShredding(body, time);
      else this.drawItem(body.item, body.position, body.rotation, 1);
    });
    if (this.preview) this.drawItem(this.preview.item, this.preview.position, this.preview.rotation, 1);
    this.fragments.forEach((fragment) => this.draw(fragment.mesh || 'cube', fragment.position, fragment.rotation, fragment.scale, fragment.color, fragment.metallic ?? .1, fragment.glow || 0));
    this.debris.forEach((fragment) => this.draw(fragment.mesh || 'cube', fragment.position, fragment.rotation, fragment.scale, fragment.color, 0.05));
    this.drawParticles(projection, view);
  }

  beginShapes(projection, view) {
    const gl = this.gl;
    gl.useProgram(this.program);
    this.shapeLocations ||= {
      position: gl.getAttribLocation(this.program, 'aPosition'),
      normal: gl.getAttribLocation(this.program, 'aNormal'),
      projection: gl.getUniformLocation(this.program, 'uProjection'),
      view: gl.getUniformLocation(this.program, 'uView'),
      model: gl.getUniformLocation(this.program, 'uModel'),
      normalMatrix: gl.getUniformLocation(this.program, 'uNormalMatrix'),
      color: gl.getUniformLocation(this.program, 'uColor'),
      metallic: gl.getUniformLocation(this.program, 'uMetallic'),
      glow: gl.getUniformLocation(this.program, 'uGlow'),
      camera: gl.getUniformLocation(this.program, 'uCamera')
    };
    gl.uniformMatrix4fv(this.shapeLocations.projection, false, projection);
    gl.uniformMatrix4fv(this.shapeLocations.view, false, view);
    gl.uniform3fv(this.shapeLocations.camera, this.camera);
    this.boundMesh = null;
  }

  draw(meshName, position, rotation, scale, color, metallic = .5, glow = 0) {
    this.drawModel(meshName, mat4.compose(position, rotation, scale), color, metallic, glow);
  }

  drawModel(meshName, model, color, metallic = .5, glow = 0) {
    const gl = this.gl;
    const mesh = this.meshes[meshName];
    if (this.boundMesh !== meshName) {
      this.boundMesh = meshName;
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position);
      gl.enableVertexAttribArray(this.shapeLocations.position);
      gl.vertexAttribPointer(this.shapeLocations.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normal);
      gl.enableVertexAttribArray(this.shapeLocations.normal);
      gl.vertexAttribPointer(this.shapeLocations.normal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
    }
    gl.uniformMatrix4fv(this.shapeLocations.model, false, model);
    gl.uniformMatrix3fv(this.shapeLocations.normalMatrix, false, normalMatrix(model));
    gl.uniform3fv(this.shapeLocations.color, color);
    gl.uniform1f(this.shapeLocations.metallic, metallic);
    gl.uniform1f(this.shapeLocations.glow, glow);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  drawEnvironment() {
    const wall = [.062, .09, .105];
    const rim = [.11, .26, .32];
    const panel = [.115, .155, .175];
    const panelRib = [.16, .32, .38];
    const ground = [.022, .034, .042];
    const halfX = BAY.halfWidth;
    const halfZ = BAY.halfDepth;
    const thickness = BAY.wallThickness;
    const rise = BAY.deckTop - BAY.floorY;
    const spanX = halfX - MOUTH.halfWidth;
    const spanZ = halfZ - MOUTH.halfDepth;
    const angleX = Math.atan2(rise, spanX);
    const angleZ = Math.atan2(rise, spanZ);
    const lengthX = Math.hypot(spanX, rise) / 2;
    const lengthZ = Math.hypot(spanZ, rise) / 2;
    const mid = (BAY.floorY + BAY.deckTop) / 2;
    const wallMid = (BAY.wallTop + BAY.deckTop) / 2 - .5;
    const wallHalf = (BAY.wallTop - BAY.deckTop) / 2 + .5;

    // Machine top around the hopper, drawn as a frame so it never covers the bay.
    for (const side of [-1, 1]) {
      const outerX = halfX + thickness;
      const outerZ = halfZ + thickness;
      this.draw('cube', [side * (outerX + 4.5), BAY.wallTop - .3, 0], [0, 0, 0],
        [4.5, .25, outerZ + 9], ground, .35);
      this.draw('cube', [0, BAY.wallTop - .3, side * (outerZ + 4.5)], [0, 0, 0],
        [outerX, .25, 4.5], ground, .35);
      this.draw('cube', [side * (halfX + thickness / 2), wallMid, 0], [0, 0, 0],
        [thickness / 2, wallHalf, halfZ + thickness], wall, .7);
      this.draw('cube', [0, wallMid, side * (halfZ + thickness / 2)], [0, 0, 0],
        [halfX + thickness, wallHalf, thickness / 2], wall, .7);
      this.draw('cube', [side * (halfX + thickness / 2), BAY.wallTop + .06, 0], [0, 0, 0],
        [thickness / 2 + .06, .1, halfZ + thickness + .12], rim, .85, .06);
      this.draw('cube', [0, BAY.wallTop + .06, side * (halfZ + thickness / 2)], [0, 0, 0],
        [halfX + thickness + .12, .1, thickness / 2 + .06], rim, .85, .06);

      // Sloped feed panels, offset so their top face is the surface objects slide on.
      const tiltX = side > 0 ? angleX : Math.PI - angleX;
      const tiltZ = side > 0 ? -angleZ : angleZ - Math.PI;
      this.draw('cube',
        [side * (MOUTH.halfWidth + halfX) / 2 + Math.sin(tiltX) * .18, mid - Math.cos(tiltX) * .18, 0],
        [0, 0, tiltX], [lengthX, .18, halfZ + thickness], panel, .55);
      this.draw('cube',
        [0, mid - Math.cos(tiltZ) * .18, side * (MOUTH.halfDepth + halfZ) / 2 - Math.sin(tiltZ) * .18],
        [tiltZ, 0, 0], [halfX + thickness, .18, lengthZ], panel, .55);

      for (const along of [-.62, 0, .62]) {
        this.draw('cube',
          [side * (MOUTH.halfWidth + halfX) / 2 + Math.sin(tiltX) * .19, mid - Math.cos(tiltX) * .19, along * (halfZ + thickness)],
          [0, 0, tiltX], [lengthX * .96, .19, .05], panelRib, .8, .05);
        this.draw('cube',
          [along * (halfX + thickness), mid - Math.cos(tiltZ) * .19, side * (MOUTH.halfDepth + halfZ) / 2 - Math.sin(tiltZ) * .19],
          [tiltZ, 0, 0], [.05, .19, lengthZ * .96], panelRib, .8, .05);
      }
    }

    // Hazard band along both long edges of the cutter mouth.
    const stripes = 18;
    for (let i = 0; i < stripes; i += 1) {
      const x = (i / (stripes - 1) - .5) * 2 * (MOUTH.halfWidth + .2);
      for (const side of [-1, 1]) {
        this.draw('cube', [x, BAY.floorY + .24, side * (MOUTH.halfDepth + .3)], [0, 0, 0],
          [(MOUTH.halfWidth + .2) / stripes * .85, .06, .28],
          i % 2 ? [.94, .68, .1] : [.07, .1, .12], .3, i % 2 ? .3 : 0);
      }
    }
  }

  drawMachine() {
    const steel = [.36, .4, .42];
    const steelDark = [.14, .17, .19];
    const core = [.08, .1, .12];
    const housing = [.03, .16, .25];
    const housingEdge = [.08, .36, .5];
    const throat = [.012, .02, .026];
    const pulse = .1 + this.machineLoad * .22;

    for (const side of [-1, 1]) {
      this.draw('cube', [0, BAY.floorY - .1, side * (MOUTH.halfDepth + .3)], [0, 0, 0],
        [MOUTH.halfWidth + .6, .32, .3], housing, .8);
      this.draw('cube', [side * (MOUTH.halfWidth + .3), BAY.floorY - .1, 0], [0, 0, 0],
        [.3, .32, MOUTH.halfDepth + .6], housing, .8);
      this.draw('cube', [side * (MOUTH.halfWidth + .3), BAY.floorY + .23, 0], [0, 0, 0],
        [.3, .05, MOUTH.halfDepth + .6], housingEdge, .9, pulse);
    }

    this.draw('cube', [0, CUTTER.axisY - 1.4, 0], [0, 0, 0],
      [MOUTH.halfWidth, 1.1, MOUTH.halfDepth], throat, .1);

    const discs = Math.floor(MOUTH.halfWidth / CUTTER.discPitch);
    const toothStep = Math.PI * 2 / CUTTER.teeth;
    [-CUTTER.offset, CUTTER.offset].forEach((z, index) => {
      const spin = index ? -this.cutterAngle : this.cutterAngle;
      this.draw('cylinder', [0, CUTTER.axisY, z], [0, 0, 0], [MOUTH.halfWidth, .27, .27], core, .9);
      for (let i = -discs; i <= discs; i += 1) {
        const x = i * CUTTER.discPitch + (index ? CUTTER.discPitch / 2 : 0);
        if (Math.abs(x) > MOUTH.halfWidth - .04) continue;
        this.draw('cylinder', [x, CUTTER.axisY, z], [0, 0, 0],
          [CUTTER.discHalf, CUTTER.radius * .8, CUTTER.radius * .8], steelDark, 1);
        for (let tooth = 0; tooth < CUTTER.teeth; tooth += 1) {
          const a = spin + tooth * toothStep;
          this.draw('cube',
            [x, CUTTER.axisY + Math.cos(a) * CUTTER.radius * .84, z + Math.sin(a) * CUTTER.radius * .84],
            [a + .34, 0, 0], [CUTTER.discHalf, CUTTER.radius * .24, .1], steel, 1);
        }
      }
      for (const x of [-(MOUTH.halfWidth + .16), MOUTH.halfWidth + .16]) {
        this.draw('cylinder', [x, CUTTER.axisY, z], [0, 0, 0], [.16, CUTTER.radius * .6, CUTTER.radius * .6], steel, 1);
      }
    });
  }

  // Height the object rides at, `dist` back from the nip: soft material drapes
  // over the drum, stiff material stays straight and tips instead.
  feedHeight(body, dist) {
    const mat = body.material;
    const flex = 1 - mat.rigidity;
    const bend = clamp01(body.grab);
    const length = Math.max(.25, body.feedLength * (1 - body.feed));
    const slope = (DRUM_TOP - nipHeight(0)) / Math.max(.4, Math.min(length, CUTTER.offset * 1.9));
    const rest = Math.min(DRUM_TOP, nipHeight(dist) * flex + Math.min(DRUM_TOP, nipHeight(0) + dist * slope) * (1 - flex));
    // While the teeth work on the edge the far end rears up, then the object
    // gives way. Every piece that snaps off bucks it again.
    const kick = Math.sin(bend * Math.PI) * (.09 + mat.rigidity * .2) + body.judder * .06;
    const lift = kick * clamp01(dist / Math.max(.5, length));
    // A tail long enough to still hang over a feed panel rests on top of it
    // instead of sinking through it.
    const panel = surfaceY(body.position[0], body.position[2] + body.feedSide * dist) + .02;
    return Math.max(DRUM_TOP + (rest - DRUM_TOP) * bend + lift, panel);
  }

  // Frame for a slice of the object `dist` back from the teeth, squared with
  // the machine: local x runs across the shafts and z runs back along the feed.
  // The strips the discs cut are drawn in this frame, because the discs are
  // fixed to the machine however the object went in.
  combFrame(body, dist, shiver = 0) {
    if (body.feedMode === 'plunge') {
      return mat4.compose(
        [body.position[0] + shiver, nipHeight(0) + dist, body.position[2]],
        [-QUARTER + body.judder * .04, 0, 0],
        UNIT
      );
    }
    const behind = this.feedHeight(body, Math.max(0, dist - .07));
    const ahead = this.feedHeight(body, dist + .07);
    const tilt = Math.atan2(ahead - behind, .14);
    return mat4.compose(
      [body.position[0] + shiver, this.feedHeight(body, Math.max(0, dist)), body.position[2] + body.feedSide * dist],
      [-tilt, body.feedSide > 0 ? 0 : Math.PI, 0],
      UNIT
    );
  }

  // The same slice, but keeping the object's own orientation. Nothing is laid
  // flat to be shredded: a sheet goes through the way it was lying and a solid
  // object is held over the nip and ground down from below.
  bodyFrame(body, dist, shiver = 0) {
    const model = orientation(body.rotation);
    if (body.feedMode === 'plunge') {
      return mat4.multiply(
        mat4.translate(body.position[0] + shiver, nipHeight(0) + dist, body.position[2]),
        model
      );
    }
    const behind = this.feedHeight(body, Math.max(0, dist - .07));
    const ahead = this.feedHeight(body, dist + .07);
    const tilt = Math.atan2(ahead - behind, .14);
    return mat4.multiply(
      mat4.compose(
        [body.position[0] + shiver, this.feedHeight(body, Math.max(0, dist)), body.position[2] + body.feedSide * dist],
        [-tilt, 0, 0],
        UNIT
      ),
      model
    );
  }

  partWorld(body, state, v) {
    const model = this.bodyFrame(body, Math.max(0, (v - body.feed) * body.feedLength));
    const part = state.part;
    const local = [part.x * body.size[0], part.y * body.size[2], part.z * body.size[1]];
    local[body.feedAxis] = 0;
    return [
      model[0] * local[0] + model[4] * local[1] + model[8] * local[2] + model[12],
      model[1] * local[0] + model[5] * local[1] + model[9] * local[2] + model[13],
      model[2] * local[0] + model[6] * local[1] + model[10] * local[2] + model[14]
    ];
  }

  // One part, drawn inside a frame that already sits where that part is.
  // `cut` replaces its position and reach along one axis, which is how a part
  // half way through the teeth is drawn as the piece of it that is left.
  drawPart(parent, part, size, item, options = {}) {
    const squash = options.squash;
    const extent = [
      part.w * size[0] * (squash ? squash[0] : 1),
      part.h * size[2] * (squash ? squash[1] : 1),
      part.d * size[1] * (squash ? squash[2] : 1)
    ];
    const position = [(options.x ?? part.x) * size[0], part.y * size[2], part.z * size[1]];
    if (options.cut) {
      position[options.cut[0]] = 0;
      extent[options.cut[0]] = options.cut[1];
    }
    let scale = extent;
    let rotation = [0, 0, 0];
    if (part.mesh === 'cylinder' && part.axis === 'y') {
      scale = [extent[1], extent[0], extent[2]];
      rotation = [0, 0, Math.PI / 2];
    } else if (part.mesh === 'cylinder' && part.axis === 'z') {
      scale = [extent[2], extent[1], extent[0]];
      rotation = [0, Math.PI / 2, 0];
    }
    if (options.fold) rotation = [rotation[0] + options.fold[0], rotation[1], rotation[2] + options.fold[1]];
    if (options.roll) rotation = [rotation[0], rotation[1], rotation[2] + options.roll];
    this.drawModel(part.mesh, mat4.multiply(parent, mat4.compose(position, rotation, scale)),
      options.color || partColor(part, item), part.gloss, part.glow || 0);
  }

  // A captured object is drawn part by part. Everything the cut line has not
  // reached is still whole; the part sitting in the teeth right now is combed
  // into strips on the disc pitch, and anything already past the line is gone.
  drawShredding(body, time) {
    const size = body.size;
    const item = body.item;
    const cut = body.feed;
    const brittle = body.material.rigidity > RIGID;
    const shiver = body.judder * Math.sin(time * 47) * .035;
    const fringe = Math.min(.4, CUTTER.offset * (brittle ? .85 : 1.15) / body.feedLength);
    const scratch = this.stripPart ||= { mesh: 'cube', kind: 'shell', x: 0, y: 0, z: 0, w: .1, d: .1, h: .1, gloss: .3 };
    const axis = body.feedAxis;
    const local = [size[0], size[2], size[1]];
    const reachOf = local[axis];
    // The axis that is neither running into the teeth nor across them: that is
    // how thick the strips coming off the cut edge are.
    const third = 3 - axis - body.acrossAxis;
    const thirdSign = body.feedMode === 'plunge' ? 0 : (orientation(body.rotation)[third * 4 + 1] >= 0 ? 1 : -1);

    for (const state of body.parts) {
      if (state.gone) continue;
      const part = state.part;
      const from = Math.max(state.front, cut);
      if (from >= state.back - .002) continue;

      // Cardboard folds in on itself as the teeth pull it down, foam squashes
      // flat before it tears.
      const near = clamp01(1 - (state.front - cut) / .34);
      const options = {};
      if (part.fold) options.fold = [part.fold[0] * near * 1.15, part.fold[1] * near * 1.15];
      if (part.squish) options.squash = [1 + near * .34, 1 + near * .22, 1 - near * part.squish];

      const comb = (part.kind === 'shell' || part.kind === 'trim') && cut > state.front;
      const solidFrom = comb ? Math.min(state.back, from + fringe) : from;
      if (state.back - solidFrom > .003) {
        const middle = (solidFrom + state.back) / 2;
        const parent = this.bodyFrame(body, (middle - cut) * body.feedLength, shiver);
        this.drawPart(parent, part, size, item, { ...options, cut: [axis, (state.back - solidFrom) * reachOf] });
      }
      if (!comb) continue;

      // The cut edge itself: one piece per disc gap, each a little further into
      // the teeth than its neighbours. These follow the discs, not the object.
      const zone = Math.min(state.back, from + fringe);
      const across = [part.w, part.h, part.d][body.acrossAxis] * local[body.acrossAxis];
      scratch.h = [part.w, part.h, part.d][third] * local[third] / size[2];
      scratch.y = [part.x, part.y, part.z][third] * local[third] * thirdSign / size[2];
      scratch.gloss = part.gloss;
      const color = partColor(part, item);
      for (const strip of body.strips) {
        const offset = strip.x - body.position[0];
        if (Math.abs(offset) - strip.half > across) continue;
        const chew = strip.lead * (zone - from) * (brittle ? .95 : .6);
        const top = zone - chew;
        if (top - from < .004) continue;
        const middle = (from + top) / 2;
        const parent = this.combFrame(body, (middle - cut) * body.feedLength,
          shiver + Math.sin(time * 24 + strip.wobble) * .012);
        scratch.x = offset / size[0];
        scratch.w = Math.max(.02, strip.half - .012) / size[0];
        this.drawPart(parent, scratch, size, item, {
          cut: [2, (top - from) * reachOf], roll: strip.roll,
          color: strip.color === item.color ? color : strip.color
        });
      }
    }
  }

  // Objects are the same set of parts in the air as in the teeth, so what you
  // throw is exactly what comes apart.
  drawItem(item, position, rotation, scale = 1) {
    const size = shapeSize(item);
    const parent = mat4.compose(position, rotation, [scale, scale, scale]);
    for (const part of itemParts(item)) this.drawPart(parent, part, size, item);
  }

  drawParticles(projection, view) {
    if (!this.particles.length) return;
    const gl = this.gl;
    const data = new Float32Array(this.particles.length * 6);
    this.particles.forEach((particle, index) => {
      data.set(particle.position, index * 6);
      data.set(particle.color, index * 6 + 3);
    });
    this.particleBuffer ||= gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.useProgram(this.particleProgram);
    const position = gl.getAttribLocation(this.particleProgram, 'aPosition');
    const color = gl.getAttribLocation(this.particleProgram, 'aColor');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(color);
    gl.vertexAttribPointer(color, 3, gl.FLOAT, false, 24, 12);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.particleProgram, 'uProjection'), false, projection);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.particleProgram, 'uView'), false, view);
    gl.uniform1f(gl.getUniformLocation(this.particleProgram, 'uSize'), 2.8);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, this.particles.length);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
