import { setupScene } from './sceneSetup.js';
import { setupGUI } from './guiManager.js';
import { textureManager } from './textureManager.js';

// Inicializar escena y UI modular
const sceneData = setupScene();
const guiApi = setupGUI(sceneData);

// Expuesto para depuración manual (consola del navegador) y para los tests.
// Ej: matEditor.api.buildProjectState() / matEditor.api.loadProject(obj)
window.matEditor = { sceneData, api: guiApi, textureManager };
