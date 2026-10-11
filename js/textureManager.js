import * as THREE from "three";

class TextureManager {
  constructor() {
    this.textures = new Map(); // id -> { name, type, settings, canvas, texture }
    this.counters = { radial: 0, gradiente: 0 };
    this.inspectorContainer = document.getElementById('texture-inspector-container');
    
    // Callback para notificar a la GUI cuando cambian las texturas
    this.onTexturesChanged = null;
  }

  createTexture(type = 'radial', customSettings = null) {
    this.counters[type]++;
    const id = `${type}${this.counters[type]}`;

    let settings;
    if (customSettings) {
      settings = JSON.parse(JSON.stringify(customSettings));
    } else if (type === 'radial') {
      settings = {
        innerRadius: 10,
        outerRadius: 200,
        colorCenter: '#ffffff',
        colorMiddle: '#00eeff',
        colorOuter: '#da8aff'
      };
    } else {
      settings = {
        stop1Color: '#ae00ff',
        stop2Color: '#0755fe',
        stop3Color: '#ffffff'
      };
    }

    const canvas = document.createElement('canvas');
    canvas.width = type === 'radial' ? 512 : 16;
    canvas.height = type === 'radial' ? 512 : 256;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (type === 'gradiente') {
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
    }

    const texData = { id, type, settings, canvas, texture };
    this.textures.set(id, texData);

    this.redrawTexture(id);

    if (this.onTexturesChanged) this.onTexturesChanged();
    return id;
  }

  redrawTexture(id) {
    const texData = this.textures.get(id);
    if (!texData) return;

    const ctx = texData.canvas.getContext('2d');
    ctx.clearRect(0, 0, texData.canvas.width, texData.canvas.height);

    if (texData.type === 'radial') {
      const grad = ctx.createRadialGradient(256, 256, texData.settings.innerRadius, 256, 256, texData.settings.outerRadius);
      grad.addColorStop(0.0, texData.settings.colorCenter);
      grad.addColorStop(0.5, texData.settings.colorMiddle);
      grad.addColorStop(1.0, texData.settings.colorOuter);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0.0, texData.settings.stop1Color);
      grad.addColorStop(0.5, texData.settings.stop2Color);
      grad.addColorStop(1.0, texData.settings.stop3Color);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 16, 256);
    }

    texData.texture.needsUpdate = true;
    this.updateInspector();
  }

  deleteTexture(id) {
    const texData = this.textures.get(id);
    if (!texData) return;

    texData.texture.dispose();
    this.textures.delete(id);

    if (this.onTexturesChanged) this.onTexturesChanged(id);
    this.updateInspector();
  }

  getTexture(id) {
    return this.textures.get(id)?.texture || null;
  }

  getTextureIds() {
    return ['ninguna', ...Array.from(this.textures.keys())];
  }

  updateInspector() {
    // Limpiar inspector conservando la cabecera
    const header = this.inspectorContainer.querySelector('span');
    this.inspectorContainer.innerHTML = '';
    if (header) this.inspectorContainer.appendChild(header);

    if (this.textures.size === 0) {
      this.inspectorContainer.style.display = 'none';
      return;
    }

    this.inspectorContainer.style.display = 'flex';

    this.textures.forEach((texData, id) => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'inspector-item';

      const label = document.createElement('span');
      label.innerText = id.toUpperCase();
      itemDiv.appendChild(label);

      const clonedCanvas = texData.canvas.cloneNode(true);
      const ctx = clonedCanvas.getContext('2d');
      ctx.drawImage(texData.canvas, 0, 0);
      itemDiv.appendChild(clonedCanvas);

      this.inspectorContainer.appendChild(itemDiv);
    });
  }

  exportState() {
    const data = {};
    this.textures.forEach((tex, id) => {
      data[id] = { type: tex.type, settings: tex.settings };
    });
    return data;
  }

  importState(savedTextures) {
    // Limpiar actuales
    Array.from(this.textures.keys()).forEach(id => this.deleteTexture(id));
    this.counters = { radial: 0, gradiente: 0 };

    for (const [id, data] of Object.entries(savedTextures)) {
      // Extraer tipo y contador si coincide con radialX / gradienteX
      const match = id.match(/([a-zA-Z]+)(\d+)/);
      if (match) {
        const type = match[1];
        const num = parseInt(match[2], 10);
        if (this.counters[type] < num) this.counters[type] = num;
      }
      
      // Crear textura con los ajustes guardados
      const canvas = document.createElement('canvas');
      canvas.width = data.type === 'radial' ? 512 : 16;
      canvas.height = data.type === 'radial' ? 512 : 256;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;

      this.textures.set(id, { id, type: data.type, settings: data.settings, canvas, texture });
      this.redrawTexture(id);
    }
    if (this.onTexturesChanged) this.onTexturesChanged();
  }
}

export const textureManager = new TextureManager();