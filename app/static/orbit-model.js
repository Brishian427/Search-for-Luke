(function () {
  const SVG = { centerX: 500, centerY: 300, scaleX: 3.75, scaleZ: 3.1 };

  window.orbitModelReady = fetch('/static/orbit-model.json')
    .then(response => {
      if (!response.ok) throw new Error(`Orbit model failed to load (${response.status})`);
      return response.json();
    })
    .then(definition => {
      const positionAt = (bodyId, hour) => {
        const body = definition.bodies[bodyId];
        if (!body) throw new Error(`Unknown orbit body: ${bodyId}`);
        const radius = Math.hypot(body.x, body.z);
        if (!radius || !body.omega) return { x: body.x, z: body.z };
        const base = Math.atan2(body.z, body.x);
        const angle = base + body.omega * (Number(hour) - definition.reference_hour) * Math.PI / 180;
        return { x: radius * Math.cos(angle), z: radius * Math.sin(angle) };
      };
      const toSvg = ({ x, z }) => ({ x: SVG.centerX + x * SVG.scaleX, y: SVG.centerY - z * SVG.scaleZ });
      const api = { ...definition, svg: SVG, positionAt, toSvg };
      window.OrbitModel = api;
      window.dispatchEvent(new CustomEvent('orbit-model-ready'));
      return api;
    });
}());
