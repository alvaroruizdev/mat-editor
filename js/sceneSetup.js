import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function setupScene() {
  const canvas = document.getElementById('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5; // Mayor exposición general

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  // Luz ambiental para dar un mínimo de visibilidad base
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 5);
  scene.add(camera);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // --- Materiales por defecto ---
  const material = new THREE.MeshPhysicalMaterial({
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
    thickness: 1.0,
    ior: 1.5,
    roughness: 0.1,
    metalness: 0.0,
    iridescence: 1.0,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [100, 900],
    clearcoat: 0.3,
    clearcoatRoughness: 0.05,
    envMapIntensity: 2.0,
    specularIntensity: 1.0,
    specularColor: new THREE.Color(0xffffff)
  });

  const materialConfigs = {
    base: { material, config: { texture: 'ninguna', useAsThicknessMap: false } },
    iridiscente: { material: iridMat, config: { texture: 'ninguna', useAsThicknessMap: false } }
  };

  const chosen = { material: 'iridiscente' };

  // --- Cargar Modelo ---
  let modelMesh = null;
  const loader = new GLTFLoader();
  loader.load('metaballs.glb', gltf => {
    modelMesh = gltf.scene;
    const box = new THREE.Box3().setFromObject(modelMesh);
    const center = new THREE.Vector3();
    box.getCenter(center);
    modelMesh.position.sub(center);
    scene.add(modelMesh);
    applySelectedMaterial();
  }, undefined, err => console.error("Error cargando GLB:", err));

  function applySelectedMaterial() {
    if (!modelMesh) return;
    const activeMat = chosen.material === 'base' ? material : iridMat;
    modelMesh.traverse(c => {
      if (c.isMesh) c.material = activeMat;
    });
  }

  // --- Luces Globales ---
  const lights = [];
  const lightGroup = new THREE.Group();
  scene.add(lightGroup);

  const lightGlobalSettings = {
    gizmosVisible: true,
    count: 4,
    color: '#ffffff',
    intensity: 5,
    angle: Math.PI / 4, // Ligeramente más abierto para abarcar mejor el objeto
    distance: 4,
    height: 3, // Altura (Y) de todas las luces
    textureId: 'ninguna'
  };

  const basePositions = [
    {x: -1, z: 1}, {x: 1, z: 1}, {x: 1, z: -1}, {x: -1, z: -1}
  ];

  function updateLightPositions() {
    lights.forEach((l, idx) => {
      const dir = basePositions[idx % basePositions.length];
      const len = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
      l.position.set((dir.x / len) * lightGlobalSettings.distance, lightGlobalSettings.height, (dir.z / len) * lightGlobalSettings.distance);
      l.updateMatrixWorld();
      if (l.helper) l.helper.update();
    });
  }

  function updateLightProperties(getTextureFn) {
    lights.forEach(l => {
      l.color.set(lightGlobalSettings.color);
      l.intensity = lightGlobalSettings.intensity;
      l.angle = lightGlobalSettings.angle;
      l.map = getTextureFn(lightGlobalSettings.textureId);
      if (l.map) l.map.needsUpdate = true;
      l.needsUpdate = true;
      if (l.helper) l.helper.update();
    });
  }

  function createSpotLight(idx, getTextureFn) {
    const l = new THREE.SpotLight(lightGlobalSettings.color, lightGlobalSettings.intensity, 25, lightGlobalSettings.angle, 0.4, 1);
    l.map = getTextureFn(lightGlobalSettings.textureId);

    const dir = basePositions[idx % basePositions.length];
    const len = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
    l.position.set((dir.x / len) * lightGlobalSettings.distance, lightGlobalSettings.height, (dir.z / len) * lightGlobalSettings.distance);
    
    // Configurar target al centro de la escena
    l.target.position.set(0, 0, 0);
    scene.add(l.target);
    lightGroup.add(l);
    l.updateMatrixWorld();

    // Crear y añadir el helper asegurando visibilidad
    const helper = new THREE.SpotLightHelper(l, 0xffffff);
    helper.visible = lightGlobalSettings.gizmosVisible;
    scene.add(helper);
    l.helper = helper;

    return l;
  }

  function adjustLights(count, getTextureFn) {
    while (lights.length > count) {
      const l = lights.pop();
      lightGroup.remove(l);
      if (l.target) scene.remove(l.target);
      if (l.helper) { scene.remove(l.helper); l.helper.dispose(); }
    }
    while (lights.length < count) {
      lights.push(createSpotLight(lights.length, getTextureFn));
    }
  }

  // --- Loop de Animación ---
  function animate() {
    requestAnimationFrame(animate);
    if (modelMesh) modelMesh.rotation.y += 0.005;
    
    // Actualizar helpers en cada frame obligatoriamente
    lights.forEach(l => { 
      if (l.helper && typeof l.helper.update === 'function') {
        l.helper.update(); 
      }
    });

    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  return {
    scene, camera, renderer, materialConfigs, chosen, applySelectedMaterial,
    lights, lightGlobalSettings, updateLightPositions, updateLightProperties, adjustLights
  };
}