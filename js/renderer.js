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
    vec3 color = uColor * (0.16 + diffuse * 0.6 + bounce * 0.26 + floorShade * 0.07);
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
  disc: { rigidity: .96, grab: .48, debris: 'glass', round: true },
  clock: { rigidity: .86, grab: .5, debris: 'chunk', round: true }
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

function rotateVector(rotation, vector) {
  const m = mat4.compose([0, 0, 0], rotation, [1, 1, 1]);
  return [
    m[0] * vector[0] + m[4] * vector[1] + m[8] * vector[2],
    m[1] * vector[0] + m[5] * vector[1] + m[9] * vector[2],
    m[2] * vector[0] + m[6] * vector[1] + m[10] * vector[2]
  ];
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

// Cut an object into strips that line up with the real disc spacing. Only the
// edge in the teeth is ever drawn from these; the rest of the object stays in
// one piece until the cut reaches it.
function buildStrips(item, centerX, size, mat) {
  const pitch = CUTTER.discPitch;
  const left = centerX - size[0];
  const right = centerX + size[0];
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
    const halfX = BAY.halfWidth + BAY.wallThickness;
    const halfZ = BAY.halfDepth + BAY.wallThickness;
    const reach = Math.max(halfZ / tan, halfX / (tan * Math.max(.4, aspect))) * CAMERA.margin
      + (BAY.wallTop - BAY.floorY);
    return {
      fov: CAMERA.fov,
      eye: [0, BAY.floorY + reach, reach * CAMERA.tilt],
      target: [0, BAY.floorY, 0],
      up: [0, 0, -1]
    };
  }

  setPreview(item, position) {
    this.preview = { item, position, rotation: [-Math.PI / 2, 0, 0.14] };
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
    this.items.push({
      item,
      size,
      position: clampToBay([...position]),
      velocity: [...velocity],
      rotation: [random(-1, 1), random(-1, 1), random(-1, 1)],
      spin: [random(-5, 5), random(-7, 7), random(-6, 6)],
      radius: Math.max(size[0], size[1]) * .6,
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
        // Swallowed by the nip.
        if (fragment.position[1] < CUTTER.axisY) fragment.life = 0;
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
    const ground = surfaceY(body.position[0], body.position[2]);
    const grounded = body.position[1] <= ground + body.radius * .8;
    const slide = slideDirection(body.position[0], body.position[2]);

    body.velocity[1] -= BAY.gravity * dt;

    if (slide) {
      // Sloped feed panels: whatever lands on them slides down into the mouth.
      const grip = grounded ? 1 : .3;
      body.velocity[0] += slide[0] * BAY.slide * grip * dt;
      body.velocity[2] += slide[1] * BAY.slide * grip * dt;
      if (grounded) {
        const friction = Math.max(0, 1 - 3.2 * dt);
        body.velocity[0] *= friction;
        body.velocity[2] *= friction;
      }
    } else if (grounded) {
      // On the drums the teeth walk the object toward the nip at the machine's
      // own pace, however fast it arrived.
      const target = -Math.sign(body.position[2] || 1) * FEED_SPEED * 1.6;
      const grab = Math.min(1, dt * 4);
      body.velocity[2] += (target - body.velocity[2]) * grab;
      body.velocity[0] -= body.velocity[0] * grab;
      body.spin = body.spin.map((value) => value * Math.max(0, 1 - 3 * dt));
    }

    const damping = Math.max(0, 1 - body.item.drag * dt);
    body.velocity = body.velocity.map((value) => value * damping);
    body.position = body.position.map((value, index) => value + body.velocity[index] * dt);
    body.rotation = body.rotation.map((value, index) => value + body.spin[index] * dt);

    this.collideWall(body);
    this.collideFloor(body, dt);

    const overMouth = Math.abs(body.position[0]) < MOUTH.halfWidth + .5;
    const atNip = Math.abs(body.position[2]) < CUTTER.offset;
    if (overMouth && atNip && body.position[1] < DRUM_TOP + body.radius * .9) {
      this.capture(body);
    } else if (body.age > 26) {
      body.dead = true;
      this.dispatchEvent(new CustomEvent('miss', { detail: body.item }));
    }
  }

  collideWall(body) {
    const limitX = BAY.halfWidth - body.radius * .5;
    const limitZ = BAY.halfDepth - body.radius * .5;
    const restitution = .22 + body.item.bounce * .5;
    let impact = 0;
    for (const axis of [0, 2]) {
      const limit = axis === 0 ? limitX : limitZ;
      if (Math.abs(body.position[axis]) <= limit) continue;
      const sign = Math.sign(body.position[axis]);
      body.position[axis] = sign * limit;
      if (body.velocity[axis] * sign <= 0) continue;
      impact = Math.max(impact, Math.abs(body.velocity[axis]));
      body.velocity[axis] *= -restitution;
    }
    if (!impact) return;
    body.velocity[1] *= .84;
    body.spin = body.spin.map((value) => value * .8 + random(-2, 2));
    body.bounces += 1;
    this.spark([...body.position], body.item.accent, 5);
    this.shake = this.reducedMotion ? 0 : Math.max(this.shake, Math.min(.3, impact * .03));
    this.dispatchEvent(new CustomEvent('bounce', {
      detail: { item: body.item, intensity: Math.min(1, impact / 12) }
    }));
  }

  collideFloor(body, dt) {
    const rest = surfaceY(body.position[0], body.position[2]) + body.radius * .4;
    if (body.position[1] > rest) return;
    const impact = -body.velocity[1];
    body.position[1] = rest;
    if (impact > 0) {
      body.velocity[1] = impact > 1.6 ? impact * body.item.bounce * .7 : 0;
      if (impact > 3) this.spark([body.position[0], rest, body.position[2]], body.item.accent, 4);
    }
    body.spin = body.spin.map((value) => value * Math.max(0, 1 - 2.4 * dt));
  }

  capture(body) {
    const size = body.size;
    const mat = material(body.item);
    const reach = Math.max(.2, MOUTH.halfWidth - size[0]);
    body.state = 'captured';
    body.position[0] = Math.max(-reach, Math.min(reach, body.position[0]));
    body.velocity = [0, 0, 0];
    body.material = mat;
    // It is eaten from the edge nearest the nip, so it keeps coming from the
    // side it arrived on.
    body.feedSide = Math.sign(body.position[2]) || 1;
    body.grab = 0;
    body.grabDuration = this.reducedMotion ? mat.grab * .5 : mat.grab;
    body.judder = 0;
    body.feed = 0;
    body.feedTime = 0;
    body.feedLength = size[1] * 2;
    // Stiff material fights the teeth, so it goes through slower. Still one
    // fixed pace per object: how hard it was thrown changes nothing.
    body.feedDuration = Math.max(1.6, body.feedLength / (FEED_SPEED * (1 - mat.rigidity * .42)));
    body.crunches = Math.max(2, Math.round(body.feedLength / (CUTTER.discPitch * (.8 + mat.rigidity * .8))));
    body.step = -1;
    body.strips = buildStrips(body.item, body.position[0], size, mat);
    body.nextBite = 0;
    this.machineLoad = 1;
    this.shake = this.reducedMotion ? 0 : .22;
    this.dispatchEvent(new CustomEvent('impact', {
      detail: { item: body.item, intensity: .5 + body.item.mass * .3 }
    }));
  }

  // The object is dragged in edge first at the machine's constant rate. It is
  // grabbed and bent first, then eaten: smoothly if it is soft, in hard steps
  // if it is not. Nothing here depends on how it was thrown.
  updateCaptured(body, dt) {
    const mat = body.material;
    const settle = Math.min(1, dt * 5);
    body.position[2] -= body.position[2] * settle;
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

  // A piece snapping off: louder, sharper and with a shower of material.
  crunch(body, strength) {
    const count = this.reducedMotion ? 2 : Math.round(3 + strength * 4);
    const mat = body.material;
    const span = Math.max(.2, body.size[0] * .8);
    for (let i = 0; i < count; i += 1) {
      const piece = debrisPiece(mat, body.item, i);
      this.fragments.push({
        position: [body.position[0] + random(-span, span), nipHeight(0) + .12, random(-.16, .16)],
        velocity: [random(-2, 2), random(1.6, 3.6) * strength, random(-2.2, 2.2)],
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

  // One tooth pass: a few pieces torn off and flicked out of the nip.
  bite(body, progress) {
    const count = this.reducedMotion ? 2 : 3 + Math.round(body.item.mass);
    const hard = body.item.sound > .65;
    const span = Math.max(.2, body.size[0]);
    for (let i = 0; i < count; i += 1) {
      const strip = body.strips[Math.floor(Math.random() * body.strips.length)] || { x: body.position[0] };
      const piece = debrisPiece(body.material, body.item, i);
      this.fragments.push({
        position: [strip.x + random(-.06, .06), nipHeight(0) + .1, random(-.12, .12)],
        velocity: [random(-1.1, 1.1), random(1.2, 2.8), random(-1.6, 1.6)],
        rotation: [random(0, 6), random(0, 6), random(0, 6)],
        spin: [random(-6, 6), random(-6, 6), random(-6, 6)],
        scale: piece.scale,
        color: piece.color,
        metallic: piece.metallic,
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
    this.fragments.forEach((fragment) => this.draw('cube', fragment.position, fragment.rotation, fragment.scale, fragment.color, fragment.metallic ?? .1));
    this.debris.forEach((fragment) => this.draw('cube', fragment.position, fragment.rotation, fragment.scale, fragment.color, 0.05));
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
    const gl = this.gl;
    const mesh = this.meshes[meshName];
    const model = mat4.compose(position, rotation, scale);
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

  // A captured object keeps its shape above the drums. Only the edge caught in
  // the teeth is broken up: combed into strips if it is soft, snapped into
  // ragged chunks if it is not.
  drawShredding(body, time) {
    const size = body.size;
    const item = body.item;
    const mat = body.material;
    const side = body.feedSide;
    const anchor = body.position[2];
    const brittle = mat.rigidity > RIGID;
    const thickness = Math.max(.03, size[2] * .6);
    const length = body.feedLength * (1 - body.feed);
    if (length <= .015) return;

    const bend = clamp01(body.grab);
    const flex = 1 - mat.rigidity;
    const shiver = body.judder * Math.sin(time * 47) * .035;
    const gloss = item.shape === 'phone' ? .75 : .15;

    // Height of the object at distance d back from the nip. Soft material
    // drapes over the drum, stiff material stays straight and tips instead.
    const slope = (DRUM_TOP - nipHeight(0)) / Math.max(.4, Math.min(length, CUTTER.offset * 1.9));
    // While the teeth are working on the edge the far end rears up, then the
    // object gives way. Every chunk that snaps off bucks it again.
    const kick = Math.sin(bend * Math.PI) * (.09 + mat.rigidity * .2) + body.judder * .06;
    const profile = (d) => {
      const rest = Math.min(DRUM_TOP, nipHeight(d) * flex + Math.min(DRUM_TOP, nipHeight(0) + d * slope) * (1 - flex));
      const lift = kick * clamp01(d / Math.max(.5, length));
      // A tail long enough to still hang over a feed panel rests on top of it
      // instead of sinking through it.
      const panel = surfaceY(body.position[0], anchor + side * d) + .02;
      return Math.max(DRUM_TOP + (rest - DRUM_TOP) * bend + lift, panel);
    };
    // Round things narrow toward the edge as they are eaten across.
    const widthAt = (d) => {
      if (!mat.round) return size[0];
      const offset = (body.feedLength - length + d - size[1]) / size[1];
      return size[0] * Math.sqrt(Math.max(.06, 1 - offset * offset));
    };
    const place = (d0, d1, half, x, color, roll = 0) => {
      const y0 = profile(d0), y1 = profile(d1);
      const tilt = Math.atan2(y1 - y0, Math.max(.02, d1 - d0));
      this.draw('cube',
        [x + shiver, (y0 + y1) / 2 + thickness, anchor + side * (d0 + d1) / 2],
        [-Math.PI / 2 - side * tilt, 0, roll],
        [half, Math.max(.015, (d1 - d0) * .56), thickness],
        color, gloss);
      return tilt;
    };

    // Everything past the cut zone is still one solid object.
    const fringe = Math.min(length, CUTTER.offset * (brittle ? .85 : 1.15));
    const trunk = length - fringe;
    if (trunk > .04) {
      const segments = 6;
      for (let i = 0; i < segments; i += 1) {
        const d0 = fringe + trunk * i / segments;
        const d1 = fringe + trunk * (i + 1) / segments;
        const mid = (d0 + d1) / 2;
        const tilt = place(d0, d1, widthAt(mid), body.position[0], item.color);
        if (i === segments - 1) {
          this.draw('cube',
            [body.position[0] + shiver, profile(mid) + thickness * 2 + .014, anchor + side * mid],
            [-Math.PI / 2 - side * tilt, 0, 0],
            [widthAt(mid) * .6, Math.min(.09, trunk * .14), .012],
            item.accent, .1, .25);
        }
      }
    }

    // The cut edge itself, one piece per disc gap, each one a little further
    // into the teeth than its neighbours.
    body.strips.forEach((strip) => {
      const half = widthAt(fringe * .5);
      if (Math.abs(strip.x - body.position[0]) - strip.half > half) return;
      const chew = strip.lead * fringe * (brittle ? .95 : .62) * bend;
      if (fringe - chew < .03) return;
      place(chew, fringe, Math.max(.02, strip.half - .012),
        strip.x + Math.sin(time * 24 + strip.wobble) * .012 * bend,
        strip.color, strip.roll * bend);
    });
  }

  drawItem(item, position, rotation, scale) {
    const common = Array.isArray(scale) ? scale : [scale, scale, scale];
    if (item.shape === 'disc' || item.shape === 'clock') {
      this.draw('cylinder', position, rotation, [common[0] * .18, common[1] * .72, common[2] * .72], item.color, .65);
      if (item.shape === 'disc') this.draw('cylinder', position, rotation, [common[0] * .19, common[1] * .14, common[2] * .14], [.03,.04,.05], .2);
      return;
    }
    const dimensions = shapeSize(item);
    this.draw('cube', position, rotation, dimensions.map((value, index) => value * common[index]), item.color, item.shape === 'phone' ? .75 : .15);
    const offset = rotateVector(rotation, [0, 0, dimensions[2] * common[2] + .012]);
    const accentPosition = position.map((value, index) => value + offset[index]);
    this.draw('cube', accentPosition, rotation, [dimensions[0] * .65 * common[0], dimensions[1] * .08 * common[1], .012], item.accent, .1, .25);
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
