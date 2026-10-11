import * as THREE from "three";

class TextureManager {
  constructor() {
    this.textures = new Map(); // id -> { name, type, settings, canvas, texture }
    this.counters = { radial: 0, gradiente: 0 };
    this.inspectorContainer = document.getElementById('texture-inspector-container');
    
    // Callback para notificar a la GUI cuando cambian las texturas
    this.onTexturesChanged = null;
  }

  // Ajustes por defecto de cada tipo de textura (incluye offsetSpeed)
  defaultSettings(type) {
    if (type === 'gradiente') {
      return {
        stop1Color: '#ae00ff',
        stop2Color: '#0755fe',
        stop3Color: '#ffffff',
        offsetSpeed: 0 // desplazamiento de UVs en Y (unidades/segundo)
      };
    }
    return {
      innerRadius: 10,
      outerRadius: 200,
      colorCenter: '#ffffff',
      colorMiddle: '#00eeff',
      colorOuter: '#da8aff',
      offsetSpeed: 0
    };
  }

  createTexture(type = 'radial', customSettings = null) {
    this.counters[type]++;
    const id = `${type}${this.counters[type]}`;

    const settings = JSON.parse(JSON.stringify({
      ...this.defaultSettings(type),
      ...(customSettings || {})
    }));

    const { canvas, texture } = this.createTexturePlumbing(type);

    const texData = { id, type, settings, canvas, texture };
    this.textures.set(id, texData);

    this.redrawTexture(id);

    if (this.onTexturesChanged) this.onTexturesChanged();
    return id;
  }

  // Crea el canvas + CanvasTexture con la configuración correcta para cada tipo.
  // Se usa tanto al crear texturas nuevas como al importar un proyecto.
  createTexturePlumbing(type) {
    const canvas = document.createElement('canvas');
    canvas.width = type === 'radial' ? 512 : 16;
    canvas.height = type === 'radial' ? 512 : 256;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    // RepeatWrapping: a offset 0 el aspecto es idéntico (los UVs del modelo van 0..1),
    // pero al desplazar los UVs la textura repite en vez de estirar el borde.
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (type === 'gradiente') {
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
    }

    return { canvas, texture };
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

  // Avanza el offset en Y de cada textura según su velocidad (unidades/segundo).
  // Lo llama el bucle de animación con el deltaTime.
  updateOffsets(delta) {
    this.textures.forEach(texData => {
      const speed = texData.settings && texData.settings.offsetSpeed;
      if (!speed) return;
      const offset = texData.texture.offset;
      offset.y = (offset.y + speed * delta) % 1;
    });
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
    // Limpiar actuales en bloque (sin notificar una vez por textura)
    this.textures.forEach(texData => texData.texture.dispose());
    this.textures.clear();
    this.counters = { radial: 0, gradiente: 0 };

    for (const [id, data] of Object.entries(savedTextures || {})) {
      const type = data.type === 'gradiente' ? 'gradiente' : 'radial';

      // Extraer contador si el id coincide con radialX / gradienteX
      const match = id.match(/^([a-zA-Z]+?)(\d+)$/);
      if (match) {
        const counterType = match[1];
        const num = parseInt(match[2], 10);
        if (this.counters[counterType] === undefined) this.counters[counterType] = 0;
        if (this.counters[counterType] < num) this.counters[counterType] = num;
      }

      // Crear textura con la misma configuración (filtros incluidos) que una nueva
      const { canvas, texture } = this.createTexturePlumbing(type);
      // defaults + guardado: así los JSON antiguos se completan con lo que falte
      const settings = {
        ...this.defaultSettings(type),
        ...(data.settings ? JSON.parse(JSON.stringify(data.settings)) : {})
      };

      this.textures.set(id, { id, type, settings, canvas, texture });
      this.redrawTexture(id);
    }

    this.updateInspector();
    if (this.onTexturesChanged) this.onTexturesChanged();
  }
}

export const textureManager = new TextureManager();