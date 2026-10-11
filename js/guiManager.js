import { GUI } from 'lil-gui';
import { textureManager } from './textureManager.js';

// Propiedades numéricas de material que guardamos / restauramos
const NUMERIC_MATERIAL_PROPS = [
  'transmission', 'roughness', 'metalness', 'ior',
  'iridescence', 'iridescenceIOR',
  'clearcoat', 'clearcoatRoughness', 'envMapIntensity',
  'thickness', 'specularIntensity'
];
const COLOR_MATERIAL_PROPS = ['color', 'specularColor'];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function setupGUI(sceneData) {
  const gui = new GUI();
  const { materialConfigs, chosen, applySelectedMaterial, lightGlobalSettings, updateLightPositions, updateLightProperties, adjustLights } = sceneData;
  const getTex = id => textureManager.getTexture(id);

  // --- Aplicación de texturas a materiales (reutilizable) ---
  function applyTextureToMaterial(key) {
    const { material, config } = materialConfigs[key];
    const tex = getTex(config.texture);

    if (key === 'iridiscente' && config.useAsThicknessMap) {
      material.iridescenceThicknessMap = tex;
      material.map = null;
    } else {
      material.map = tex;
      if (key === 'iridiscente') material.iridescenceThicknessMap = null;
    }
    material.needsUpdate = true;
  }

  function applyAllMaterialTextures() {
    applyTextureToMaterial('base');
    applyTextureToMaterial('iridiscente');
  }

  // --- 0. Estado del proyecto ---
  function buildProjectState() {
    return {
      version: 1,
      textures: textureManager.exportState(),
      materials: {
        base: {
          config: { ...materialConfigs.base.config },
          properties: getMaterialValues(materialConfigs.base.material)
        },
        iridiscente: {
          config: { ...materialConfigs.iridiscente.config },
          properties: getMaterialValues(materialConfigs.iridiscente.material)
        }
      },
      lights: { ...lightGlobalSettings },
      chosenMaterial: chosen.material
    };
  }

  // --- 1. Guardar y Cargar Proyecto (JSON) ---
  const projectFolder = gui.addFolder('Proyecto (JSON)');

  const projectActions = {
    exportJSON: () => {
      const blob = new Blob([JSON.stringify(buildProjectState(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'material-editor-project.json';
      a.click();
      URL.revokeObjectURL(url);
    },
    importJSON: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = event => {
          try {
            loadProject(JSON.parse(event.target.result));
          } catch (err) {
            console.error("Error al importar JSON:", err);
            alert("El archivo JSON no es válido.");
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }
  };

  projectFolder.add(projectActions, 'exportJSON').name('Exportar JSON');
  projectFolder.add(projectActions, 'importJSON').name('Importar JSON');
  projectFolder.open();

  // --- 2. Iluminación Global ---
  const lightsFolder = gui.addFolder('Iluminación');
  lightsFolder.add(lightGlobalSettings, 'gizmosVisible').name('Mostrar Gizmos').onChange(val => {
    sceneData.lights.forEach(l => { if (l.helper) l.helper.visible = val; });
  });
  lightsFolder.add(lightGlobalSettings, 'count', 1, 8, 1).name('Cantidad de luces').onChange(v => adjustLights(v, getTex));
  lightsFolder.addColor(lightGlobalSettings, 'color').name('Color Luces').onChange(() => updateLightProperties(getTex));
  lightsFolder.add(lightGlobalSettings, 'intensity', 0, 15).name('Intensidad').onChange(() => updateLightProperties(getTex));
  lightsFolder.add(lightGlobalSettings, 'angle', 0.1, Math.PI / 3).name('Ángulo Apertura').onChange(() => updateLightProperties(getTex));
  lightsFolder.add(lightGlobalSettings, 'distance', 1, 10).name('Distancia al Centro').onChange(updateLightPositions);
  lightsFolder.add(lightGlobalSettings, 'height', 0, 10, 0.1).name('Altura (Y)').onChange(updateLightPositions);

  const lightTexController = lightsFolder.add(lightGlobalSettings, 'textureId', textureManager.getTextureIds()).name('Textura Emisión').onChange(() => updateLightProperties(getTex));
  lightsFolder.close();

  // --- 3. Texturas Manager ---
  const texFolder = gui.addFolder('Texturas');

  const texCreator = {
    addRadial: () => {
      const id = textureManager.createTexture('radial');
      buildTextureConfigFolder(id);
      refreshAllDropdowns();
    },
    addGradiente: () => {
      const id = textureManager.createTexture('gradiente');
      buildTextureConfigFolder(id);
      refreshAllDropdowns();
    }
  };

  texFolder.add(texCreator, 'addRadial').name('+ Añadir Radial');
  texFolder.add(texCreator, 'addGradiente').name('+ Añadir Gradiente');
  texFolder.open();

  const textureSubFolders = new Map();

  function buildTextureConfigFolder(id) {
    const texData = textureManager.textures.get(id);
    if (!texData) return;

    const subFolder = texFolder.addFolder(id);
    textureSubFolders.set(id, subFolder);

    if (texData.type === 'radial') {
      subFolder.add(texData.settings, 'innerRadius', 0, 200).name('Radio Interno').onChange(() => textureManager.redrawTexture(id));
      subFolder.add(texData.settings, 'outerRadius', 50, 400).name('Radio Externo').onChange(() => textureManager.redrawTexture(id));
      subFolder.addColor(texData.settings, 'colorCenter').name('Color Centro').onChange(() => textureManager.redrawTexture(id));
      subFolder.addColor(texData.settings, 'colorMiddle').name('Color Medio').onChange(() => textureManager.redrawTexture(id));
      subFolder.addColor(texData.settings, 'colorOuter').name('Color Borde').onChange(() => textureManager.redrawTexture(id));
    } else {
      subFolder.addColor(texData.settings, 'stop1Color').name('Color 1').onChange(() => textureManager.redrawTexture(id));
      subFolder.addColor(texData.settings, 'stop2Color').name('Color 2').onChange(() => textureManager.redrawTexture(id));
      subFolder.addColor(texData.settings, 'stop3Color').name('Color 3').onChange(() => textureManager.redrawTexture(id));
    }

    subFolder.add({
      delete: () => {
        textureManager.deleteTexture(id);
        subFolder.destroy();
        textureSubFolders.delete(id);
        refreshAllDropdowns();
      }
    }, 'delete').name('🗑️ Borrar Textura');

    subFolder.close();
    return subFolder;
  }

  // Reconstruye todas las carpetas de texturas (usado tras importar)
  function rebuildTextureFolders() {
    textureSubFolders.forEach(f => f.destroy());
    textureSubFolders.clear();
    textureManager.textures.forEach((_tex, id) => buildTextureConfigFolder(id));
  }

  // --- 4. Materiales ---
  const matChoiceFolder = gui.addFolder('MATERIAL ELEGIDO');
  matChoiceFolder.add(chosen, 'material', ['base', 'iridiscente']).onChange(() => applySelectedMaterial());
  matChoiceFolder.open();

  // Controladores de textura de materiales para actualizar opciones dinámicamente
  const materialTextureControllers = [];

  // Base Material
  const matFolder = gui.addFolder('Base Material');
  matFolder.addColor(materialConfigs.base.material, 'color');
  const baseTexCtrl = matFolder.add(materialConfigs.base.config, 'texture', textureManager.getTextureIds()).name('Textura').onChange(() => applyTextureToMaterial('base'));
  materialTextureControllers.push(baseTexCtrl);

  matFolder.add(materialConfigs.base.material, 'transmission', 0, 1);
  matFolder.add(materialConfigs.base.material, 'ior', 1, 3);
  matFolder.add(materialConfigs.base.material, 'roughness', 0, 1);
  matFolder.add(materialConfigs.base.material, 'metalness', 0, 1);
  matFolder.close();

  // Iridiscente Material
  const iridFolder = gui.addFolder('Iridiscente Mat');
  iridFolder.addColor(materialConfigs.iridiscente.material, 'color');
  const iridTexCtrl = iridFolder.add(materialConfigs.iridiscente.config, 'texture', textureManager.getTextureIds()).name('Textura').onChange(() => applyTextureToMaterial('iridiscente'));
  materialTextureControllers.push(iridTexCtrl);

  iridFolder.add(materialConfigs.iridiscente.config, 'useAsThicknessMap', false).name('Usar como Mapa Grosor').onChange(() => applyTextureToMaterial('iridiscente'));

  iridFolder.add(materialConfigs.iridiscente.material, 'iridescence', 0, 1).name('Iridiscencia');
  iridFolder.add(materialConfigs.iridiscente.material, 'iridescenceIOR', 1, 3).name('Iridiscent IOR');

  const thicknessControl = { min: 100, max: 900 };
  iridFolder.add(thicknessControl, 'min', 0, 1000).name('Grosor Min (nm)').onChange(v => {
    materialConfigs.iridiscente.material.iridescenceThicknessRange = [v, thicknessControl.max];
    materialConfigs.iridiscente.material.needsUpdate = true;
  });
  iridFolder.add(thicknessControl, 'max', 100, 2000).name('Grosor Max (nm)').onChange(v => {
    materialConfigs.iridiscente.material.iridescenceThicknessRange = [thicknessControl.min, v];
    materialConfigs.iridiscente.material.needsUpdate = true;
  });

  iridFolder.add(materialConfigs.iridiscente.material, 'transmission', 0, 1);
  iridFolder.add(materialConfigs.iridiscente.material, 'thickness', 0, 5).name('Volumen Thickness');
  iridFolder.add(materialConfigs.iridiscente.material, 'roughness', 0, 1);
  iridFolder.add(materialConfigs.iridiscente.material, 'metalness', 0, 1);
  iridFolder.add(materialConfigs.iridiscente.material, 'clearcoat', 0, 1).name('Clearcoat');
  iridFolder.add(materialConfigs.iridiscente.material, 'clearcoatRoughness', 0, 1);
  iridFolder.add(materialConfigs.iridiscente.material, 'envMapIntensity', 0, 5);
  iridFolder.open();

  // --- Sincronizador global de desplegables de texturas ---
  function refreshAllDropdowns() {
    const ids = textureManager.getTextureIds();

    // Actualizar selectores de texturas en materiales y luces
    materialTextureControllers.forEach(ctrl => ctrl.options(ids));
    lightTexController.options(ids);

    // Validar si las texturas seleccionadas actualmente siguen existiendo
    let materialChanged = false;
    if (!ids.includes(materialConfigs.base.config.texture)) { materialConfigs.base.config.texture = 'ninguna'; materialChanged = true; }
    if (!ids.includes(materialConfigs.iridiscente.config.texture)) { materialConfigs.iridiscente.config.texture = 'ninguna'; materialChanged = true; }
    if (materialChanged) applyAllMaterialTextures();

    if (!ids.includes(lightGlobalSettings.textureId)) {
      lightGlobalSettings.textureId = 'ninguna';
      updateLightProperties(getTex);
    }

    gui.controllersRecursive().forEach(c => c.updateDisplay());
  }

  // --- Carga de proyecto (import) ---
  function loadProject(data) {
    if (!data || typeof data !== 'object') throw new Error('JSON vacío o inválido');

    // 1) Texturas (reemplaza las actuales)
    if (data.textures) textureManager.importState(data.textures);
    rebuildTextureFolders();

    // 2) Materiales: configuración (textura / uso como mapa de grosor) + propiedades
    ['base', 'iridiscente'].forEach(key => {
      const saved = data.materials && data.materials[key];
      if (!saved) return;
      if (saved.config) Object.assign(materialConfigs[key].config, saved.config);
      if (saved.properties) setMaterialValues(materialConfigs[key].material, saved.properties);
    });

    // Sincronizar los controles de grosor (nm) con el material iridiscente
    const range = materialConfigs.iridiscente.material.iridescenceThicknessRange;
    if (Array.isArray(range)) {
      thicknessControl.min = range[0];
      thicknessControl.max = range[1];
    }

    // 3) Re-vincular las texturas a los materiales (el punto clave del bug)
    applyAllMaterialTextures();

    // 4) Luces: aplicar de verdad a la escena
    if (data.lights) Object.assign(lightGlobalSettings, data.lights);
    lightGlobalSettings.count = clamp(Math.round(lightGlobalSettings.count ?? 4), 1, 8);
    lightGlobalSettings.height = clamp(lightGlobalSettings.height ?? 3, 0, 10);
    adjustLights(lightGlobalSettings.count, getTex);
    updateLightPositions();
    updateLightProperties(getTex);
    sceneData.lights.forEach(l => { if (l.helper) l.helper.visible = lightGlobalSettings.gizmosVisible; });

    // 5) Material elegido
    if (data.chosenMaterial) chosen.material = data.chosenMaterial;
    applySelectedMaterial();

    refreshAllDropdowns();
    gui.controllersRecursive().forEach(c => c.updateDisplay());
  }

  textureManager.onTexturesChanged = () => {
    refreshAllDropdowns();
  };

  // Crear un par de texturas por defecto para empezar con contenido rico
  const defRadial = textureManager.createTexture('radial');
  const defGrad = textureManager.createTexture('gradiente');
  buildTextureConfigFolder(defRadial);
  buildTextureConfigFolder(defGrad);

  // Asignar radial por defecto al iridiscente
  materialConfigs.iridiscente.config.texture = defRadial;
  materialConfigs.iridiscente.material.map = textureManager.getTexture(defRadial);
  materialConfigs.iridiscente.material.needsUpdate = true;

  lightGlobalSettings.textureId = defGrad;

  adjustLights(lightGlobalSettings.count, getTex);
  updateLightPositions();
  updateLightProperties(getTex);

  refreshAllDropdowns();

  // API expuesta (útil para tests y depuración desde consola)
  return {
    gui,
    buildProjectState,
    loadProject,
    projectActions,
    refreshAllDropdowns,
    applyTextureToMaterial,
    applyAllMaterialTextures,
    materialTextureControllers,
    lightTexController,
    thicknessControl
  };
}

function getMaterialValues(mat) {
  const values = {};
  NUMERIC_MATERIAL_PROPS.forEach(k => {
    if (typeof mat[k] === 'number') values[k] = mat[k];
  });
  COLOR_MATERIAL_PROPS.forEach(k => {
    if (mat[k] && mat[k].isColor) values[k] = '#' + mat[k].getHexString();
  });
  if (Array.isArray(mat.iridescenceThicknessRange)) {
    values.iridescenceThicknessRange = [...mat.iridescenceThicknessRange];
  }
  return values;
}

function setMaterialValues(mat, values) {
  NUMERIC_MATERIAL_PROPS.forEach(k => {
    if (typeof values[k] === 'number' && typeof mat[k] === 'number') mat[k] = values[k];
  });
  COLOR_MATERIAL_PROPS.forEach(k => {
    if (values[k] && mat[k] && mat[k].isColor) mat[k].set(values[k]);
  });
  if (Array.isArray(values.iridescenceThicknessRange)) {
    mat.iridescenceThicknessRange = [...values.iridescenceThicknessRange];
  }
  mat.needsUpdate = true;
}
