import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';


// -------------------------------------------------------------
// CONFIGURACIÓN GLOBAL
// -------------------------------------------------------------
const CONFIG = {
  radius: 0.5,
  hoverStrength: 0.2, // Fuerza de deformación al pasar el cursor
  clickStrength: 0.4,  // Fuerza de deformación al hacer clic

  deformOnClick: true,
  addSpotHelper: false
};

const scene = new THREE.Scene();
scene.background = new THREE.Color('grey');

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// const light = new THREE.DirectionalLight(0xffffff, 1);
// light.position.set(1, 1, 1).normalize();
// scene.add(light);
// scene.add(new THREE.AmbientLight(0x444444));

const pmremGenerator = new THREE.PMREMGenerator(renderer);
// scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

function showTextureInspector(texture) {
  // Aplicar estilos para que floté en la esquina superior derecha
  const canvas = texture.image;
  canvas.style.position = 'fixed';
  canvas.style.top = '10px';
  canvas.style.right = '10px';
  canvas.style.width = '160px';
  canvas.style.height = '160px';
  canvas.style.border = '2px solid #ffffff';
  canvas.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
  canvas.style.zIndex = '10000';
  canvas.style.borderRadius = '8px';

  document.body.appendChild(canvas);
}

function createRadialGradientTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // createRadialGradient(x0, y0, r0, x1, y1, r1)
  const gradient = ctx.createRadialGradient(256, 256, 50, 256, 256, 250);
  gradient.addColorStop(0.0, '#fefefe'); // Centro 
  gradient.addColorStop(0.9, '#00eeff'); // Medio 
  gradient.addColorStop(1.0, '#da8affa2'); // Borde

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGradientTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256; // Mayor altura para un degradado suave vertical

  const ctx = canvas.getContext('2d');
  
  // Crear degradado de arriba a abajo (x1, y1, x2, y2)
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
                  // offset percent, color
  gradient.addColorStop(0.1, '#ae00ff');
  gradient.addColorStop(0.2, '#0755fe');
  gradient.addColorStop(0.9, '#ffffff');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 16, 256); // textura de 16*256
  document.body.appendChild(canvas);
  // Crear la textura de Three.js a partir del Canvas
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; // Garantiza colores correctos
  return texture;
}

const matcapMaterial = new THREE.MeshMatcapMaterial({
  matcap: createRadialGradientTexture() // Tu CanvasTexture con el degradado radial
});

const glassColor = 0xb0ddff;
const glassMaterial = new THREE.MeshPhysicalMaterial({
  map: createRadialGradientTexture(),      // <--- Se asigna el degradado aquí
  color: 0xffffff,           // Blanco neutro para no teñir la textura
//   color: glassColor,
  transmission: 0.9,         // Alto nivel de transmisión de luz (efecto cristal)
  opacity: 1,                // Mantiene el cuerpo visible
  transparent: true,         // Permite la renderización de transparencias
  roughness: 0.1,            // Superficie pulida (0 = espejo/cristal puro, 1 = mate)
  metalness: 0.0,
  ior: 1.1,                  // Índice de Refracción (1.5 es el valor estándar del vidrio)
  thickness: 1.2,            // Grosor del objeto para calcular la refracción interior
  specularIntensity: 1.0,    // Intensidad de los reflejos especulares
  clearcoat: 1.0,            // Capa de barniz exterior (da brillo extra)
  clearcoatRoughness: 0.1
});

// NUEVO MAT
// 1. Generar la textura plana iridiscente en Canvas 2D
function generarTexturaCristalIridiscente(width = 512, height = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Fondo transparente con leve tinte violáceo
  ctx.clearRect(0, 0, width, height);

  // Gradient radial imitando dispersión cromática (Azul -> Violeta -> Magenta)
  const grad = ctx.createRadialGradient(
    width * 0.5, height * 0.5, width * 0.1,
    width * 0.5, height * 0.5, width * 0.5
  );
  
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0)');     // Centro transparente
  grad.addColorStop(0.4, 'rgba(120, 0, 255, 0.15)');   // Violeta suave
  grad.addColorStop(0.7, 'rgba(0, 80, 255, 0.6)');     // Azul eléctrico
  grad.addColorStop(0.9, 'rgba(255, 0, 180, 0.8)');    // Magenta intenso
  grad.addColorStop(1.0, 'rgba(10, 0, 80, 0.95)');     // Borde oscuro profundo

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;



  return texture;
}

// 2. Configurar el Material para conseguir el acabado exacto de la imagen
const iridescentTexture = generarTexturaCristalIridiscente();
// const color = #;
const iridiscentMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,                 // Base limpia
  transmission: 0.7,              // Translucidez muy alta
  transparent: true,
  opacity: 1,
  roughness: 0.25,                 // Cristal altamente pulido
  ior: 1.2,                       // Índice de refracción de vidrio
  thickness: 1.5,                  // Simula el grosor de los bordes refractivos
  // Asignar el degradado al iridescenceMap o iridescence
  iridescence: 1.4,                  // Habilita el efecto de interferencia de capa fina
  iridescenceIOR: 1.5,             // Grosor cromático
  // iridescenceMap: 
  // iridescenceMap: iridescentTexture, // Controla qué áreas reflejan los tonos morados/azules
  
  // Destellos especulares
  specularIntensity: 10,
  specularColor: new THREE.Color(0x3333ff), // Reflejos violeta en los picos de luz
  clearcoat: 1,
  clearcoatRoughness: 0.02
});


function setMat(mesh) {
  mesh.material = iridiscentMaterial;
  // mesh.material = matcapMaterial;
}

function addSpotLight(x, y, z, addHelper = false) {
    // 1. Generar la textura de color iridiscente/cromático (512x512)
  // const lightTexture = generarTexturaCristalIridiscente(512, 512);
  const lightTexture = createGradientTexture();
    showTextureInspector(lightTexture);

  // 2. Crear la SpotLight con la textura asignada
  const spotLight = new THREE.SpotLight(0xffffff, 80); // Color blanco neutro e intensidad alta
  spotLight.position.set(x, y, z);
  spotLight.angle = Math.PI / 6;        // Apertura del cono de luz
  spotLight.penumbra = 1;             // Bordes suaves en la proyección
  spotLight.decay = 1;                  // Atenuación física de la luz
  spotLight.distance = 20;

  // ASIGNAR EL MAPA DE PROYECCIÓN
  spotLight.map = lightTexture;         // La luz proyectará la imagen de color

  // Apuntar la luz al centro de la escena (donde está tu malla)
  spotLight.target.position.set(0, 0, 0);
  scene.add(spotLight);
  scene.add(spotLight.target);

  // 3. (Opcional) Helper para ver hacia dónde apunta la luz proyectada
  if (CONFIG.addSpotHelper) {
  const spotLightHelper = new THREE.SpotLightHelper(spotLight);
  scene.add(spotLightHelper);
  }


  return spotLight;
}

let spot1 = addSpotLight(0, 1, 5);
let spot2 = addSpotLight(0, 1, -5);
let spot3 = addSpotLight(4, 0, 0);
let spot4 = addSpotLight(-4, 0, 0);
// let spot5 = addSpotLight(0, -4, 0);

const spotPivot = new THREE.Object3D();
scene.add(spotPivot);
spotPivot.add(spot2); // spot2 ahora es hijo del pivote
spotPivot.add(spot2);

const loader = new GLTFLoader();
const mojon = await loader.loadAsync('./vidrio.glb');

// APlicar mat a primer mesh
let geometry;
let mesh;

mojon.scene.traverse((child) => {
  if (child.isMesh) {
    mesh = child;
    geometry = mesh.geometry;

    setMat(mesh);
    return;
  }
});

// const sphere = new THREE.SphereGeometry(2, 64, 64);
// const mesh = new THREE.Mesh(sphere, glassMaterial);

scene.add(mesh);


const box = new THREE.BoxGeometry(1);
const material = new THREE.MeshPhongMaterial({ 
  color: 0xff0000, 
});
const boxMesh = new THREE.Mesh(box, material);
boxMesh.position.set(1, 1, -3);
scene.add(boxMesh);


// 2. ESTRUCTURA DE MEMORIA: Copia Base para cambios permanentes
const positionAttribute = geometry.attributes.position;
const basePositions = positionAttribute.array.slice(); // Estado con clics guardados

// 3. Variables de Raycaster
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoverIntersectPoint = null;

// -------------------------------------------------------------
// EVENTOS Y LÓGICA DE DEFORMACIÓN
// -------------------------------------------------------------

// Modifica permanentemente 'basePositions' al hacer clic
function applyPermanentDeformation(intersectPoint) {
  const vertex = new THREE.Vector3();

  for (let i = 0; i < positionAttribute.count; i++) {
    const idx = i * 3;
    vertex.set(basePositions[idx], basePositions[idx + 1], basePositions[idx + 2]);

    const globalVertex = vertex.clone().applyMatrix4(mesh.matrixWorld);
    const distance = globalVertex.distanceTo(intersectPoint);

    if (distance < CONFIG.radius) {
      const falloff = 1 - distance / CONFIG.radius;
      const direction = vertex.clone().normalize();
      vertex.addScaledVector(direction, -CONFIG.clickStrength * falloff);

      // Guardar cambio de forma PERMANENTE
      basePositions[idx] = vertex.x;
      basePositions[idx + 1] = vertex.y;
      basePositions[idx + 2] = vertex.z;
    }
  }
}

// Escuchar movimiento del cursor
window.addEventListener('pointermove', (event) => {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObject(mesh);

  hoverIntersectPoint = intersects.length > 0 ? intersects[0].point.clone() : null;
});

// Escuchar clics para fijar deformaciones
window.addEventListener('click', () => {
  if (hoverIntersectPoint && CONFIG.deformOnClick) {
    applyPermanentDeformation(hoverIntersectPoint);
  }
});

// Actualiza el buffer visible en cada fotograma
function updateDeformation() {
  const currentArray = positionAttribute.array;
  const vertex = new THREE.Vector3();

  for (let i = 0; i < positionAttribute.count; i++) {
    const idx = i * 3;
    
    // a) Partir siempre del estado BASE (que incluye clics pasados)
    vertex.set(basePositions[idx], basePositions[idx + 1], basePositions[idx + 2]);

    // b) Añadir deformación TEMPORAL de hover sobre la base
    if (hoverIntersectPoint) {
      const globalVertex = vertex.clone().applyMatrix4(mesh.matrixWorld);
      const distance = globalVertex.distanceTo(hoverIntersectPoint);

      if (distance < CONFIG.radius) {
        const falloff = 1 - distance / CONFIG.radius;
        const direction = vertex.clone().normalize();
        vertex.addScaledVector(direction, -CONFIG.hoverStrength * falloff);
      }
    }

    // c) Escribir en el buffer que renderiza Three.js
    currentArray[idx] = vertex.x;
    currentArray[idx + 1] = vertex.y;
    currentArray[idx + 2] = vertex.z;
  }

  positionAttribute.needsUpdate = true;
  geometry.computeVertexNormals();
}

// -------------------------------------------------------------
// BUCLE DE ANIMACIÓN
// -------------------------------------------------------------
const timer = new THREE.Clock();
 controls.autoRotate = true;

function animate() {
  requestAnimationFrame(animate);
  const delta = timer.getDelta(); 
    // mesh.rotation.y += 0.5 * delta; // Ajusta la velocidad aquí
    // spotPivot.rotation.y += 0.5 * delta; // Ajusta la velocidad aquí
    scene.rotation.y *= 0.5 * delta;
  updateDeformation();
  controls.update();
  renderer.render(scene, camera);
}

animate();