import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
  LAST_CONFIRMED,
  LOCATIONS,
  LOCATION_LIST,
  NETWORK_STATION,
  PALETTE,
  ROUTE_CONTROLS,
} from './data.js';

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (value) => new THREE.Vector3(...value);
const clamp01 = (value) => Math.max(0, Math.min(1, value));

function seededRandom(seed = 91823) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeSoftDiscTexture(inner = '#ffffff', outer = 'rgba(255,255,255,0)') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.28, inner);
  gradient.addColorStop(1, outer);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeGasTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const bands = ['#9c602d', '#d99b45', '#efc879', '#be7733', '#f1d18c', '#c7873d'];
  bands.forEach((color, index) => {
    const y = index * (canvas.height / bands.length);
    context.fillStyle = color;
    context.fillRect(0, y, canvas.width, canvas.height / bands.length + 2);
  });
  const random = seededRandom(47);
  for (let i = 0; i < 90; i += 1) {
    context.globalAlpha = 0.08 + random() * 0.12;
    context.fillStyle = random() > 0.5 ? '#fff2c2' : '#5e321f';
    context.beginPath();
    context.ellipse(random() * 512, random() * 256, 18 + random() * 70, 1 + random() * 5, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeLabel(name, className = 'map-label') {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = name;
  const label = new CSS2DObject(element);
  label.center.set(0.5, 0.5);
  return label;
}

function lineFromPoints(points, material) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, material);
  if (material.isLineDashedMaterial) line.computeLineDistances();
  return line;
}

export class StarMapScene {
  constructor(container, { theme = 'chart', mode = 'player', truth = 'rime', onSelect }) {
    this.container = container;
    this.theme = theme;
    this.mode = mode;
    this.truth = truth;
    this.onSelect = onSelect;
    this.time = 0;
    this.clock = new THREE.Clock();
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.pickables = [];
    this.planetMeshes = [];
    this.outlines = [];
    this.glows = [];
    this.labels = [];
    this.cameraTween = null;
    this.currentView = 'overview';
    this.pointerDown = null;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(PALETTE[theme].background, theme === 'space' ? 0.006 : 0.002);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 250);
    this.camera.position.copy(mode === 'reveal' ? new THREE.Vector3(0, 49, 49) : new THREE.Vector3(0, 43, 39));

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = theme === 'space' ? 1.1 : 0.95;
    this.renderer.domElement.className = 'webgl-canvas';
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    container.appendChild(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.labelRenderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.minDistance = 13;
    this.controls.maxDistance = 190;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.target.copy(this.getViewTarget());
    this.camera.position.copy(this.getOverviewPosition());

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.buildLights();
    this.buildBackdrop();
    this.buildLocations();
    this.buildRoute();
    this.buildLastConfirmed();
    this.buildRevealLayer();
    this.bindEvents();
    this.resize();
    this.setTheme(theme);
    this.setMode(mode);
    this.setTruth(truth);
    this.setTime(0);
    this.animate();
  }

  buildLights() {
    this.ambient = new THREE.HemisphereLight(0xfff4ce, 0x25304d, 2.4);
    this.key = new THREE.DirectionalLight(0xfff0c8, 4.2);
    this.key.position.set(-16, 28, 14);
    this.rim = new THREE.DirectionalLight(0x719dff, 2.2);
    this.rim.position.set(24, 12, -26);
    this.scene.add(this.ambient, this.key, this.rim);
  }

  buildBackdrop() {
    this.gridGroup = new THREE.Group();
    this.gridGroup.position.y = -2.2;
    for (let radius = 8; radius <= 48; radius += 8) {
      const points = [];
      for (let i = 0; i <= 128; i += 1) {
        const angle = (i / 128) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
      }
      const line = lineFromPoints(points, new THREE.LineBasicMaterial({ transparent: true, opacity: radius % 16 === 0 ? 0.2 : 0.11 }));
      this.gridGroup.add(line);
    }
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      this.gridGroup.add(lineFromPoints([
        new THREE.Vector3(Math.cos(angle) * 4, 0, Math.sin(angle) * 4),
        new THREE.Vector3(Math.cos(angle) * 52, 0, Math.sin(angle) * 52),
      ], new THREE.LineBasicMaterial({ transparent: true, opacity: 0.1 })));
    }
    this.scene.add(this.gridGroup);

    const random = seededRandom(1204);
    const starPositions = [];
    for (let i = 0; i < 1500; i += 1) {
      const radius = 40 + random() * 90;
      const theta = random() * Math.PI * 2;
      const y = -5 + random() * 70;
      starPositions.push(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.18, transparent: true, depthWrite: false }));
    this.scene.add(this.stars);
  }

  createPlanet(location, options = {}) {
    const segments = window.innerWidth < 700 ? 36 : 56;
    const geometry = new THREE.SphereGeometry(location.radius, segments, segments);
    const material = new THREE.MeshStandardMaterial({
      color: location.color,
      roughness: options.roughness ?? 0.72,
      metalness: 0.03,
      map: options.map || null,
    });
    const planet = new THREE.Mesh(geometry, material);
    planet.position.copy(v3(location.position));
    planet.castShadow = false;
    planet.userData.locationId = location.id;
    planet.userData.rotationRate = 0.035 + Math.random() * 0.025;
    this.scene.add(planet);
    this.planetMeshes.push(planet);
    this.pickables.push(planet);

    const outline = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.BackSide, transparent: true }));
    outline.scale.setScalar(1.035);
    planet.add(outline);
    this.outlines.push(outline);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(location.radius * 1.18, 32, 32),
      new THREE.MeshBasicMaterial({ color: location.color, transparent: true, opacity: 0.08, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    glow.position.copy(planet.position);
    this.scene.add(glow);
    this.glows.push(glow);

    const label = makeLabel(location.name);
    label.position.set(location.position[0], location.radius + 1.25, location.position[2]);
    label.userData.locationId = location.id;
    this.scene.add(label);
    this.labels.push(label);
    label.element.addEventListener('click', (event) => {
      event.stopPropagation();
      this.focusLocation(location.id);
    });
    return planet;
  }

  buildLocations() {
    const azure = this.createPlanet(LOCATIONS.azure);
    const random = seededRandom(31);
    const azureColors = new Float32Array(azure.geometry.attributes.position.count * 3);
    for (let i = 0; i < azure.geometry.attributes.position.count; i += 1) {
      const shade = 0.68 + random() * 0.32;
      azureColors[i * 3] = 0.28 * shade;
      azureColors[i * 3 + 1] = 0.52 * shade;
      azureColors[i * 3 + 2] = 0.75 * shade;
    }
    azure.geometry.setAttribute('color', new THREE.BufferAttribute(azureColors, 3));
    azure.material.vertexColors = true;

    const amber = this.createPlanet(LOCATIONS.amber, { map: makeGasTexture(), roughness: 0.78 });
    amber.rotation.z = -0.12;
    const radiation = new THREE.Mesh(
      new THREE.TorusGeometry(4.45, 0.07, 10, 100),
      new THREE.MeshBasicMaterial({ color: 0xe6b85d, transparent: true, opacity: 0.28 }),
    );
    radiation.rotation.x = Math.PI / 2;
    radiation.rotation.z = 0.15;
    radiation.position.copy(v3(LOCATIONS.amber.position));
    this.scene.add(radiation);

    this.createPlanet(LOCATIONS.crimson);
    const iceRing = new THREE.Mesh(
      new THREE.RingGeometry(2.15, 3.05, 90),
      new THREE.MeshBasicMaterial({ color: 0xdfeef4, transparent: true, opacity: 0.58, side: THREE.DoubleSide, depthWrite: false }),
    );
    iceRing.rotation.x = Math.PI / 2.45;
    iceRing.rotation.z = 0.36;
    iceRing.position.copy(v3(LOCATIONS.crimson.position));
    this.scene.add(iceRing);

    this.buildShoal();

    const verdant = this.createPlanet(LOCATIONS.verdant);
    verdant.rotation.z = 0.18;
    this.buildVerdantStation();
    this.buildRime();
  }

  buildShoal() {
    const random = seededRandom(811);
    const rockGeometry = new THREE.IcosahedronGeometry(0.28, 0);
    rockGeometry.scale(1, 0.72, 0.86);
    const rockMaterial = new THREE.MeshStandardMaterial({ color: LOCATIONS.shoal.color, roughness: 1, metalness: 0 });
    this.shoal = new THREE.InstancedMesh(rockGeometry, rockMaterial, 620);
    this.shoal.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shoalData = [];
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    for (let i = 0; i < 620; i += 1) {
      const t = random();
      const oneMinus = 1 - t;
      position.set(
        oneMinus * oneMinus * -7 + 2 * oneMinus * t * 3.5 + t * t * 10,
        -0.7 + random() * 2.2,
        oneMinus * oneMinus * 12 + 2 * oneMinus * t * 8.8 + t * t * 12.5,
      );
      position.x += (random() - 0.5) * 2.4;
      position.z += (random() - 0.5) * 1.7;
      const baseScale = 0.28 + Math.pow(random(), 2) * 1.55;
      scale.set(baseScale * (0.65 + random()), baseScale * (0.55 + random()), baseScale * (0.65 + random()));
      const rotation = new THREE.Euler(random() * Math.PI, random() * Math.PI, random() * Math.PI);
      quaternion.setFromEuler(rotation);
      matrix.compose(position, quaternion, scale);
      this.shoal.setMatrixAt(i, matrix);
      this.shoalData.push({ position: position.clone(), scale: scale.clone(), rotation, speed: 0.05 + random() * 0.15 });
    }
    this.shoal.userData.locationId = 'shoal';
    this.scene.add(this.shoal);
    this.pickables.push(this.shoal);

    const proxy = new THREE.Mesh(
      new THREE.SphereGeometry(5.5, 12, 12),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    proxy.position.copy(v3(LOCATIONS.shoal.position));
    proxy.userData.locationId = 'shoal';
    this.scene.add(proxy);
    this.pickables.push(proxy);

    const label = makeLabel(LOCATIONS.shoal.name);
    label.position.set(2, 3.25, 11.2);
    this.scene.add(label);
    this.labels.push(label);
    label.element.addEventListener('click', (event) => { event.stopPropagation(); this.focusLocation('shoal'); });
  }

  buildVerdantStation() {
    const center = v3(LOCATIONS.verdant.position);
    const orbitPoints = [];
    for (let i = 0; i <= 80; i += 1) {
      const a = i / 80 * Math.PI * 2;
      orbitPoints.push(new THREE.Vector3(center.x + Math.cos(a) * 2.35, center.y, center.z + Math.sin(a) * 2.35));
    }
    this.verdantOrbit = lineFromPoints(orbitPoints, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.28 }));
    this.scene.add(this.verdantOrbit);

    this.verdantStation = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.34), new THREE.MeshStandardMaterial({ color: 0xd9d8c9, metalness: 0.35, roughness: 0.55 }));
    const panels = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.52), new THREE.MeshStandardMaterial({ color: 0x315d7a, metalness: 0.15, roughness: 0.55 }));
    this.verdantStation.add(body, panels);
    this.verdantStation.position.set(center.x + 2.35, 0.3, center.z);
    this.scene.add(this.verdantStation);
  }

  buildRime() {
    const random = seededRandom(551);
    const positions = [];
    const colors = [];
    const center = v3(LOCATIONS.rime.position);
    for (let i = 0; i < 380; i += 1) {
      const radius = Math.pow(random(), 0.6) * 4.8;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      positions.push(
        center.x + radius * Math.sin(phi) * Math.cos(theta) * 1.35,
        center.y + radius * Math.cos(phi) * 0.52,
        center.z + radius * Math.sin(phi) * Math.sin(theta),
      );
      const brightness = 0.72 + random() * 0.28;
      colors.push(0.62 * brightness, 0.86 * brightness, brightness);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.rime = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 1.25,
      map: makeSoftDiscTexture(),
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
    }));
    this.scene.add(this.rime);

    const proxy = new THREE.Mesh(
      new THREE.SphereGeometry(5.2, 16, 16),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    proxy.position.copy(center);
    proxy.userData.locationId = 'rime';
    this.scene.add(proxy);
    this.pickables.push(proxy);

    const label = makeLabel(LOCATIONS.rime.name);
    label.position.set(center.x, 4.1, center.z);
    this.scene.add(label);
    this.labels.push(label);
    label.element.addEventListener('click', (event) => { event.stopPropagation(); this.focusLocation('rime'); });
  }

  buildRoute() {
    const start = v3(LOCATIONS.azure.position);
    const end = v3(LOCATIONS.amber.position);
    const curve = new THREE.CubicBezierCurve3(
      start,
      new THREE.Vector3(-5, 0.1, -0.1),
      new THREE.Vector3(4, 0.1, -3.5),
      end,
    );
    this.plannedRoute = lineFromPoints(curve.getPoints(100), new THREE.LineDashedMaterial({ dashSize: 0.7, gapSize: 0.46, transparent: true, opacity: 0.72 }));
    this.plannedRoute.position.y = -0.55;
    this.scene.add(this.plannedRoute);
  }

  buildLastConfirmed() {
    const center = v3(LAST_CONFIRMED);
    const material = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 });
    const group = new THREE.Group();
    const circle = [];
    for (let i = 0; i <= 48; i += 1) {
      const a = i / 48 * Math.PI * 2;
      circle.push(new THREE.Vector3(Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72));
    }
    group.add(
      lineFromPoints(circle, material),
      lineFromPoints([new THREE.Vector3(-1.1, 0, 0), new THREE.Vector3(-0.35, 0, 0)], material),
      lineFromPoints([new THREE.Vector3(0.35, 0, 0), new THREE.Vector3(1.1, 0, 0)], material),
      lineFromPoints([new THREE.Vector3(0, 0, -1.1), new THREE.Vector3(0, 0, -0.35)], material),
      lineFromPoints([new THREE.Vector3(0, 0, 0.35), new THREE.Vector3(0, 0, 1.1)], material),
    );
    group.position.copy(center);
    group.position.y = -0.42;
    this.lastMarker = group;
    this.scene.add(group);

    this.lastLabel = makeLabel('Last confirmed, T+0', 'map-label map-label--marker');
    this.lastLabel.position.set(center.x, 1.1, center.z);
    this.scene.add(this.lastLabel);
  }

  buildRevealLayer() {
    this.revealLayer = new THREE.Group();
    this.scene.add(this.revealLayer);

    this.ship = new THREE.Group();
    const hullMaterial = new THREE.MeshStandardMaterial({ color: 0xe8f0f2, metalness: 0.65, roughness: 0.32 });
    const accentMaterial = new THREE.MeshBasicMaterial({ color: 0x66c5ff });
    const hull = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.55, 5), hullMaterial);
    hull.position.y = 0.15;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.07, 0.42), hullMaterial);
    wing.position.y = -0.25;
    const engine = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), accentMaterial);
    engine.position.y = -0.72;
    this.ship.add(hull, wing, engine);
    this.ship.scale.setScalar(0.88);
    this.revealLayer.add(this.ship);

    this.trajectory = lineFromPoints([v3(LAST_CONFIRMED), v3(LOCATIONS.rime.position)], new THREE.LineBasicMaterial({ transparent: true, opacity: 0.22 }));
    this.trajectory.position.y = -0.25;
    this.revealLayer.add(this.trajectory);

    this.networkStation = this.createNetworkStation();
    this.revealLayer.add(this.networkStation);
    const networkLabel = makeLabel('Deep Space Network', 'map-label map-label--minor');
    networkLabel.position.set(0, 2.2, 0);
    this.networkStation.add(networkLabel);

    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeSoftDiscTexture('#fff4d2'),
      color: 0xffd27a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.flash.position.set(18.8, 2.2, 8.2);
    this.flash.scale.setScalar(0.01);
    this.revealLayer.add(this.flash);

    this.dockPing = this.makeEventRing(0x72ffad);
    this.dockPing.position.copy(this.verdantStation.position);
    this.revealLayer.add(this.dockPing);

    this.truthRing = this.makeEventRing(0xffd66d);
    this.revealLayer.add(this.truthRing);

    const pulseTexture = makeSoftDiscTexture('#ffffff');
    this.signalPulses = [0, 1].map(() => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pulseTexture, color: 0x7fd8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.scale.setScalar(1.25);
      this.revealLayer.add(sprite);
      return sprite;
    });
    this.signalLine = lineFromPoints([v3(LOCATIONS.rime.position), v3(NETWORK_STATION)], new THREE.LineBasicMaterial({ color: 0x64c9ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }));
    this.signalLine.position.y = 0.6;
    this.revealLayer.add(this.signalLine);
  }

  createNetworkStation() {
    const group = new THREE.Group();
    group.position.copy(v3(NETWORK_STATION));
    const material = new THREE.MeshStandardMaterial({ color: 0xcfd9df, metalness: 0.5, roughness: 0.42, side: THREE.DoubleSide });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.48, 0.7, 16), material);
    base.position.y = 0.25;
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.34), material);
    dish.scale.y = 0.34;
    dish.rotation.z = -0.55;
    dish.position.set(0.28, 0.85, 0);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), material);
    mast.rotation.z = -0.55;
    mast.position.set(0.04, 0.75, 0);
    group.add(base, dish, mast);
    return group;
  }

  makeEventRing(color) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.03, 64),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.x = -Math.PI / 2;
    return ring;
  }

  getRouteCurve(id = this.truth) {
    return new THREE.CatmullRomCurve3(ROUTE_CONTROLS[id].map(v3), false, 'centripetal', 0.5);
  }

  getSignalCurve(id = this.truth) {
    const source = v3(LOCATIONS[id].position);
    const controls = id === 'rime'
      ? [source, new THREE.Vector3(20, 1, -10), new THREE.Vector3(3, 1, -2), new THREE.Vector3(-13, 1, 1), v3(NETWORK_STATION)]
      : [source, source.clone().lerp(v3(NETWORK_STATION), 0.48).add(new THREE.Vector3(0, 1.8, 3)), v3(NETWORK_STATION)];
    return new THREE.CatmullRomCurve3(controls, false, 'centripetal', 0.5);
  }

  setTruth(id) {
    if (!LOCATIONS[id]) id = 'rime';
    this.truth = id;
    this.routeCurve = this.getRouteCurve(id);
    this.signalCurve = this.getSignalCurve(id);

    this.trajectory.geometry.dispose();
    this.trajectory.geometry = new THREE.BufferGeometry().setFromPoints(this.routeCurve.getPoints(150));
    this.signalLine.geometry.dispose();
    this.signalLine.geometry = new THREE.BufferGeometry().setFromPoints(this.signalCurve.getPoints(130));
    this.truthRing.position.copy(v3(LOCATIONS[id].position));
    this.setTime(this.time);
  }

  setMode(mode) {
    this.mode = mode === 'reveal' ? 'reveal' : 'player';
    this.revealLayer.visible = this.mode === 'reveal';
    if (this.mode === 'player') this.setTime(0);
  }

  setTime(hours) {
    this.time = Math.max(0, Math.min(48, Number(hours) || 0));
    if (!this.routeCurve) return;
    const progress = this.time / 48;
    const shipPosition = this.routeCurve.getPointAt(progress);
    const tangent = this.routeCurve.getTangentAt(Math.min(progress, 0.999)).normalize();
    this.ship.position.copy(shipPosition).add(new THREE.Vector3(0, 0.65, 0));
    this.ship.quaternion.setFromUnitVectors(UP, tangent);

    const flashAge = this.time - 20;
    const flashVisible = flashAge >= 0 && flashAge <= 2.2;
    this.flash.visible = flashVisible;
    if (flashVisible) {
      const burst = Math.sin(clamp01(flashAge / 2.2) * Math.PI);
      this.flash.scale.setScalar(1.4 + burst * 4.8);
      this.flash.material.opacity = burst * 0.95;
    }

    const signalAge = this.time - 31;
    const signalVisible = signalAge >= 0 && signalAge <= 5;
    this.signalLine.visible = signalVisible;
    this.signalLine.material.opacity = signalVisible ? Math.sin(clamp01(signalAge / 5) * Math.PI) * 0.34 : 0;
    this.signalPulses.forEach((pulse, index) => {
      const pulseT = signalAge / 2.8 - index * 0.42;
      const visible = signalVisible && pulseT >= 0 && pulseT <= 1;
      pulse.visible = visible;
      pulse.material.opacity = visible ? Math.sin(pulseT * Math.PI) : 0;
      if (visible) pulse.position.copy(this.signalCurve.getPointAt(clamp01(pulseT))).add(new THREE.Vector3(0, 0.65, 0));
    });

    const dockAge = this.time - 40;
    const dockVisible = dockAge >= 0 && dockAge <= 4.5;
    this.dockPing.visible = dockVisible;
    if (dockVisible) {
      const phase = (dockAge * 0.9) % 1;
      this.dockPing.scale.setScalar(0.7 + phase * 3.5);
      this.dockPing.material.opacity = (1 - phase) * 0.75;
    }

    const truthVisible = this.time >= 47.7;
    this.truthRing.visible = truthVisible;
    if (truthVisible) {
      const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.12;
      const radius = LOCATIONS[this.truth].radius + 1.05;
      this.truthRing.scale.setScalar(radius * pulse);
      this.truthRing.material.opacity = 0.72;
    }
  }

  setTheme(theme) {
    this.theme = theme === 'space' ? 'space' : 'chart';
    const palette = PALETTE[this.theme];
    this.scene.background = new THREE.Color(palette.background);
    this.scene.fog.color.setHex(palette.background);
    this.scene.fog.density = this.theme === 'space' ? 0.006 : 0.002;
    this.renderer.toneMappingExposure = this.theme === 'space' ? 1.1 : 0.98;
    this.ambient.intensity = this.theme === 'space' ? 1.1 : 2.6;
    this.key.intensity = this.theme === 'space' ? 3.2 : 4.5;
    this.rim.intensity = this.theme === 'space' ? 3.1 : 1.3;
    this.gridGroup.children.forEach((line) => line.material.color.setHex(palette.grid));
    this.stars.material.color.setHex(palette.star);
    this.stars.material.opacity = this.theme === 'space' ? 0.95 : 0.25;
    this.stars.material.size = this.theme === 'space' ? 0.22 : 0.13;
    this.plannedRoute.material.color.setHex(palette.route);
    this.lastMarker.children.forEach((line) => line.material.color.setHex(palette.ink));
    this.verdantOrbit.material.color.setHex(palette.ink);
    this.outlines.forEach((outline) => {
      outline.material.color.setHex(this.theme === 'space' ? 0x86aee7 : 0x1d2240);
      outline.material.opacity = this.theme === 'space' ? 0.28 : 0.78;
    });
    this.glows.forEach((glow) => { glow.material.opacity = this.theme === 'space' ? 0.15 : 0.035; });
    this.planetMeshes.forEach((planet) => {
      planet.material.emissive.setHex(this.theme === 'space' ? planet.material.color.getHex() : 0x000000);
      planet.material.emissiveIntensity = this.theme === 'space' ? 0.12 : 0;
    });
    this.shoal.material.color.setHex(this.theme === 'space' ? 0x716d73 : 0x766d68);
    this.rime.material.opacity = this.theme === 'space' ? 0.62 : 0.38;
  }

  focusLocation(id) {
    const location = LOCATIONS[id];
    if (!location) return;
    this.currentView = 'focus';
    const target = v3(location.position);
    const offset = this.camera.position.clone().sub(this.controls.target).normalize();
    const distance = Math.max(location.radius * 5.2, 11);
    const endPosition = target.clone().add(offset.multiplyScalar(distance));
    endPosition.y = Math.max(endPosition.y, 6.5);
    this.cameraTween = {
      start: performance.now(),
      duration: 1150,
      fromPosition: this.camera.position.clone(),
      toPosition: endPosition,
      fromTarget: this.controls.target.clone(),
      toTarget: target,
    };
    this.onSelect?.(location);
  }

  setView(view) {
    const top = view === 'top';
    this.currentView = top ? 'top' : 'overview';
    this.cameraTween = {
      start: performance.now(),
      duration: 1300,
      fromPosition: this.camera.position.clone(),
      toPosition: top ? this.getTopPosition() : this.getOverviewPosition(),
      fromTarget: this.controls.target.clone(),
      toTarget: this.getViewTarget(),
    };
  }

  getOverviewPosition() {
    const portrait = this.camera.aspect < 0.75;
    const offset = portrait
      ? (this.mode === 'reveal' ? new THREE.Vector3(0, 104, 104) : new THREE.Vector3(0, 86, 86))
      : (this.mode === 'reveal' ? new THREE.Vector3(0, 49, 49) : new THREE.Vector3(0, 43, 39));
    return offset.add(this.getViewTarget());
  }

  getTopPosition() {
    const portrait = this.camera.aspect < 0.75;
    const height = portrait ? (this.mode === 'reveal' ? 150 : 120) : (this.mode === 'reveal' ? 72 : 65);
    return this.getViewTarget().add(new THREE.Vector3(0, height, 0.01));
  }

  getViewTarget() {
    return this.mode === 'reveal' ? new THREE.Vector3(-3.5, 0, 1.5) : new THREE.Vector3(0, 0, 0);
  }

  updateCameraTween(now) {
    if (!this.cameraTween) return;
    const t = clamp01((now - this.cameraTween.start) / this.cameraTween.duration);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    this.camera.position.lerpVectors(this.cameraTween.fromPosition, this.cameraTween.toPosition, eased);
    this.controls.target.lerpVectors(this.cameraTween.fromTarget, this.cameraTween.toTarget, eased);
    if (t >= 1) this.cameraTween = null;
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    this.labelRenderer.domElement.addEventListener('pointerdown', (event) => {
      this.pointerDown = { x: event.clientX, y: event.clientY };
    });
    this.labelRenderer.domElement.addEventListener('pointerup', (event) => {
      if (!this.pointerDown) return;
      const distance = Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y);
      this.pointerDown = null;
      if (distance > 6 || event.target.closest('button, input, .map-label')) return;
      const bounds = this.renderer.domElement.getBoundingClientRect();
      this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
      const id = hit?.object?.userData?.locationId;
      if (id) this.focusLocation(id);
    });
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.fov = this.camera.aspect < 0.75 ? 48 : 42;
    this.camera.updateProjectionMatrix();
    if (!this.cameraTween && this.currentView === 'overview') this.camera.position.copy(this.getOverviewPosition());
    if (!this.cameraTween && this.currentView === 'top') this.camera.position.copy(this.getTopPosition());
    this.renderer.setSize(width, height);
    this.labelRenderer.setSize(width, height);
  }

  updateIdle(elapsed, delta) {
    if (this.reducedMotion) return;
    this.planetMeshes.forEach((planet) => { planet.rotation.y += delta * planet.userData.rotationRate; });
    this.shoal.rotation.y = Math.sin(elapsed * 0.06) * 0.012;
    this.rime.rotation.y = Math.sin(elapsed * 0.08) * 0.018;
    this.rime.position.x = Math.sin(elapsed * 0.13) * 0.14;
    const center = v3(LOCATIONS.verdant.position);
    const stationAngle = elapsed * 0.08;
    this.verdantStation.position.set(center.x + Math.cos(stationAngle) * 2.35, 0.35, center.z + Math.sin(stationAngle) * 2.35);
    this.dockPing.position.copy(this.verdantStation.position);
    if (this.mode === 'reveal' && this.time >= 47.7) this.setTime(this.time);
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;
    this.updateIdle(elapsed, delta);
    this.updateCameraTween(performance.now());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  };
}
