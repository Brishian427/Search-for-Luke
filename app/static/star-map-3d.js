import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const host = document.querySelector('#star-map');
const mount = document.querySelector('#star-map-3d');
const labelLayer = document.querySelector('#map-3d-labels');
const resetButton = document.querySelector('#reset-3d-view');
const orbitReady = window.orbitModelReady || new Promise(resolve => window.addEventListener('orbit-model-ready', () => resolve(window.OrbitModel), { once: true }));

if (host && mount && labelLayer) {
  try {
    const orbitModel = await orbitReady;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b1017, 0.0042);

    const camera = new THREE.PerspectiveCamera(43, 5 / 3, 0.1, 900);
    const homePosition = new THREE.Vector3(0, 75, 207);
    const homeTarget = new THREE.Vector3(0, 0, 0);
    camera.position.copy(homePosition);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x0b1017, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    mount.prepend(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(homeTarget);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.zoomSpeed = 0.78;
    controls.rotateSpeed = 0.62;
    controls.enableRotate = true;
    controls.enablePan = false;
    controls.minDistance = 120;
    controls.maxDistance = 380;
    controls.minPolarAngle = 1.05;
    controls.maxPolarAngle = 1.35;
    controls.zoomToCursor = false;
    controls.update();
    controls.saveState();

    scene.add(new THREE.HemisphereLight(0x9ecbff, 0x11141b, 1.25));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(-35, 68, 110);
    scene.add(keyLight);
    const orangeLight = new THREE.PointLight(0xf0a04b, 42, 95, 2);
    orangeLight.position.set(92, 12, 22);
    scene.add(orangeLight);
    const veilLight = new THREE.PointLight(0xb9e7ff, 22, 70, 2);
    veilLight.position.set(104, 12, 2);
    scene.add(veilLight);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const interactiveIds = new Set(['orange', 'veil', 'green', 'red', 'debris']);
    const whatIfIds = new Set(['reach', 'orange', 'veil', 'green', 'red', 'debris']);
    const pickTargets = [];
    const bodies = new Map();
    const labels = new Map();
    const spinners = [];
    let gameInteractive = false;
    let whatIfInteractive = false;
    let currentSelections = [];
    let currentHour = 0;
    let plannedRoute = null;
    let shipMarker = null;
    let shipLabel = null;
    let whatIfRing = null;

    const orbitPosition = id => { const point = orbitModel.positionAt(id, currentHour); return [point.x, 0, point.z]; };
    const places = {
      reach:  { name: 'REACH',          position: orbitPosition('reach'),  radius: 7.3, color: '#6381a2', accent: '#a9d4ff', spin: 0.10 },
      orange: { name: 'ORANGE PLANET',  position: orbitPosition('orange'), radius: 12,  color: '#f0a04b', accent: '#ffd39a', spin: 0.075 },
      veil:   { name: 'THE VEIL',       position: orbitPosition('veil'),   radius: 11,  color: '#dde6f0', accent: '#ffffff', spin: 0.018 },
      green:  { name: 'GREEN PLANET',   position: orbitPosition('green'),  radius: 7.7, color: '#5fbf6b', accent: '#a8f2b2', spin: 0.09 },
      red:    { name: 'RED PLANET',     position: orbitPosition('red'),    radius: 7.7, color: '#e5534b', accent: '#ffaaa5', spin: 0.12 },
      debris: { name: 'DEBRIS BELT',    position: orbitPosition('debris'), radius: 12,  color: '#8b98a9', accent: '#c9d2db', spin: 0 }
    };

    function seeded(seed) {
      let value = seed >>> 0;
      return () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 4294967296;
      };
    }

    function planetTexture(base, accent, seed, storm = false) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      const random = seeded(seed);
      const gradient = ctx.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, accent);
      gradient.addColorStop(0.22, base);
      gradient.addColorStop(0.72, base);
      gradient.addColorStop(1, '#111820');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 512, 256);
      for (let band = 0; band < 18; band += 1) {
        const y = random() * 256;
        const height = 2 + random() * (storm ? 15 : 8);
        ctx.globalAlpha = 0.06 + random() * 0.16;
        ctx.fillStyle = random() > 0.5 ? accent : '#071018';
        ctx.fillRect(0, y, 512, height);
      }
      for (let spot = 0; spot < 48; spot += 1) {
        const x = random() * 512;
        const y = random() * 256;
        const radius = 1 + random() * (storm ? 20 : 9);
        ctx.globalAlpha = 0.04 + random() * 0.12;
        ctx.fillStyle = random() > 0.45 ? accent : '#0a1016';
        ctx.beginPath();
        ctx.ellipse(x, y, radius * 2.2, radius, random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return texture;
    }

    function selectionRing(radius, color) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 1.34, Math.max(0.2, radius * 0.035), 12, 64),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false })
      );
      ring.visible = false;
      return ring;
    }

    function createPlanet(id, config, index) {
      const group = new THREE.Group();
      group.position.set(...config.position);
      group.userData.place = id;
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(config.radius, 48, 32),
        new THREE.MeshStandardMaterial({
          map: planetTexture(config.color, config.accent, 913 + index * 101, id === 'storm' || id === 'orange'),
          color: config.color,
          roughness: id === 'orange' ? 0.72 : 0.86,
          metalness: id === 'reach' ? 0.12 : 0.02,
          emissive: new THREE.Color(config.color),
          emissiveIntensity: id === 'storm' ? 0.16 : 0.055
        })
      );
      sphere.rotation.z = (index - 2) * 0.08;
      sphere.userData.place = id;
      group.add(sphere);
      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(config.radius * 1.1, 32, 24),
        new THREE.MeshBasicMaterial({ color: config.accent, transparent: true, opacity: 0.08, side: THREE.BackSide, depthWrite: false })
      );
      group.add(atmosphere);
      const ring = selectionRing(config.radius, 0x58c4dc);
      group.add(ring);
      group.userData.selectionRing = ring;
      scene.add(group);
      pickTargets.push(sphere);
      spinners.push({ mesh: sphere, speed: config.spin });
      bodies.set(id, group);
    }

    function createVeil() {
      const config = places.veil;
      const group = new THREE.Group();
      group.position.set(...config.position);
      group.userData.place = 'veil';
      const random = seeded(7061);
      for (let index = 0; index < 14; index += 1) {
        const radius = 4 + random() * 7;
        const cloud = new THREE.Mesh(
          new THREE.IcosahedronGeometry(radius, 2),
          new THREE.MeshStandardMaterial({ color: index % 3 ? 0xdde6f0 : 0x8bbbd0, transparent: true, opacity: 0.035 + random() * 0.07, roughness: 1, depthWrite: false })
        );
        cloud.position.set((random() - 0.5) * 21, (random() - 0.5) * 15, (random() - 0.5) * 15);
        group.add(cloud);
        if (!reducedMotion) spinners.push({ mesh: cloud, speed: 0.018 + random() * 0.02 });
      }
      const points = [];
      for (let index = 0; index < 170; index += 1) {
        points.push((random() - 0.5) * 28, (random() - 0.5) * 20, (random() - 0.5) * 20);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      group.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xdde6f0, size: 0.42, transparent: true, opacity: 0.45, depthWrite: false })));
      const hit = new THREE.Mesh(new THREE.SphereGeometry(13, 20, 16), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false }));
      hit.userData.place = 'veil';
      group.add(hit);
      const ring = selectionRing(12, 0x58c4dc);
      group.add(ring);
      group.userData.selectionRing = ring;
      scene.add(group);
      pickTargets.push(hit);
      bodies.set('veil', group);
    }

    function createDebris() {
      const config = places.debris;
      const group = new THREE.Group();
      group.position.set(...config.position);
      group.userData.place = 'debris';
      const random = seeded(4815);
      const geometry = new THREE.DodecahedronGeometry(0.75, 0);
      const material = new THREE.MeshStandardMaterial({ color: 0x7f8b99, roughness: 0.95, metalness: 0.1 });
      const rocks = new THREE.InstancedMesh(geometry, material, 42);
      rocks.userData.place = 'debris';
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      for (let index = 0; index < 42; index += 1) {
        const t = index / 41;
        const angle = Math.PI * (0.12 + t * 0.76);
        const radius = 14 + (random() - 0.5) * 4;
        const position = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * 7 - 2, (random() - 0.5) * 7);
        quaternion.setFromEuler(new THREE.Euler(random() * Math.PI, random() * Math.PI, random() * Math.PI));
        const size = 0.55 + random() * 1.45;
        scale.set(size, size * (0.6 + random() * 0.8), size);
        matrix.compose(position, quaternion, scale);
        rocks.setMatrixAt(index, matrix);
      }
      group.add(rocks);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(13, 18, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false }));
      hit.userData.place = 'debris';
      group.add(hit);
      const ring = selectionRing(12, 0x58c4dc);
      group.add(ring);
      group.userData.selectionRing = ring;
      scene.add(group);
      pickTargets.push(hit);
      bodies.set('debris', group);
    }

    function createShipAndRange() {
      shipMarker = new THREE.Group();
      const hull = new THREE.Mesh(
        new THREE.OctahedronGeometry(2.2, 0),
        new THREE.MeshStandardMaterial({ color: 0x8be8f4, emissive: 0x2b8195, emissiveIntensity: 0.8, roughness: 0.35, metalness: 0.45 })
      );
      hull.scale.set(0.72, 0.72, 1.7);
      hull.rotation.x = Math.PI / 2;
      shipMarker.add(hull);
      shipMarker.position.set(0, 9.5, 0);
      scene.add(shipMarker);
      shipLabel = document.createElement('div');
      shipLabel.className = 'map-ship-label';
      shipLabel.textContent = 'Last confirmed: Hour 0';
      labelLayer.appendChild(shipLabel);

      const points = [];
      for (let step = 0; step < 128; step += 1) {
        const angle = step / 128 * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
      }
      whatIfRing = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineDashedMaterial({ color: 0x58c4dc, dashSize: 0.045, gapSize: 0.025, transparent: true, opacity: 0.86, depthWrite: false })
      );
      whatIfRing.computeLineDistances();
      whatIfRing.position.y = 1.1;
      whatIfRing.renderOrder = 3;
      whatIfRing.visible = false;
      scene.add(whatIfRing);
    }

    function createGrid() {
      const points = [];
      for (let x = -120; x <= 120; x += 10) points.push(x, -1.4, -120, x, -1.4, 120);
      for (let z = -120; z <= 120; z += 10) points.push(-120, -1.4, z, 120, -1.4, z);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      scene.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x5c7085, transparent: true, opacity: 0.09 })));
    }

    function createOrbits() {
      const center = new THREE.Vector3(...places.reach.position);
      ['red', 'green', 'orange'].forEach((id, index) => {
        const body = orbitModel.bodies[id];
        const position = new THREE.Vector3(body.x, 0, body.z);
        const radius = Math.hypot(position.x - center.x, position.z - center.z);
        const points = [];
        for (let step = 0; step < 128; step += 1) {
          const angle = step / 128 * Math.PI * 2;
          points.push(new THREE.Vector3(center.x + Math.cos(angle) * radius, -0.6 - index * 0.04, center.z + Math.sin(angle) * radius));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        scene.add(new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: 0x7890a8, transparent: true, opacity: 0.16, depthWrite: false })));
      });
    }

    function createStars() {
      const random = seeded(2991);
      const points = [];
      for (let index = 0; index < 420; index += 1) points.push((random() - 0.5) * 280, (random() - 0.5) * 170, -45 - random() * 180);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x9fb6ca, size: 0.32, transparent: true, opacity: 0.48, depthWrite: false })));
    }

    function createRoute() {
      plannedRoute = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x8ca1b8, dashSize: 2.4, gapSize: 2.1, transparent: true, opacity: 0.65 }));
      scene.add(plannedRoute);
      updateRoute();
    }

    function updateRoute() {
      if (!plannedRoute) return;
      const reach = bodies.get('reach')?.position || new THREE.Vector3(...places.reach.position);
      const orange = bodies.get('orange')?.position || new THREE.Vector3(...places.orange.position);
      const midpoint = reach.clone().lerp(orange, 0.5);
      midpoint.y = 1.2;
      const curve = new THREE.QuadraticBezierCurve3(reach.clone().setY(0.7), midpoint, orange.clone().setY(0.7));
      plannedRoute.geometry.dispose();
      plannedRoute.geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(70));
      plannedRoute.computeLineDistances();
    }

    function createLabel(id, config) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `map-3d-label map-3d-label-${id}`;
      button.innerHTML = `<span>${config.name}</span><b aria-hidden="true"></b>`;
      button.setAttribute('aria-label', config.name);
      button.addEventListener('click', event => {
        event.stopPropagation();
        if (canSelect(id)) select(id);
      });
      labelLayer.appendChild(button);
      labels.set(id, button);
    }

    createGrid();
    createOrbits();
    createStars();
    createRoute();
    ['reach', 'orange', 'green', 'red'].forEach((id, index) => createPlanet(id, places[id], index));
    createVeil();
    createDebris();
    createShipAndRange();
    Object.entries(places).forEach(([id, config]) => createLabel(id, config));

    function select(id) {
      window.dispatchEvent(new CustomEvent('star-map-select', { detail: { id } }));
    }

    function canSelect(id) {
      return (whatIfInteractive && whatIfIds.has(id)) || (gameInteractive && interactiveIds.has(id));
    }

    function placeFromObject(object) {
      let current = object;
      while (current) {
        if (current.userData.place) return current.userData.place;
        current = current.parent;
      }
      return null;
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerStart = null;
    renderer.domElement.addEventListener('pointerdown', event => {
      pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() };
    });
    renderer.domElement.addEventListener('pointermove', event => {
      if (!(gameInteractive || whatIfInteractive) || event.buttons) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickTargets, true)[0];
      renderer.domElement.style.cursor = hit && canSelect(placeFromObject(hit.object)) ? 'pointer' : 'grab';
    });
    renderer.domElement.addEventListener('pointerup', event => {
      if (!pointerStart) return;
      const start = pointerStart;
      pointerStart = null;
      if (!(gameInteractive || whatIfInteractive)) return;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      const elapsed = performance.now() - start.time;
      if (moved > 7 || elapsed > 650) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickTargets, true)[0];
      const id = hit ? placeFromObject(hit.object) : null;
      if (id && canSelect(id)) select(id);
    });
    renderer.domElement.addEventListener('pointercancel', () => { pointerStart = null; });

    function updateLabels() {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      const vector = new THREE.Vector3();
      const orangeVeilClose = bodies.get('orange').position.distanceTo(bodies.get('veil').position) < 34;
      const compact = width < 600;
      const screenOffsets = orangeVeilClose
        ? { orange: [compact ? -86 : -72, 14], veil: [compact ? 86 : 72, -16] }
        : { orange: [-16, 2], veil: [18, -10] };
      labels.forEach((label, id) => {
        const body = bodies.get(id);
        vector.copy(body.position);
        vector.y += places[id].radius + 4.5;
        vector.project(camera);
        const visible = vector.z > -1 && vector.z < 1;
        label.hidden = !visible;
        if (!visible) return;
        const [offsetX, offsetY] = screenOffsets[id] || [0, 0];
        const rawX = (vector.x * 0.5 + 0.5) * width + offsetX;
        const rawY = (-vector.y * 0.5 + 0.5) * height + offsetY;
        const labelPadding = Math.min(70, width * 0.19);
        const x = Math.max(labelPadding, Math.min(width - labelPadding, rawX));
        label.style.transform = `translate(-50%,-50%) translate(${x}px,${rawY}px)`;
      });
      if (shipLabel && shipMarker) {
        vector.copy(shipMarker.position);
        vector.y += 5;
        vector.project(camera);
        const visible = shipMarker.visible && vector.z > -1 && vector.z < 1;
        shipLabel.hidden = !visible;
        if (visible) {
          const x = Math.max(90, Math.min(width - 90, (vector.x * 0.5 + 0.5) * width));
          const y = (-vector.y * 0.5 + 0.5) * height;
          shipLabel.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px)`;
        }
      }
    }

    let viewInitialized = false;
    function resetView() {
      const compact = mount.clientWidth < 600;
      const distance = compact ? 255 : 230;
      const elevation = compact ? 0.49 : 0.43;
      homePosition.set(homeTarget.x, homeTarget.y + distance * elevation, homeTarget.z + distance * Math.sqrt(1 - elevation * elevation));
      camera.position.copy(homePosition);
      controls.target.copy(homeTarget);
      controls.update();
    }

    function resize() {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.clearViewOffset();
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      if (!viewInitialized && width > 100 && height > 100) {
        resetView();
        viewInitialized = true;
      }
    }
    new ResizeObserver(resize).observe(mount);
    resize();

    resetButton?.addEventListener('click', resetView);

    function setInteractionMode({ game = false, whatIf = false } = {}) {
      gameInteractive = !!game;
      whatIfInteractive = !!whatIf;
      mount.classList.toggle('is-interactive', gameInteractive || whatIfInteractive);
      labels.forEach((label, id) => {
        const enabled = canSelect(id);
        label.classList.toggle('is-interactive', enabled);
        label.tabIndex = enabled ? 0 : -1;
        label.setAttribute('aria-disabled', String(!enabled));
      });
    }

    function setInteractive(value) {
      setInteractionMode({ game: value, whatIf: false });
    }

    function setHour(value) {
      currentHour = Math.max(0, Math.min(48, Number(value) || 0));
      bodies.forEach((body, id) => {
        const point = orbitModel.positionAt(id, currentHour);
        body.position.x = point.x;
        body.position.z = point.z;
      });
      const orange = orbitModel.positionAt('orange', currentHour);
      orangeLight.position.set(orange.x, 12, orange.z + 14);
      if (shipMarker) {
        const reach = orbitModel.positionAt('reach', currentHour);
        shipMarker.position.set(reach.x, 9.5, reach.z);
        shipMarker.visible = currentHour === 0;
      }
      updateRoute();
    }

    function setWhatIfRing(state, hour = currentHour) {
      if (!whatIfRing || !state || Number(hour) < Number(state.startHour)) {
        if (whatIfRing) whatIfRing.visible = false;
        return;
      }
      const radius = orbitModel.ship_speed * (Number(hour) - Number(state.startHour));
      whatIfRing.position.set(Number(state.x), 1.1, Number(state.z));
      whatIfRing.scale.set(radius, 1, radius);
      whatIfRing.visible = radius > 0;
    }

    function getBodyPosition(id) {
      const body = bodies.get(id);
      return body ? { x: body.position.x, y: body.position.y, z: body.position.z } : null;
    }

    function setSelections(values = []) {
      currentSelections = [...values];
      bodies.forEach((body, id) => {
        const count = currentSelections.filter(value => value === id).length;
        body.userData.selectionRing.visible = count > 0;
        const label = labels.get(id);
        label.classList.toggle('is-selected', count > 0);
        label.querySelector('b').textContent = count ? String(count) : '';
        label.setAttribute('aria-label', `${places[id].name}${count ? `, selected ${count}` : ''}`);
      });
    }

    let previousFrame = performance.now();
    function animate(now = performance.now()) {
      requestAnimationFrame(animate);
      const delta = Math.min((now - previousFrame) / 1000, 0.05);
      previousFrame = now;
      if (!document.hidden && !reducedMotion) spinners.forEach(item => { item.mesh.rotation.y += item.speed * delta; });
      controls.update(delta);
      bodies.forEach(body => { body.userData.selectionRing.quaternion.copy(camera.quaternion); });
      updateLabels();
      renderer.render(scene, camera);
    }
    animate();

    setHour(0);
    window.starMap3D = { setInteractive, setInteractionMode, setSelections, setHour, setWhatIfRing, getBodyPosition, resetView, ready: true };
    host.classList.add('webgl-ready');
    window.dispatchEvent(new CustomEvent('star-map-3d-ready'));
  } catch (error) {
    console.warn('3D navigation unavailable; using SVG fallback.', error);
    mount.hidden = true;
  }
}
