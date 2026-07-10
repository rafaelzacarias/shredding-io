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
  const float FLOOR_SHADE_START = -4.5;
  const float FLOOR_SHADE_END = 3.0;
  varying vec3 vNormal;
  varying vec3 vWorld;
  uniform vec3 uColor;
  uniform float uMetallic;
  uniform float uGlow;
  uniform vec3 uCamera;
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 key = normalize(vec3(-0.45, 0.85, 0.55));
    vec3 rimDir = normalize(uCamera - vWorld);
    float diffuse = max(dot(normal, key), 0.0);
    float rim = pow(1.0 - max(dot(normal, rimDir), 0.0), 2.4);
    float floorShade = smoothstep(FLOOR_SHADE_START, FLOOR_SHADE_END, vWorld.y);
    vec3 color = uColor * (0.18 + diffuse * 0.72 + floorShade * 0.08);
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
  portraitAspectThreshold: 0.8,
  mobilePixelRatioCap: 1.5,
  desktopPixelRatioCap: 2
};

const POINTER_PLANE = {
  scale: 0.72,
  verticalOffset: 1.4,
  depth: 5.2
};

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
    b01 / determinant, (-a22 * a01 + a02 * a21) / determinant, (a12 * a01 - a02 * a11) / determinant,
    b11 / determinant, (a22 * a00 - a02 * a20) / determinant, (-a12 * a00 + a02 * a10) / determinant,
    b21 / determinant, (-a21 * a00 + a01 * a20) / determinant, (a11 * a00 - a01 * a10) / determinant
  ]);
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
    this.camera = [0, 5.1, 15.5];
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

  screenToWorld(clientX, clientY, depth = 4.2) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width * 2 - 1;
    const y = 1 - (clientY - rect.top) / rect.height * 2;
    const aspect = rect.width / rect.height;
    return [
      x * depth * aspect * POINTER_PLANE.scale,
      y * depth * POINTER_PLANE.scale + POINTER_PLANE.verticalOffset,
      POINTER_PLANE.depth
    ];
  }

  setPreview(item, position) {
    this.preview = { item, position, rotation: [0.18, 0, -0.08] };
  }

  clearPreview() {
    this.preview = null;
  }

  throwItem(item, position, velocity) {
    this.items.push({
      item,
      position: [...position],
      velocity: [...velocity],
      rotation: [random(-1, 1), random(-1, 1), random(-1, 1)],
      spin: [random(-5, 5), random(-7, 7), random(-6, 6)],
      age: 0,
      bounces: 0,
      state: 'flight'
    });
  }

  update(dt) {
    const speed = this.machineLoad > 0 ? 4.2 : 1.5;
    this.cutterAngle += dt * speed;
    this.machineLoad = Math.max(0, this.machineLoad - dt * 1.4);
    this.shake = Math.max(0, this.shake - dt * 2.5);

    this.items.forEach((body) => {
      body.age += dt;
      if (body.state === 'captured') {
        body.captureAge += dt;
        const duration = 1.05 + body.item.mass * .28;
        const progress = Math.min(1, body.captureAge / duration);
        body.position[1] = .52 - progress * .74;
        body.position[2] = 1.18 + Math.sin(body.captureAge * 18) * .035 * (1 - progress);
        body.rotation[0] += dt * (5.5 + body.item.mass);
        body.rotation[2] += Math.sin(body.captureAge * 24) * dt * 1.8;
        body.scale = [1 - progress * .12, Math.max(.06, 1 - progress * .94), 1 - progress * .3];
        this.machineLoad = 1;
        this.shake = this.reducedMotion ? 0 : Math.max(this.shake, .16 + body.item.mass * .06);
        if (progress >= body.nextBite) {
          this.bite(body, progress);
          body.nextBite += this.reducedMotion ? .26 : .13;
        }
        if (progress >= 1) {
          body.dead = true;
          this.destroy(body);
        }
        return;
      }

      body.velocity[1] -= 8.8 * dt;
      const damping = Math.max(0, 1 - body.item.drag * dt);
      body.velocity = body.velocity.map((value) => value * damping);
      body.position = body.position.map((value, index) => value + body.velocity[index] * dt);
      body.rotation = body.rotation.map((value, index) => value + body.spin[index] * dt);

      const atMachine = body.position[1] < 0.55 && body.position[1] > -1.15 && body.position[2] < 3.2;
      if (atMachine && Math.abs(body.position[0]) < 3.15) {
        body.state = 'captured';
        body.position[1] = 0.3;
        body.position[2] = 1.2;
        body.velocity = [0, 0, 0];
        body.captureAge = 0;
        body.nextBite = .08;
        this.machineLoad = 1;
        this.shake = this.reducedMotion ? 0 : 1;
        this.dispatchEvent(new CustomEvent('impact', { detail: { item: body.item, intensity: Math.min(1.6, body.age + body.item.mass * 0.35) } }));
      } else if (body.position[1] < -0.55 && body.position[2] < 4 && body.bounces < 2) {
        body.position[1] = -0.55;
        body.velocity[1] = Math.abs(body.velocity[1]) * body.item.bounce;
        body.velocity[0] *= 0.72;
        body.bounces += 1;
        this.spark(body.position, body.item.accent, 8);
      }
      if (body.position[1] < -7 || body.age > 8 || Math.abs(body.position[0]) > 15) {
        body.dead = true;
        this.dispatchEvent(new CustomEvent('miss', { detail: body.item }));
      }
    });
    this.items = this.items.filter((body) => !body.dead);

    this.fragments.forEach((fragment) => {
      fragment.life -= dt;
      fragment.velocity[1] -= 7.5 * dt;
      fragment.position = fragment.position.map((value, index) => value + fragment.velocity[index] * dt);
      fragment.rotation = fragment.rotation.map((value, index) => value + fragment.spin[index] * dt);
      if (fragment.position[1] < -2.2) {
        fragment.position[1] = -2.2;
        fragment.velocity[1] *= -0.18;
        fragment.velocity[0] *= 0.75;
        fragment.velocity[2] *= 0.75;
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

  bite(body, progress) {
    const count = this.reducedMotion ? 2 : 3 + Math.round(body.item.mass);
    const hard = body.item.sound > .65;
    for (let i = 0; i < count; i += 1) {
      const color = i % 3 === 0 ? body.item.accent : body.item.color;
      this.fragments.push({
        position: [body.position[0] + random(-.42, .42), .08 - progress * .32, random(.72, 1.62)],
        velocity: [random(-1.8, 1.8), random(-3.8, -.8), random(-1.2, 1.2)],
        rotation: [random(0, 6), random(0, 6), random(0, 6)],
        spin: [random(-7, 7), random(-7, 7), random(-7, 7)],
        scale: body.item.shape === 'paper'
          ? [random(.08, .2), random(.018, .035), random(.16, .34)]
          : [random(.06, .16), random(.04, .11), random(.08, .24)],
        color,
        life: random(2.2, 4)
      });
    }
    const particleColor = hard ? [1, .42, .12] : body.item.accent;
    this.spark([body.position[0], .02, 1.18], particleColor, hard ? count * 2 : count);
    this.dispatchEvent(new CustomEvent('bite', {
      detail: { item: body.item, intensity: .55 + progress * .45 }
    }));
  }

  destroy(body) {
    const count = this.reducedMotion ? 3 : 5 + Math.round(body.item.mass * 2);
    for (let i = 0; i < count; i += 1) {
      const color = i % 3 === 0 ? body.item.accent : body.item.color;
      this.fragments.push({
        position: [body.position[0] + random(-.4, .4), -.34, random(.7, 1.6)],
        velocity: [random(-1.6, 1.6), random(-4.5, -1.2), random(-1.2, 1.2)],
        rotation: [random(0, 6), random(0, 6), random(0, 6)],
        spin: [random(-8, 8), random(-8, 8), random(-8, 8)],
        scale: [random(0.05, 0.18), random(0.04, 0.13), random(0.12, 0.38)],
        color,
        life: random(2.4, 4.2)
      });
    }
    for (let i = 0; i < Math.max(2, Math.round(body.item.mass * 2)); i += 1) {
      this.debris.push({
        position: [body.position[0] + random(-1.4, 1.4), -2.15, random(.1, 2.4)],
        rotation: [random(0, 1), random(0, 6), random(0, 1)],
        scale: [random(.05, .18), random(.03, .09), random(.1, .35)],
        color: i % 3 === 0 ? body.item.accent : body.item.color
      });
    }
    if (this.debris.length > 52) this.debris.shift();
    this.dispatchEvent(new CustomEvent('shred', { detail: body.item }));
  }

  spark(position, color, count) {
    for (let i = 0; i < count; i += 1) {
      this.particles.push({
        position: [...position],
        velocity: [random(-5, 5), random(0.8, 6.5), random(-2, 2)],
        color,
        life: random(.3, 1.1)
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

    const aspect = this.canvas.width / this.canvas.height;
    const mobile = aspect < DISPLAY_CONFIG.portraitAspectThreshold;
    const shakeX = this.shake ? Math.sin(time * 83) * .035 * this.shake : 0;
    const camera = mobile ? [0 + shakeX, 5.7, 18.5] : [0 + shakeX, 5.1, 15.5];
    const projection = mat4.perspective(mobile ? .72 : .68, aspect, .1, 80);
    const view = mat4.lookAt(camera, [0, .25, 0], [0, 1, 0]);
    this.camera = camera;
    this.beginShapes(projection, view);
    this.drawEnvironment();
    this.drawMachine();
    this.items.forEach((body) => this.drawItem(body.item, body.position, body.rotation, body.scale ?? 1));
    if (this.preview) this.drawItem(this.preview.item, this.preview.position, this.preview.rotation, 1);
    this.fragments.forEach((fragment) => this.draw('cube', fragment.position, fragment.rotation, fragment.scale, fragment.color, 0.1));
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
  }

  draw(meshName, position, rotation, scale, color, metallic = .5, glow = 0) {
    const gl = this.gl;
    const mesh = this.meshes[meshName];
    const model = mat4.compose(position, rotation, scale);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position);
    gl.enableVertexAttribArray(this.shapeLocations.position);
    gl.vertexAttribPointer(this.shapeLocations.position, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normal);
    gl.enableVertexAttribArray(this.shapeLocations.normal);
    gl.vertexAttribPointer(this.shapeLocations.normal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
    gl.uniformMatrix4fv(this.shapeLocations.model, false, model);
    gl.uniformMatrix3fv(this.shapeLocations.normalMatrix, false, normalMatrix(model));
    gl.uniform3fv(this.shapeLocations.color, color);
    gl.uniform1f(this.shapeLocations.metallic, metallic);
    gl.uniform1f(this.shapeLocations.glow, glow);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  drawEnvironment() {
    this.draw('cube', [0, -2.65, 0], [0, 0, 0], [12, .12, 12], [.045, .065, .075], .65);
    this.draw('cube', [0, 3.6, -5.2], [0, 0, 0], [11, 6, .1], [.035, .065, .078], .55);
    for (let x = -9; x <= 9; x += 3) {
      this.draw('cube', [x, 3.5, -5], [0, 0, 0], [.035, 6, .05], [.09, .18, .21], .8, .08);
    }
    this.draw('cube', [0, 8.4, -1], [0, 0, 0], [3.5, .05, .4], [.25, .78, .86], .2, 1.6);
  }

  drawMachine() {
    const blue = [.025, .18, .29], blueEdge = [.06, .32, .46], dark = [.025, .035, .04], steel = [.31, .35, .36];
    this.draw('cube', [-4.15, .7, .4], [0, 0, -.17], [1.15, 3.25, 3.5], blue, .8);
    this.draw('cube', [4.15, .7, .4], [0, 0, .17], [1.15, 3.25, 3.5], blue, .8);
    this.draw('cube', [0, 2.85, .15], [0, 0, 0], [3.4, .32, 3.4], blueEdge, .75);
    this.draw('cube', [0, -1.5, .5], [0, 0, 0], [4.7, .72, 3.45], blue, .85);
    this.draw('cube', [0, -.05, -1.85], [0, 0, 0], [3.5, 1.4, .45], dark, .5);
    this.draw('cube', [-4.55, -.1, 1.05], [0, 0, 0], [.45, 1.55, 1.55], blueEdge, .8);
    this.draw('cube', [4.55, -.1, 1.05], [0, 0, 0], [.45, 1.55, 1.55], blueEdge, .8);

    [-.78, .78].forEach((z, shaftIndex) => {
      this.draw('cylinder', [0, 0, z + 1.15], [0, 0, 0], [3.85, .48, .48], dark, .9);
      for (let i = -7; i <= 7; i += 1) {
        const angle = (i % 2 ? 0.25 : 0) + (shaftIndex ? -this.cutterAngle : this.cutterAngle);
        this.draw('cylinder', [i * .48, 0, z + 1.15], [0, angle, 0], [.21, .96, .96], steel, 1);
        for (let tooth = 0; tooth < 4; tooth += 1) {
          const a = angle + tooth * Math.PI / 2;
          this.draw('cube',
            [i * .48, Math.cos(a) * .82, z + 1.15 + Math.sin(a) * .82],
            [a, 0, 0],
            [.2, .24, .42],
            [.42, .46, .47], 1
          );
        }
      }
    });

    for (const x of [-4.55, 4.55]) {
      for (const z of [.36, 1.94]) {
        this.draw('cylinder', [x, 0, z], [0, 0, 0], [.58, .36, .36], steel, 1);
      }
    }
  }

  drawItem(item, position, rotation, scale) {
    const common = Array.isArray(scale) ? scale : [scale, scale, scale];
    if (item.shape === 'disc' || item.shape === 'clock') {
      this.draw('cylinder', position, rotation, [common[0] * .18, common[1] * .72, common[2] * .72], item.color, .65);
      if (item.shape === 'disc') this.draw('cylinder', position, rotation, [common[0] * .19, common[1] * .14, common[2] * .14], [.03,.04,.05], .2);
      return;
    }
    const dimensions = {
      paper: [1.05, .7, .045],
      card: [.92, .58, .07],
      board: [.8, 1.05, .12],
      phone: [.55, .95, .12],
      keyboard: [1.35, .48, .14],
      box: [.8, .65, .48],
      cube: [.65, .65, .65]
    }[item.shape] || [.8, .6, .25];
    this.draw('cube', position, rotation, dimensions.map((value, index) => value * common[index]), item.color, item.shape === 'phone' ? .75 : .15);
    const accentPosition = [position[0], position[1], position[2] + dimensions[2] * common[2] + .012];
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
