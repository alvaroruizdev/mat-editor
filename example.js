<!doctype html>
<html lang="es">
<head>
    <link rel="icon" href="data:,">
    <meta charset="utf-8">
    <title>Editor de Materiales y Texturas - Three.js + lil-gui</title>
    <style>
      body { margin: 0; overflow: hidden; background-color: #111; }
      #canvas { display: block; }
    </style>
</head>
<body>
<canvas id="canvas"></canvas>

<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/",
    "lil-gui": "https://cdn.jsdelivr.net/npm/lil-gui@0.21.0/dist/lil-gui.esm.min.js"
  }
}
</script>

<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SpotLightHelper } from "three/addons/helpers/SpotLightHelper.js";
import { GUI } from 'lil-gui';

// --- 1. Renderizador y Escena ---
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// --- 2. Generadores de Texturas Procedurales ---
const textureSettings = {
  radial: {
    innerRadius: 50,
    outerRadius: 250,
    colorCenter: '#fefefe',
    colorMiddle: '#00eeff',
    colorOuter: '#da8aff'
  },
  gradient: {
    stop1Color: '#ae00ff',
    stop2Color: '#0755fe',
    stop3Color: '#ffffff'
  }
};

function createRadialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(256, 256, textureSettings.radial.innerRadius, 256, 256, textureSettings.radial.outerRadius);
  gradient.addColorStop(0.0, textureSettings.radial.colorCenter);
  gradient.addColorStop(0.9, textureSettings.radial.colorMiddle);
  gradient.addColorStop(1.0, textureSettings.radial.colorOuter);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGradientTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0.1, textureSettings.gradient.stop1Color);
  gradient.addColorStop(0.4, textureSettings.gradient.stop2Color);
  gradient.addColorStop(0.9, textureSettings.gradient.stop3Color);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 16, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Instancias iniciales de texturas
let radialTex = createRadialTexture();
let gradientTex = createGradientTexture();

// --- 3. Materiales ---
const materialConfig = {
  activeTexture: 'ninguna' // 'ninguna', 'radial', 'gradient'
};

const baseMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  transmission: 0.5,
  ior: 1.5,
  roughness: 0.2,
  metalness: 0.1,
  specularIntensity: 1.0,
  specularColor: new THREE.Color(0xffffff)
});

const iridMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  transmission: 0.2,
  ior: 1.5,
  roughness: 0.1,
  metalness: 0.0,
  iridescence: 0.8,
  iridescenceIOR: 1.6,
  specularIntensity: 1.0,
  specularColor: new THREE.Color(0xffffff)
});

const chosenMaterial = { type: 'base' }; // 'base' o 'iridiscente'

function updateMaterialTextures() {
  let activeTex = null;
  if (materialConfig.activeTexture === 'radial') activeTex = radialTex;
  if (materialConfig.activeTexture === 'gradient') activeTex = gradientTex;

  baseMaterial.map = activeTex;
  baseMaterial.needsUpdate = true;
  iridMat.map = activeTex;
  iridMat.needsUpdate = true;
}

// --- 4. Cargar Modelo 3D ---
const loader = new GLTFLoader();
let modelMesh;
loader.load('metaballs.glb', gltf => {
  modelMesh = gltf.scene;
  const box = new THREE.Box3().setFromObject(modelMesh);
  const center = new THREE.Vector3();
  box.getCenter(center);
  modelMesh.position.sub(center);
  scene.add(modelMesh);
  
  applyCurrentMaterial();
}, undefined, err => console.error("Error cargando GLB:", err));

function applyCurrentMaterial() {
  if (!modelMesh) return;
  const targetMat = chosenMaterial.type === 'base' ? baseMaterial : iridMat;
  modelMesh.traverse(c => {
    if (c.isMesh) c.material = targetMat;
  });
}

// --- 5. Luces ---
const lights = [];
const lightGroup = new THREE.Group();
scene.add(lightGroup);

function createSpotLight(idx) {
  const l = new THREE.SpotLight(0xffffff, 3, 15, Math.PI / 6, 0.5, 1);
  const positions = [{x: -4, z: 4}, {x: 4, z: 4}, {x: 4, z: -4}, {x: -4, z: -4}];
  const p = positions[idx % positions.length];
  l.position.set(p.x, 4, p.z);
  l.target.position.set(0, 0, 0);
  scene.add(l.target);
  lightGroup.add(l);

  const helper = new SpotLightHelper(l, 0xffffff);
  scene.add(helper);
  l.helper = helper;
  return l;
}

for (let i = 0; i < 4; i++) {
  lights.push(createSpotLight(i));
}

// --- 6. Interfaz GUI ---
const gui = new GUI();

// A. Configuración de Texturas Procedurales
const texFolder = gui.addFolder('Texturas Procedurales');

texFolder.add(materialConfig, 'activeTexture', ['ninguna', 'radial', 'gradient']).name('Asignar al Material').onChange(updateMaterialTextures);

const radialFolder = texFolder.addFolder('Radial Config');
radialFolder.add(textureSettings.radial, 'innerRadius', 0, 250).onChange(() => { radialTex = createRadialTexture(); updateMaterialTextures(); });
radialFolder.add(textureSettings.radial, 'outerRadius', 50, 500).onChange(() => { radialTex = createRadialTexture(); updateMaterialTextures(); });
radialFolder.addColor(textureSettings.radial, 'colorCenter').onChange(() => { radialTex = createRadialTexture(); updateMaterialTextures(); });
radialFolder.addColor(textureSettings.radial, 'colorMiddle').onChange(() => { radialTex = createRadialTexture(); updateMaterialTextures(); });
radialFolder.addColor(textureSettings.radial, 'colorOuter').onChange(() => { radialTex = createRadialTexture(); updateMaterialTextures(); });

const gradFolder = texFolder.addFolder('Gradient Config');
gradFolder.addColor(textureSettings.gradient, 'stop1Color').onChange(() => { gradientTex = createGradientTexture(); updateMaterialTextures(); });
gradFolder.addColor(textureSettings.gradient, 'stop2Color').onChange(() => { gradientTex = createGradientTexture(); updateMaterialTextures(); });
gradFolder.addColor(textureSettings.gradient, 'stop3Color').onChange(() => { gradientTex = createGradientTexture(); updateMaterialTextures(); });

// B. Selector de Material Activo
const matChoiceFolder = gui.addFolder('Selección de Material');
matChoiceFolder.add(chosenMaterial, 'type', ['base', 'iridiscente']).name('Modelo Activo').onChange(applyCurrentMaterial);

// C. Propiedades Material Base
const baseFolder = gui.addFolder('Base Material');
baseFolder.addColor(baseMaterial, 'color');
baseFolder.add(baseMaterial, 'transmission', 0, 1);
baseFolder.add(baseMaterial, 'ior', 1, 2.5);
baseFolder.add(baseMaterial, 'roughness', 0, 1);
baseFolder.add(baseMaterial, 'metalness', 0, 1);
baseFolder.add(baseMaterial, 'specularIntensity', 0, 1);
baseFolder.addColor(baseMaterial, 'specularColor');
baseFolder.close();

// D. Propiedades Material Iridiscente
const iridFolder = gui.addFolder('Iridiscente Material');
iridFolder.addColor(iridMat, 'color');
iridFolder.add(iridMat, 'iridescence', 0, 1).name('Iridiscencia');
iridFolder.add(iridMat, 'iridescenceIOR', 1, 3).name('Iridiscent IOR');
iridFolder.add(iridMat, 'transmission', 0, 1);
iridFolder.add(iridMat, 'roughness', 0, 1);
iridFolder.add(iridMat, 'specularIntensity', 0, 1);
iridFolder.addColor(iridMat, 'specularColor');
iridFolder.close();

// E. Luces
const lightFolder = gui.addFolder('Luces Spot');
lights.forEach((l, i) => {
  const lf = lightFolder.addFolder(`Luz ${i+1}`);
  lf.addColor(l, 'color');
  lf.add(l, 'intensity', 0, 10);
  lf.add(l.position, 'x', -10, 10);
  lf.add(l.position, 'y', -10, 10);
  lf.add(l.position, 'z', -10, 10);
  lf.close();
});

// --- 7. Bucle Principal ---
function animate() {
  requestAnimationFrame(animate);
  if (modelMesh) modelMesh.rotation.y += 0.003;
  lights.forEach(l => { if (l.helper) l.helper.update(); });
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
</script>
</body>
</html>