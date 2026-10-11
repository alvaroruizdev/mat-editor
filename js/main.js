import { setupScene } from './sceneSetup.js';
import { setupGUI } from './guiManager.js';

// Inicializar escena y UI modular
const sceneData = setupScene();
setupGUI(sceneData);