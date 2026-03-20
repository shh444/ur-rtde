import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ColladaLoader } from "three/addons/loaders/ColladaLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const FLANGE_RPY = new THREE.Euler(0, -Math.PI / 2, -Math.PI / 2, "XYZ");
const ASSET_VERSION = "20260320-model-mesh-fix";
const MESH_CONFIG_URL = `/assets/ur_mesh_presets.json?v=${ASSET_VERSION}`;
const DEFAULT_IMPORTED_MESH_SCALE = 1.0; // UR Collada assets already contain their own unit transform.
const JOINT_CHAIN = [
  { joint: "shoulder", link: "shoulder" },
  { joint: "upper_arm", link: "upper_arm" },
  { joint: "forearm", link: "forearm" },
  { joint: "wrist_1", link: "wrist_1" },
  { joint: "wrist_2", link: "wrist_2" },
  { joint: "wrist_3", link: "wrist_3" },
];

const MODEL_SPECS = {
  ur3e: {
    label: "UR3e",
    dh: [
      { a: 0.0, d: 0.15185, alpha: Math.PI / 2 },
      { a: -0.24355, d: 0.0, alpha: 0.0 },
      { a: -0.2132, d: 0.0, alpha: 0.0 },
      { a: 0.0, d: 0.13105, alpha: Math.PI / 2 },
      { a: 0.0, d: 0.08535, alpha: -Math.PI / 2 },
      { a: 0.0, d: 0.0921, alpha: 0.0 },
    ],
  },
  ur5e: {
    label: "UR5e / UR7e",
    dh: [
      { a: 0.0, d: 0.1625, alpha: Math.PI / 2 },
      { a: -0.425, d: 0.0, alpha: 0.0 },
      { a: -0.3922, d: 0.0, alpha: 0.0 },
      { a: 0.0, d: 0.1333, alpha: Math.PI / 2 },
      { a: 0.0, d: 0.0997, alpha: -Math.PI / 2 },
      { a: 0.0, d: 0.0996, alpha: 0.0 },
    ],
  },
  ur10e: {
    label: "UR10e / UR12e",
    dh: [
      { a: 0.0, d: 0.1807, alpha: Math.PI / 2 },
      { a: -0.6127, d: 0.0, alpha: 0.0 },
      { a: -0.57155, d: 0.0, alpha: 0.0 },
      { a: 0.0, d: 0.17415, alpha: Math.PI / 2 },
      { a: 0.0, d: 0.11985, alpha: -Math.PI / 2 },
      { a: 0.0, d: 0.11655, alpha: 0.0 },
    ],
  },
  ur16e: {
    label: "UR16e",
    dh: [
      { a: 0.0, d: 0.1807, alpha: Math.PI / 2 },
      { a: -0.4784, d: 0.0, alpha: 0.0 },
      { a: -0.36, d: 0.0, alpha: 0.0 },
      { a: 0.0, d: 0.17415, alpha: Math.PI / 2 },
      { a: 0.0, d: 0.11985, alpha: -Math.PI / 2 },
      { a: 0.0, d: 0.11655, alpha: 0.0 },
    ],
  },
  ur20: {
    label: "UR20",
    dh: [
      { a: 0.0, d: 0.2363, alpha: Math.PI / 2 },
      { a: -0.8620, d: 0.0, alpha: 0.0 },
      { a: -0.7287, d: 0.0, alpha: 0.0 },
      { a: 0.0, d: 0.2010, alpha: Math.PI / 2 },
      { a: 0.0, d: 0.1593, alpha: -Math.PI / 2 },
      { a: 0.0, d: 0.1543, alpha: 0.0 },
    ],
  },
  ur30: {
    label: "UR30",
    dh: [
      { a: 0.0, d: 0.2363, alpha: Math.PI / 2 },
      { a: -0.6370, d: 0.0, alpha: 0.0 },
      { a: -0.5037, d: 0.0, alpha: 0.0 },
      { a: 0.0, d: 0.2010, alpha: Math.PI / 2 },
      { a: 0.0, d: 0.1593, alpha: -Math.PI / 2 },
      { a: 0.0, d: 0.1543, alpha: 0.0 },
    ],
  },
  ur3: {
    label: "UR3",
    dh: [
      { a: 0.0, d: 0.1519, alpha: Math.PI / 2 },
      { a: -0.24365, d: 0.0, alpha: 0.0 },
      { a: -0.21325, d: 0.0, alpha: 0.0 },
      { a: 0.0, d: 0.11235, alpha: Math.PI / 2 },
      { a: 0.0, d: 0.08535, alpha: -Math.PI / 2 },
      { a: 0.0, d: 0.0819, alpha: 0.0 },
    ],
  },
  ur5: {
    label: "UR5",
    dh: [
      { a: 0.0, d: 0.089159, alpha: Math.PI / 2 },
      { a: -0.425, d: 0.0, alpha: 0.0 },
      { a: -0.39225, d: 0.0, alpha: 0.0 },
      { a: 0.0, d: 0.10915, alpha: Math.PI / 2 },
      { a: 0.0, d: 0.09465, alpha: -Math.PI / 2 },
      { a: 0.0, d: 0.0823, alpha: 0.0 },
    ],
  },
  ur10: {
    label: "UR10",
    dh: [
      { a: 0.0, d: 0.1273, alpha: Math.PI / 2 },
      { a: -0.612, d: 0.0, alpha: 0.0 },
      { a: -0.5723, d: 0.0, alpha: 0.0 },
      { a: 0.0, d: 0.163941, alpha: Math.PI / 2 },
      { a: 0.0, d: 0.1157, alpha: -Math.PI / 2 },
      { a: 0.0, d: 0.0922, alpha: 0.0 },
    ],
  },
};

Object.values(MODEL_SPECS).forEach((spec) => {
  spec.reach = spec.dh.reduce((acc, joint) => acc + Math.abs(joint.a) + Math.abs(joint.d), 0.0);
});

const MODEL_ALIASES = {
  ur7e: "ur5e",
  ur12e: "ur10e",
};

const SCENE_REFERENCE_REACH = Math.max(...Object.values(MODEL_SPECS).map((spec) => spec.reach));
const WORKSPACE_RING_RADIUS = SCENE_REFERENCE_REACH * 0.55;

export const ROBOT_MODEL_LABELS = Object.fromEntries(
  Object.entries(MODEL_SPECS).map(([key, spec]) => [key, spec.label]),
);

function normalizeModelKey(modelKey) {
  const raw = String(modelKey || "").trim().toLowerCase();
  if (MODEL_SPECS[raw]) return raw;
  const alias = MODEL_ALIASES[raw];
  if (alias && MODEL_SPECS[alias]) return alias;
  return "ur5e";
}

function meshFamilyFromPath(meshPath) {
  const match = String(meshPath || "").match(/meshes\/([^/]+)\//i);
  return match ? String(match[1]).toLowerCase() : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function formatTuple(values, digits = 1) {
  if (!Array.isArray(values)) return "-";
  return `[${values.map((value) => formatNumber(value, digits)).join(", ")}]`;
}

function inferImportedMeshScale(meshPath, explicitScale = null) {
  if (Number.isFinite(Number(explicitScale)) && Number(explicitScale) > 0) {
    return Number(explicitScale);
  }
  const lower = String(meshPath || "").toLowerCase();
  if (lower.endsWith(".dae")) return DEFAULT_IMPORTED_MESH_SCALE;
  return 1.0;
}

function fallbackCollisionMeshPath(meshPath) {
  const lower = String(meshPath || "").toLowerCase();
  if (lower.includes("/visual/") && lower.endsWith(".dae")) {
    return lower.replace("/visual/", "/collision/").replace(/\.dae$/, ".stl");
  }
  return null;
}

function linkFallbackColor(linkName) {
  if (String(linkName).startsWith("wrist")) return 0xa9b4c0;
  if (linkName === "base" || linkName === "shoulder") return 0x0b74c7;
  return 0xe8edf5;
}

function normalizeImportedScene(root, linkName) {
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.quaternion.identity();
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.frustumCulled = false;
    const sourceMaterials = Array.isArray(node.material) ? node.material : [node.material];
    const materials = sourceMaterials.filter(Boolean).length ? sourceMaterials : [null];
    const normalized = materials.map((material) => {
      const mat = material || new THREE.MeshStandardMaterial({
        color: linkFallbackColor(linkName),
        metalness: 0.18,
        roughness: 0.34,
      });
      mat.side = THREE.DoubleSide;
      mat.transparent = false;
      mat.opacity = 1.0;
      mat.depthWrite = true;
      if (mat.color == null) mat.color = new THREE.Color(linkFallbackColor(linkName));
      if ("metalness" in mat && !Number.isFinite(mat.metalness)) mat.metalness = 0.18;
      if ("roughness" in mat && !Number.isFinite(mat.roughness)) mat.roughness = 0.34;
      mat.needsUpdate = true;
      return mat;
    });
    node.material = normalized.length === 1 ? normalized[0] : normalized;
  });
  return root;
}


function computeObjectBounds(object) {
  object.updateMatrixWorld?.(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return null;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  return { box, size, center, maxDim: Math.max(size.x, size.y, size.z), minDim: Math.min(size.x, size.y, size.z) };
}

function maybeAutoRescaleImportedWrapper(wrapper, linkName, logger) {
  const bounds = computeObjectBounds(wrapper);
  if (!bounds) {
    logger?.('warning', 'Imported link has an empty bounding box', { linkName });
    return { changed: false, scale: wrapper.scale.x, size: null };
  }

  let changed = false;
  let passes = 0;
  while (bounds.maxDim < 0.005 && passes < 3) {
    wrapper.scale.multiplyScalar(10.0);
    changed = true;
    passes += 1;
    wrapper.updateMatrixWorld(true);
    const next = computeObjectBounds(wrapper);
    if (!next) break;
    bounds.size.copy(next.size);
    bounds.center.copy(next.center);
    bounds.maxDim = next.maxDim;
    bounds.minDim = next.minDim;
  }

  while (bounds.maxDim > 8.0 && passes < 6) {
    wrapper.scale.multiplyScalar(0.1);
    changed = true;
    passes += 1;
    wrapper.updateMatrixWorld(true);
    const next = computeObjectBounds(wrapper);
    if (!next) break;
    bounds.size.copy(next.size);
    bounds.center.copy(next.center);
    bounds.maxDim = next.maxDim;
    bounds.minDim = next.minDim;
  }

  if (changed) {
    logger?.('warning', 'Imported link scale was auto-corrected', {
      linkName,
      final_scale: Number(wrapper.scale.x.toFixed(6)),
      size_m: [
        Number(bounds.size.x.toFixed(5)),
        Number(bounds.size.y.toFixed(5)),
        Number(bounds.size.z.toFixed(5)),
      ],
    });
  }

  return {
    changed,
    scale: wrapper.scale.x,
    size: [bounds.size.x, bounds.size.y, bounds.size.z],
    center: [bounds.center.x, bounds.center.y, bounds.center.z],
  };
}
function setCylinderBetween(mesh, start, end, radius) {
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length < 1e-7) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  mesh.position.copy(start).addScaledVector(delta, 0.5);
  mesh.scale.set(radius, length, radius);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, delta.normalize());
}

function dhMatrix(a, d, alpha, theta) {
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  return new THREE.Matrix4().set(
    ct, -st * ca, st * sa, a * ct,
    st, ct * ca, -ct * sa, a * st,
    0, sa, ca, d,
    0, 0, 0, 1,
  );
}

function forwardKinematics(modelKey, q) {
  const spec = MODEL_SPECS[modelKey] || MODEL_SPECS.ur5e;
  const joints = Array.from({ length: 6 }, (_, index) => Number(q?.[index]) || 0);
  const origins = [new THREE.Vector3(0, 0, 0)];
  const transforms = [];
  let transform = new THREE.Matrix4().identity();

  spec.dh.forEach((joint, index) => {
    transform = transform.clone().multiply(dhMatrix(joint.a, joint.d, joint.alpha, joints[index]));
    transforms.push(transform.clone());
    origins.push(new THREE.Vector3().setFromMatrixPosition(transform));
  });

  const flange = origins[origins.length - 1].clone();
  const flangeQuaternion = new THREE.Quaternion().setFromRotationMatrix(transforms[transforms.length - 1]);
  return { origins, flange, flangeQuaternion, q: joints, label: spec.label, reach: spec.reach };
}

function rotvecToQuaternion(rotvec) {
  const [rx, ry, rz] = rotvec.map((value) => Number(value) || 0);
  const theta = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (theta < 1e-12) return new THREE.Quaternion();
  const axis = new THREE.Vector3(rx / theta, ry / theta, rz / theta);
  return new THREE.Quaternion().setFromAxisAngle(axis, theta);
}

function quaternionToRpyDeg(quaternion) {
  const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  return [
    THREE.MathUtils.radToDeg(euler.x),
    THREE.MathUtils.radToDeg(euler.y),
    THREE.MathUtils.radToDeg(euler.z),
  ];
}

function orientationDeltaDeg(q1, q2) {
  const dot = Math.abs(clamp(q1.dot(q2), -1, 1));
  return THREE.MathUtils.radToDeg(2 * Math.acos(dot));
}

function vectorDeltaMm(a, b) {
  return a.distanceTo(b) * 1000.0;
}

function buildTrailPoints(history) {
  const axes = history?.tcp_xyz_mm || [];
  const xs = axes[0]?.data || [];
  const ys = axes[1]?.data || [];
  const zs = axes[2]?.data || [];
  const count = Math.min(xs.length, ys.length, zs.length);
  const points = [];
  for (let index = 0; index < count; index += 1) {
    points.push(new THREE.Vector3(xs[index][1] / 1000.0, ys[index][1] / 1000.0, zs[index][1] / 1000.0));
  }
  return points;
}

function applyUrdfRotation(group, origin) {
  const roll = Number(origin?.roll) || 0;
  const pitch = Number(origin?.pitch) || 0;
  const yaw = Number(origin?.yaw) || 0;
  group.rotation.set(0, 0, 0);
  const euler = new THREE.Euler(roll, pitch, yaw, "ZYX");
  const quat = new THREE.Quaternion().setFromEuler(euler);
  quat.multiply(group.quaternion);
  group.quaternion.copy(quat);
}

function applyOrigin(group, origin) {
  group.position.set(Number(origin?.x) || 0, Number(origin?.y) || 0, Number(origin?.z) || 0);
  applyUrdfRotation(group, origin);
}

function clearGroup(group) {
  group.clear();
}

export class DigitalTwinView {
  constructor(container) {
    this.container = container;
    this.modelKey = "ur5e";
    this.freeze = false;
    this.showTrail = true;
    this.lastSummary = null;
    this.visualConfigs = null;
    this.visualConfigsPromise = null;
    this.assetCache = new Map();
    this.visualRequestId = 0;
    this.visualReady = false;
    this.visualLoading = false;
    this.visualWarning = null;
    this.visualJointGroups = [];
    this.visualFlange = null;
    this.debugLogs = [];

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1220);
    this.scene.fog = new THREE.Fog(0x0b1220, 1.5, 6.0);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 40);
    this.camera.up.set(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.95);
    keyLight.position.set(1.8, -2.0, 2.4);
    keyLight.castShadow = true;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9fb0cf, 0.35);
    fillLight.position.set(-1.6, 1.6, 1.4);
    this.scene.add(fillLight);

    this.grid = new THREE.GridHelper(2.8, 24, 0x375072, 0x243247);
    this.grid.rotation.x = Math.PI / 2;
    this.grid.material.opacity = 0.35;
    this.grid.material.transparent = true;
    this.scene.add(this.grid);

    this.axesHelper = new THREE.AxesHelper(0.25);
    this.scene.add(this.axesHelper);

    this.workspaceRing = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x335a82, transparent: true, opacity: 0.55 }),
    );
    this.scene.add(this.workspaceRing);

    this.robotGroup = new THREE.Group();
    this.scene.add(this.robotGroup);

    this.modelOriginMarker = new THREE.Group();
    this.modelOriginMarker.add(new THREE.AxesHelper(0.16));
    const originSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 18, 18),
      new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0x7c2d12, metalness: 0.04, roughness: 0.2 }),
    );
    this.modelOriginMarker.add(originSphere);
    this.robotGroup.add(this.modelOriginMarker);

    this.proceduralGroup = new THREE.Group();
    this.robotGroup.add(this.proceduralGroup);
    this.visualRoot = new THREE.Group();
    this.robotGroup.add(this.visualRoot);

    this.basePedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 48),
      new THREE.MeshStandardMaterial({ color: 0xe8edf5, metalness: 0.12, roughness: 0.48 }),
    );
    this.basePedestal.castShadow = true;
    this.basePedestal.receiveShadow = true;
    this.proceduralGroup.add(this.basePedestal);

    this.baseAccent = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 0.18, 48),
      new THREE.MeshStandardMaterial({ color: 0x0b74c7, metalness: 0.12, roughness: 0.35 }),
    );
    this.baseAccent.castShadow = true;
    this.baseAccent.receiveShadow = true;
    this.proceduralGroup.add(this.baseAccent);

    this.linkGeometry = new THREE.CylinderGeometry(1, 1, 1, 30);
    this.linkMaterial = new THREE.MeshStandardMaterial({ color: 0xe8edf5, metalness: 0.18, roughness: 0.24 });
    this.jointMaterial = new THREE.MeshStandardMaterial({ color: 0x0b74c7, metalness: 0.12, roughness: 0.34 });

    this.linkMeshes = Array.from({ length: 6 }, (_, index) => {
      const mesh = new THREE.Mesh(this.linkGeometry, this.linkMaterial.clone());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.linkIndex = index;
      this.proceduralGroup.add(mesh);
      return mesh;
    });

    this.jointMeshes = Array.from({ length: 7 }, (_, index) => {
      const radius = index >= 4 ? 0.75 : 1.0;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, index >= 4 ? 0.8 : 1.0, 36),
        this.jointMaterial.clone(),
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.proceduralGroup.add(mesh);
      return mesh;
    });

    this.jointCaps = Array.from({ length: 7 }, (_, index) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(index >= 4 ? 0.58 : 0.72, 20, 20),
        new THREE.MeshStandardMaterial({ color: 0xf7fafc, metalness: 0.06, roughness: 0.32 }),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.proceduralGroup.add(mesh);
      return mesh;
    });

    this.modelTcpMarker = new THREE.Group();
    const modelSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x0b3d1e, metalness: 0.05, roughness: 0.18 }),
    );
    this.modelTcpMarker.add(modelSphere);
    this.modelTcpMarker.add(new THREE.AxesHelper(0.11));
    this.robotGroup.add(this.modelTcpMarker);

    this.actualTcpMarker = new THREE.Group();
    const actualSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x082f49, metalness: 0.05, roughness: 0.18 }),
    );
    this.actualTcpMarker.add(actualSphere);
    this.actualTcpMarker.add(new THREE.AxesHelper(0.095));
    this.scene.add(this.actualTcpMarker);

    this.trailGeometry = new THREE.BufferGeometry();
    this.trailLine = new THREE.Line(
      this.trailGeometry,
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 }),
    );
    this.scene.add(this.trailLine);

    this.loader = new ColladaLoader();
    this.stlLoader = new STLLoader();
    this.log("info", "Digital twin initialized", { modelKey: this.modelKey });
    this.setModel(this.modelKey);
    this.resize();
    this.animate();
  }

  log(level, message, extra = null) {
    const entry = {
      time: new Date().toISOString(),
      level,
      message,
      extra: extra == null ? null : JSON.parse(JSON.stringify(extra)),
    };
    this.debugLogs.push(entry);
    if (this.debugLogs.length > 200) this.debugLogs.shift();
    const logger = level === "error" ? console.error : (level === "warning" ? console.warn : console.log);
    logger(`[DigitalTwin] ${message}`, extra || "");
    return entry;
  }

  getDebugText() {
    return this.debugLogs.slice(-18).map((entry) => {
      const base = `${entry.time} [${entry.level}] ${entry.message}`;
      if (entry.extra == null) return base;
      return `${base} ${JSON.stringify(entry.extra)}`;
    }).join("\n");
  }

  async ensureVisualConfigs() {
    if (this.visualConfigs) return this.visualConfigs;
    if (!this.visualConfigsPromise) {
      this.visualConfigsPromise = fetch(MESH_CONFIG_URL)
        .then((response) => {
          if (!response.ok) throw new Error(`Failed to load ${MESH_CONFIG_URL}`);
          return response.json();
        })
        .catch(() => ({}));
    }
    this.visualConfigs = await this.visualConfigsPromise;
    this.log("info", "Mesh preset catalog loaded", { models: Object.keys(this.visualConfigs || {}) });
    return this.visualConfigs;
  }

  async cloneCollada(url, linkName) {
    if (!this.assetCache.has(url)) {
      this.assetCache.set(url, this.loader.loadAsync(url).then((result) => {
        const scene = normalizeImportedScene(result.scene, linkName);
        scene.updateMatrixWorld(true);
        return scene;
      }));
    }
    const scene = await this.assetCache.get(url);
    return scene.clone(true);
  }

  async cloneStl(url, linkName) {
    if (!this.assetCache.has(url)) {
      this.assetCache.set(url, this.stlLoader.loadAsync(url).then((geometry) => {
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: linkFallbackColor(linkName),
            metalness: 0.14,
            roughness: 0.42,
          }),
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        return mesh;
      }));
    }
    const mesh = await this.assetCache.get(url);
    return mesh.clone(true);
  }

  async cloneImportedAsset(url, linkName) {
    if (String(url).toLowerCase().endsWith(".stl")) {
      return this.cloneStl(url, linkName);
    }
    return this.cloneCollada(url, linkName);
  }

  validateVisualBounds(modelKey) {
    this.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.visualRoot);
    if (box.isEmpty()) {
      this.log("warning", "Mesh model produced an empty bounding box", { modelKey });
      return false;
    }
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const minDim = Math.min(size.x, size.y, size.z);
    const payload = {
      modelKey,
      size_m: [Number(size.x.toFixed(4)), Number(size.y.toFixed(4)), Number(size.z.toFixed(4))],
      center_m: [Number(center.x.toFixed(4)), Number(center.y.toFixed(4)), Number(center.z.toFixed(4))],
    };
    this.log("info", "Mesh bounds evaluated", payload);
    if (!Number.isFinite(maxDim) || !Number.isFinite(minDim) || maxDim < 0.05 || maxDim > 6.0) {
      this.log("warning", "Mesh bounds look wrong on screen, using procedural fallback", payload);
      return false;
    }
    return true;
  }

  async addLinkVisual(linkFrame, modelConfig, linkName) {
    const linkConfig = modelConfig?.links?.[linkName];
    if (!linkConfig?.mesh_path) {
      this.log("warning", "Missing mesh path for link", { linkName });
      return;
    }

    const wrapper = new THREE.Group();
    applyOrigin(wrapper, linkConfig.offset || {});
    wrapper.scale.setScalar(inferImportedMeshScale(linkConfig.mesh_path, linkConfig.scale));

    const primaryUrl = `/robot_assets/${linkConfig.mesh_path}`;
    const fallbackPath = linkConfig.fallback_mesh_path || fallbackCollisionMeshPath(linkConfig.mesh_path);
    let loadedUrl = primaryUrl;
    let usedFallback = false;
    try {
      const scene = await this.cloneImportedAsset(primaryUrl, linkName);
      wrapper.add(scene);
    } catch (error) {
      if (!fallbackPath) throw error;
      const fallbackUrl = `/robot_assets/${fallbackPath}`;
      const scene = await this.cloneImportedAsset(fallbackUrl, linkName);
      wrapper.add(scene);
      loadedUrl = fallbackUrl;
      usedFallback = true;
      this.log("warning", "Primary mesh load failed, used collision fallback", {
        linkName,
        primaryUrl,
        fallbackUrl,
        requested_scale: wrapper.scale.x,
        error: String(error),
      });
    }

    linkFrame.add(wrapper);
    linkFrame.updateMatrixWorld(true);
    const rescale = maybeAutoRescaleImportedWrapper(wrapper, linkName, this.log.bind(this));
    const payload = {
      linkName,
      origin: {
        x: Number(linkConfig.offset?.x || 0),
        y: Number(linkConfig.offset?.y || 0),
        z: Number(linkConfig.offset?.z || 0),
        roll: Number(linkConfig.offset?.roll || 0),
        pitch: Number(linkConfig.offset?.pitch || 0),
        yaw: Number(linkConfig.offset?.yaw || 0),
      },
      url: loadedUrl,
      source_model: meshFamilyFromPath(loadedUrl),
      render_mode: String(loadedUrl).toLowerCase().endsWith(".stl") ? "collision" : "visual",
      usedFallback,
      requested_scale: Number(inferImportedMeshScale(linkConfig.mesh_path, linkConfig.scale).toFixed(6)),
      applied_scale: Number((rescale.scale || wrapper.scale.x).toFixed(6)),
      size_m: Array.isArray(rescale.size)
        ? rescale.size.map((value) => Number(value.toFixed(5)))
        : null,
    };
    this.log("info", "Loaded link visual", payload);
  }

  async buildVisualModel(modelKey, modelConfig) {
    clearGroup(this.visualRoot);
    this.visualJointGroups = [];
    this.visualFlange = null;

    const root = new THREE.Group();
    this.visualRoot.add(root);

    const baseLink = new THREE.Group();
    root.add(baseLink);

    const baseInertia = new THREE.Group();
    baseInertia.rotation.z = Math.PI;
    baseLink.add(baseInertia);
    await this.addLinkVisual(baseInertia, modelConfig, "base");

    let parentLink = baseInertia;
    for (const item of JOINT_CHAIN) {
      const jointOrigin = new THREE.Group();
      const jointConfig = modelConfig?.joints?.[item.joint] || {};
      applyOrigin(jointOrigin, jointConfig);
      parentLink.add(jointOrigin);

      const jointRot = new THREE.Group();
      jointOrigin.add(jointRot);

      const linkFrame = new THREE.Group();
      jointRot.add(linkFrame);
      await this.addLinkVisual(linkFrame, modelConfig, item.link);

      this.visualJointGroups.push(jointRot);
      this.log("info", "Configured joint origin", {
        jointName: item.joint,
        origin: {
          x: Number(jointConfig.x || 0),
          y: Number(jointConfig.y || 0),
          z: Number(jointConfig.z || 0),
          roll: Number(jointConfig.roll || 0),
          pitch: Number(jointConfig.pitch || 0),
          yaw: Number(jointConfig.yaw || 0),
        },
      });
      parentLink = linkFrame;
    }

    const flange = new THREE.Group();
    flange.rotation.copy(FLANGE_RPY);
    parentLink.add(flange);
    this.visualFlange = flange;
  }

  async prepareVisualModel(modelKey) {
    const requestId = ++this.visualRequestId;
    this.visualLoading = true;
    this.visualReady = false;
    this.visualWarning = null;
    this.visualRoot.visible = false;
    this.proceduralGroup.visible = true;
    this.log("info", "Preparing mesh model", { modelKey });

    try {
      const configs = await this.ensureVisualConfigs();
      if (requestId !== this.visualRequestId) return;
      const modelConfig = configs?.[modelKey];
      if (!modelConfig) {
        this.visualWarning = "Mesh model not available for this robot. Using the procedural fallback.";
        this.visualLoading = false;
        this.log("warning", "No mesh preset for selected model", { modelKey });
        return;
      }

      await this.buildVisualModel(modelKey, modelConfig);
      if (requestId !== this.visualRequestId) return;
      const valid = this.validateVisualBounds(modelKey);
      this.visualReady = valid;
      this.visualLoading = false;
      this.visualWarning = valid ? null : "Mesh loaded but looked invalid on screen. Using the procedural fallback.";
      this.visualRoot.visible = valid;
      this.proceduralGroup.visible = !valid;
      if (valid) this.log("info", "Mesh model activated", { modelKey });
    } catch (error) {
      if (requestId !== this.visualRequestId) return;
      console.error(error);
      this.visualLoading = false;
      this.visualReady = false;
      this.visualRoot.visible = false;
      this.proceduralGroup.visible = true;
      this.visualWarning = "Mesh loading failed. Run tools/install_robot_assets.py --zip meshes.zip and refresh the browser. Using the procedural fallback.";
      this.log("error", "Mesh loading failed", {
        modelKey,
        error: String(error),
        hint: "Run tools/install_robot_assets.py --zip meshes.zip, then Ctrl+F5 in the browser.",
      });
    }
  }

  configureProceduralModel(modelKey) {
    const key = MODEL_SPECS[modelKey] ? modelKey : "ur5e";
    const spec = MODEL_SPECS[key];
    const reach = spec.reach;
    const baseRadius = Math.max(0.055, reach * 0.045);
    const baseHeight = Math.max(0.08, reach * 0.06);
    const linkRadius = Math.max(0.012, reach * 0.015);
    const jointRadius = Math.max(0.018, reach * 0.021);

    this.basePedestal.scale.set(baseRadius, baseHeight, baseRadius);
    this.basePedestal.position.set(0, 0, baseHeight * 0.5 - 0.003);
    this.baseAccent.scale.set(baseRadius * 0.92, baseHeight * 0.16, baseRadius * 0.92);
    this.baseAccent.position.set(0, 0, baseHeight - (baseHeight * 0.08));

    this.linkMeshes.forEach((mesh, index) => {
      mesh.userData.linkRadius = linkRadius * (index < 3 ? 1.18 : 0.78);
    });
    this.jointMeshes.forEach((mesh, index) => {
      const scale = index >= 4 ? 0.72 : 1.0;
      mesh.scale.set(jointRadius * scale, jointRadius * scale * (index >= 4 ? 0.85 : 1.0), jointRadius * scale);
    });
    this.jointCaps.forEach((mesh, index) => {
      const scale = index >= 4 ? 0.72 : 1.0;
      mesh.scale.setScalar(jointRadius * scale);
    });

    const ringPoints = [];
    for (let index = 0; index < 96; index += 1) {
      const theta = (index / 96) * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(Math.cos(theta) * WORKSPACE_RING_RADIUS, Math.sin(theta) * WORKSPACE_RING_RADIUS, 0.0));
    }
    this.workspaceRing.geometry.dispose();
    this.workspaceRing.geometry = new THREE.BufferGeometry().setFromPoints(ringPoints);
  }

  setModel(modelKey) {
    const key = normalizeModelKey(modelKey);
    this.modelKey = key;
    this.configureProceduralModel(key);
    this.setView("iso", false);
    this.log("info", "Switching robot model", { modelKey: key });
    void this.prepareVisualModel(key);
  }

  setView(name = "iso", updateTarget = true) {
    const spec = MODEL_SPECS[this.modelKey] || MODEL_SPECS.ur5e;
    const reach = spec.reach;
    const sceneReach = SCENE_REFERENCE_REACH;
    const target = new THREE.Vector3(0, 0, clamp(spec.dh[0].d + reach * 0.16, 0.14, 0.8));
    if (updateTarget) this.controls.target.copy(target);

    const viewMap = {
      iso: new THREE.Vector3(sceneReach * 1.05, -sceneReach * 1.25, sceneReach * 0.95),
      front: new THREE.Vector3(sceneReach * 1.55, 0.0, sceneReach * 0.85),
      side: new THREE.Vector3(0.0, -sceneReach * 1.65, sceneReach * 0.85),
      top: new THREE.Vector3(0.001, -sceneReach * 0.01, sceneReach * 2.05),
      reset: new THREE.Vector3(sceneReach * 1.15, -sceneReach * 1.35, sceneReach * 1.05),
    };
    const position = viewMap[name] || viewMap.iso;
    this.camera.position.copy(position);
    this.camera.lookAt(target);
    this.controls.update();
  }

  setFrozen(value) {
    this.freeze = Boolean(value);
  }

  setTrailVisible(value) {
    this.showTrail = Boolean(value);
    this.trailLine.visible = this.showTrail;
  }

  updateProceduralPose(actualQ) {
    const fk = forwardKinematics(this.modelKey, actualQ);
    fk.origins.forEach((origin, index) => {
      this.jointMeshes[index].position.copy(origin);
      this.jointCaps[index].position.copy(origin);
    });
    for (let index = 0; index < this.linkMeshes.length; index += 1) {
      setCylinderBetween(
        this.linkMeshes[index],
        fk.origins[index],
        fk.origins[index + 1],
        this.linkMeshes[index].userData.linkRadius || 0.02,
      );
    }
    this.jointMeshes.forEach((mesh) => { mesh.visible = true; });
    this.jointCaps.forEach((mesh) => { mesh.visible = true; });
    return {
      flange: fk.flange,
      flangeQuaternion: fk.flangeQuaternion,
      jointDeg: fk.q.map((value) => THREE.MathUtils.radToDeg(value)),
      mode: "fallback live",
      infoText: "Procedural fallback twin vs actual TCP",
    };
  }

  updateVisualPose(actualQ) {
    if (!this.visualReady || this.visualJointGroups.length !== 6 || !this.visualFlange) return null;
    for (let index = 0; index < this.visualJointGroups.length; index += 1) {
      this.visualJointGroups[index].rotation.z = Number(actualQ?.[index]) || 0;
    }
    this.scene.updateMatrixWorld(true);
    const flange = new THREE.Vector3();
    const flangeQuaternion = new THREE.Quaternion();
    this.visualFlange.getWorldPosition(flange);
    this.visualFlange.getWorldQuaternion(flangeQuaternion);
    return {
      flange,
      flangeQuaternion,
      jointDeg: actualQ.map((value) => THREE.MathUtils.radToDeg(Number(value) || 0)),
      mode: "mesh live",
      infoText: "Mesh twin from UR visual description assets",
    };
  }

  update(state) {
    if (!state) return this.lastSummary;

    const modelKey = normalizeModelKey(state?.status?.robot_model || state?.config?.robot_model || this.modelKey);
    if (modelKey !== this.modelKey) this.setModel(modelKey);

    if (this.freeze && this.lastSummary) return this.lastSummary;

    const latest = state.latest || {};
    const values = latest.values || {};
    const actualQ = Array.isArray(values.actual_q) ? values.actual_q : null;
    const actualTcp = Array.isArray(values.actual_TCP_pose) ? values.actual_TCP_pose : null;

    let modelPose = null;
    if (Array.isArray(actualQ) && actualQ.length >= 6) {
      const visualPose = this.updateVisualPose(actualQ);
      if (visualPose) {
        modelPose = visualPose;
        this.visualRoot.visible = true;
        this.proceduralGroup.visible = false;
        this.jointMeshes.forEach((mesh) => { mesh.visible = false; });
        this.jointCaps.forEach((mesh) => { mesh.visible = false; });
        this.linkMeshes.forEach((mesh) => { mesh.visible = false; });
      } else {
        modelPose = this.updateProceduralPose(actualQ);
        this.visualRoot.visible = false;
        this.proceduralGroup.visible = true;
      }
      this.modelTcpMarker.visible = true;
      this.modelTcpMarker.position.copy(modelPose.flange);
      this.modelTcpMarker.quaternion.copy(modelPose.flangeQuaternion);
    } else {
      this.modelTcpMarker.visible = false;
      this.linkMeshes.forEach((mesh) => { mesh.visible = false; });
      this.jointMeshes.forEach((mesh) => { mesh.visible = false; });
      this.jointCaps.forEach((mesh) => { mesh.visible = false; });
      if (this.visualReady) {
        this.visualRoot.visible = true;
        this.proceduralGroup.visible = false;
      }
    }

    let actualTcpVector = null;
    let actualTcpQuaternion = null;
    if (Array.isArray(actualTcp) && actualTcp.length >= 6) {
      actualTcpVector = new THREE.Vector3(actualTcp[0], actualTcp[1], actualTcp[2]);
      actualTcpQuaternion = rotvecToQuaternion(actualTcp.slice(3, 6));
      this.actualTcpMarker.visible = true;
      this.actualTcpMarker.position.copy(actualTcpVector);
      this.actualTcpMarker.quaternion.copy(actualTcpQuaternion);
    } else {
      this.actualTcpMarker.visible = false;
    }

    const trailPoints = this.showTrail ? buildTrailPoints(state.history) : [];
    if (trailPoints.length >= 2) {
      this.trailGeometry.dispose();
      this.trailGeometry = new THREE.BufferGeometry().setFromPoints(trailPoints);
      this.trailLine.geometry = this.trailGeometry;
      this.trailLine.visible = true;
    } else {
      this.trailLine.visible = false;
    }

    let statusLabel = "waiting for actual_q";
    if (modelPose) statusLabel = modelPose.mode;
    else if (this.visualLoading) statusLabel = "loading mesh";
    else if (this.visualReady) statusLabel = "mesh standby";

    const warning = state?.digital_twin?.warning || this.visualWarning || null;
    const summary = {
      modelLabel: ROBOT_MODEL_LABELS[this.modelKey] || this.modelKey.toUpperCase(),
      statusLabel,
      warning,
      jointDeg: modelPose?.jointDeg || null,
      fkPose: modelPose ? {
        positionMm: [modelPose.flange.x * 1000.0, modelPose.flange.y * 1000.0, modelPose.flange.z * 1000.0],
        rpyDeg: quaternionToRpyDeg(modelPose.flangeQuaternion),
      } : null,
      actualPose: actualTcpVector && actualTcpQuaternion ? {
        positionMm: [actualTcpVector.x * 1000.0, actualTcpVector.y * 1000.0, actualTcpVector.z * 1000.0],
        rpyDeg: quaternionToRpyDeg(actualTcpQuaternion),
      } : null,
      deltaMm: modelPose && actualTcpVector ? vectorDeltaMm(modelPose.flange, actualTcpVector) : null,
      deltaRotDeg: modelPose && actualTcpQuaternion ? orientationDeltaDeg(modelPose.flangeQuaternion, actualTcpQuaternion) : null,
      infoText: modelPose?.infoText || (this.visualLoading ? "Loading UR mesh assets" : "Add actual_q to ROBOT_FIELDS"),
      debugText: this.getDebugText(),
      formatPoseText(pose) {
        if (!pose) return "-";
        const xyz = formatTuple(pose.positionMm, 1);
        const rpy = formatTuple(pose.rpyDeg, 2);
        return `xyz mm ${xyz}\nrpy deg ${rpy}`;
      },
      formatJointText() {
        return this.jointDeg ? formatTuple(this.jointDeg, 2) : "-";
      },
    };

    this.lastSummary = summary;
    return summary;
  }

  resize() {
    const width = Math.max(this.container.clientWidth || 10, 10);
    const height = Math.max(this.container.clientHeight || 10, 10);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  animate() {
    window.requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
