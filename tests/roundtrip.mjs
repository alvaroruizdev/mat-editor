#!/usr/bin/env node
/**
 * Test de ida y vuelta REAL para mat-editor.
 *
 * Qué hace (sin mocks):
 *   1. Abre la web con Chrome headless y CDP.
 *   2. Conduce los controles REALES de la GUI (lil-gui) para poner parámetros distintivos.
 *   3. Pulsa "Exportar JSON" de verdad (Blob + JSON.stringify) y guarda el fichero en disco.
 *   4. Recarga la página desde cero (estado por defecto).
 *   5. Importa ESE fichero (fetch desde el servidor → loadProject = mismo camino que el input file).
 *   6. Compara el estado exportado con el estado vivo tras importar (deep-equal) y comprueba
 *      que las luces, los materiales y las texturas quedan exactamente igual.
 *   7. Guarda capturas antes/después para inspección visual.
 *
 * Uso:  node tests/roundtrip.mjs [http://localhost:8000]
 * Requiere: el servidor estático sirviendo la raíz del repo en BASE_URL.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:8000';
const PORT = 9333;
const OUT = new URL('./out/', import.meta.url).pathname;
const PROJECT_FILE = new URL('./roundtrip-project.json', import.meta.url).pathname;

mkdirSync(OUT, { recursive: true });

// ---------- utilidades ----------
const stable = v => Array.isArray(v)
  ? '[' + v.map(stable).join(',') + ']'
  : (v && typeof v === 'object'
    ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
    : JSON.stringify(v));

const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${extra ? '  :: ' + extra : ''}`);
};

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error('Error en la página: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  }
}

async function waitFor(fn, { timeout = 25000, every = 250, label = 'condición' } = {}) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e.message; }
    await sleep(every);
  }
  throw new Error(`Timeout esperando ${label}. Último valor: ${JSON.stringify(last)}`);
}

// ---------- lanzar Chrome ----------
const chrome = spawn('google-chrome-stable', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*',
  '--window-size=1280,800', '--hide-scrollbars',
  '--user-data-dir=/tmp/mat-editor-cdp-profile',
  `${BASE}/index.html`
], { stdio: 'ignore' });

const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} };
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

let cdp;
try {
  const target = await waitFor(async () => {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    return list.find(t => t.type === 'page' && t.webSocketDebuggerUrl && t.url.startsWith(BASE));
  }, { label: 'target CDP' });

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});

  const waitReady = () => waitFor(
    () => cdp.eval('!!(window.matEditor && window.matEditor.api && document.readyState === "complete")'),
    { label: 'app cargada' }
  );

  // ============ FASE 1: estado distintivo + export real ============
  console.log('\n== FASE 1: configurar la GUI y exportar ==');
  await waitReady();

  const setup = await cdp.eval(`(() => {
    const { api, sceneData, textureManager } = window.matEditor;
    const ctrls = api.gui.controllersRecursive();
    const byName = n => {
      const c = ctrls.find(c => c._name === n);
      if (!c) throw new Error('No encuentro el control: ' + n);
      return c;
    };
    // Iluminación (parámetros distintivos)
    byName('Cantidad de luces').setValue(3);
    byName('Distancia al Centro').setValue(9);
    byName('Ángulo Apertura').setValue(0.2);
    byName('Altura (Y)').setValue(8);
    byName('Intensidad').setValue(11);

    // Velocidad de rotación: hay DOS controles con el mismo nombre, se distinguen por carpeta
    const rotCtrls = ctrls.filter(c => c._name === 'Velocidad rotación (rad/s)');
    if (rotCtrls.length !== 2) throw new Error('Se esperaban 2 controles "Velocidad rotación (rad/s)", hay ' + rotCtrls.length);
    const rotOf = title => rotCtrls.find(c => c.parent && c.parent._title === title);
    const objRot = rotOf('OBJETO');
    const lightRot = rotOf('Iluminación');
    if (!objRot || !lightRot) throw new Error('No localizo los controles por carpeta: ' + rotCtrls.map(c => c.parent && c.parent._title));
    objRot.setValue(1.5);
    lightRot.setValue(0.75);

    // Materiales: iridiscente usa gradiente1 como MAPA DE GROSOR, base usa radial1
    api.materialTextureControllers[1].setValue('gradiente1');
    api.materialTextureControllers[0].setValue('radial1');

    // Desplazamiento de UVs por textura
    textureManager.textures.get('radial1').settings.offsetSpeed = 0.4;
    textureManager.textures.get('gradiente1').settings.offsetSpeed = -0.3;

    const mi = sceneData.materialConfigs.iridiscente;
    mi.config.useAsThicknessMap = true;
    mi.material.roughness = 0.42;
    mi.material.color.set('#22ff88');
    mi.material.iridescence = 0.66;
    mi.material.iridescenceIOR = 1.9;
    mi.material.iridescenceThicknessRange = [222, 1333];
    mi.material.clearcoat = 0.7;
    api.applyTextureToMaterial('iridiscente');
    sceneData.materialConfigs.base.material.color.set('#ff5500');
    sceneData.chosen.material = 'iridiscente';
    sceneData.applySelectedMaterial();
    api.refreshAllDropdowns();
    return {
      ctrls: ctrls.filter(c => c._name).map(c => c._name),
      folders: api.gui.foldersRecursive().map(f => f._title),
      rotValues: rotCtrls.map(c => c.getValue())
    };
  })()`);
  console.log('  carpetas GUI:', setup.folders.join(' | '));
  check('existe la sección OBJETO (antes MATERIAL ELEGIDO)', setup.folders.includes('OBJETO'));
  check('ya no existe MATERIAL ELEGIDO', !setup.folders.includes('MATERIAL ELEGIDO'));
  console.log('  controles GUI:', setup.ctrls.join(' | '));

  await sleep(1200); // que se aplique y renderice
  await cdp.send('Page.captureScreenshot', { format: 'png' }).then(s =>
    writeFileSync(path.join(OUT, '1-antes.png'), Buffer.from(s.data, 'base64')));

  const exportedText = await cdp.eval(`(async () => {
    window.__blob = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => { window.__blob = b; return orig.call(URL, b); };
    window.matEditor.api.projectActions.exportJSON();
    URL.createObjectURL = orig;
    return await window.__blob.text();
  })()`);
  writeFileSync(PROJECT_FILE, exportedText);
  const exported = JSON.parse(exportedText);
  console.log('  JSON exportado en', PROJECT_FILE, `(${exportedText.length} bytes)`);
  console.log('  lights exportadas:', stable(exported.lights));
  console.log('  object exportado:', stable(exported.object));

  check('el JSON exportado incluye distance', typeof exported.lights.distance === 'number', String(exported.lights.distance));
  check('el JSON exportado incluye angle', typeof exported.lights.angle === 'number', String(exported.lights.angle));
  check('el JSON exportado incluye altura (height)', exported.lights.height === 8, String(exported.lights.height));
  check('el JSON exportado incluye rotación de luces', exported.lights.rotationSpeed === 0.75, String(exported.lights.rotationSpeed));
  check('el JSON exportado incluye rotación del objeto', exported.object && exported.object.rotationSpeed === 1.5, stable(exported.object));
  check('el JSON exportado incluye offsetSpeed de textura', exported.textures.radial1.settings.offsetSpeed === 0.4 && exported.textures.gradiente1.settings.offsetSpeed === -0.3, stable({ r: exported.textures.radial1.settings.offsetSpeed, g: exported.textures.gradiente1.settings.offsetSpeed }));

  // ============ FASE 2: recargar en frío e importar el mismo fichero ============
  console.log('\n== FASE 2: recargar e importar el fichero exportado ==');
  await cdp.send('Page.navigate', { url: `${BASE}/index.html?fresh=${Date.now()}` });
  await sleep(500);
  await waitReady();

  const defaultState = await cdp.eval('JSON.stringify(window.matEditor.api.buildProjectState().lights)');
  console.log('  estado por defecto (antes de importar):', defaultState);

  const afterText = await cdp.eval(`(async () => {
    const text = await (await fetch('/tests/roundtrip-project.json?cb=' + Date.now())).text();
    window.matEditor.api.loadProject(JSON.parse(text));
    const { api, sceneData, textureManager } = window.matEditor;
    const mi = sceneData.materialConfigs.iridiscente;
    return JSON.stringify({
      state: api.buildProjectState(),
      rotCtrls: api.gui.controllersRecursive()
        .filter(c => c._name === 'Velocidad rotación (rad/s)')
        .map(c => c.getValue()),
      liveLights: sceneData.lights.map(l => ({
        angle: l.angle, intensity: l.intensity,
        color: '#' + l.color.getHexString(),
        x: +l.position.x.toFixed(4), y: +l.position.y.toFixed(4), z: +l.position.z.toFixed(4)
      })),
      meshBoundTo: {
        thicknessMapIsGradiente: mi.material.iridescenceThicknessMap === textureManager.getTexture('gradiente1'),
        mapIsNull: mi.material.map === null,
        baseMapIsRadial: sceneData.materialConfigs.base.material.map === textureManager.getTexture('radial1')
      }
    });
  })()`);
  const after = JSON.parse(afterText);

  await sleep(1200);
  await cdp.send('Page.captureScreenshot', { format: 'png' }).then(s =>
    writeFileSync(path.join(OUT, '2-despues.png'), Buffer.from(s.data, 'base64')));

  // ============ Comprobaciones ============
  console.log('\n== COMPROBACIONES ==');
  const eq = (name, a, b) => check(name, stable(a) === stable(b), stable(a) === stable(b) ? '' : `\n     exportado: ${stable(a)}\n     tras import: ${stable(b)}`);

  eq('luces idénticas tras importar', exported.lights, after.state.lights);
  eq('objeto idéntico tras importar', exported.object, after.state.object);
  eq('materiales idénticos tras importar', exported.materials, after.state.materials);
  eq('textura elegida del iridiscente', exported.materials.iridiscente.config.texture, after.state.materials.iridiscente.config.texture);
  eq('material elegido', exported.chosenMaterial, after.state.chosenMaterial);
  eq('texturas idénticas tras importar', exported.textures, after.state.textures);

  check('useAsThicknessMap restaurado', after.state.materials.iridiscente.config.useAsThicknessMap === true);
  check('color iridiscente #22ff88', after.state.materials.iridiscente.properties.color === '#22ff88', after.state.materials.iridiscente.properties.color);
  check('rango de grosor [222,1333]', stable(after.state.materials.iridiscente.properties.iridescenceThicknessRange) === '[222,1333]');
  check('el material tiene el gradiente como mapa de grosor', after.meshBoundTo.thicknessMapIsGradiente);
  check('map = null con useAsThicknessMap', after.meshBoundTo.mapIsNull);
  check('el base tiene radial1 como map', after.meshBoundTo.baseMapIsRadial);

  const L = after.liveLights;
  check('nº de luces = 3', L.length === 3, String(L.length));
  check('ángulo de luces aplicado en la escena', L.every(l => Math.abs(l.angle - 0.2) < 1e-6), stable(L.map(l => +l.angle.toFixed(4))));
  check('intensidad de luces aplicada en la escena', L.every(l => l.intensity === 11), stable(L.map(l => l.intensity)));
  check('altura (Y) aplicada en la escena', L.every(l => Math.abs(l.y - 8) < 1e-6), stable(L.map(l => l.y)));
  check('distancia (horizontal) aplicada en la escena', L.every(l => Math.abs(Math.hypot(l.x, l.z) - 9) < 1e-3), stable(L.map(l => +Math.hypot(l.x, l.z).toFixed(3))));
  check('gizmos visibles restaurados', after.state.lights.gizmosVisible === true);
  check('control de rotación del objeto en la GUI', after.rotCtrls && after.rotCtrls.includes(1.5), stable(after.rotCtrls));
  check('control de rotación de luces en la GUI', after.rotCtrls && after.rotCtrls.includes(0.75), stable(after.rotCtrls));

  // --- Animación real (deltaTime) ---
  console.log('\n== ANIMACIÓN (1.2 s) ==');
  await waitFor(() => cdp.eval('!!window.matEditor.sceneData.getModelMesh()'), { label: 'modelo GLB cargado' });
  const anim = JSON.parse(await cdp.eval(`(async () => {
    const { sceneData, textureManager } = window.matEditor;
    const wrap = v => ((v % 1) + 1) % 1;
    const y0 = sceneData.getModelMesh().rotation.y;
    const r0 = sceneData.lightGroup.rotation.y;
    const o0 = textureManager.getTexture('radial1').offset.y;
    await new Promise(r => setTimeout(r, 1200));
    return JSON.stringify({
      dModel: sceneData.getModelMesh().rotation.y - y0,
      dLights: sceneData.lightGroup.rotation.y - r0,
      dOffset: wrap(textureManager.getTexture('radial1').offset.y - o0),
      dOffsetGrad: wrap(textureManager.getTexture('gradiente1').offset.y - o0)
    });
  })()`));
  console.log('  ', stable(anim));
  check('el objeto rota con deltaTime (≈1.5 rad en 1.2 s)', anim.dModel > 0.6, anim.dModel.toFixed(3));
  check('el rig de luces rota (≈0.75 rad en 1.2 s)', anim.dLights > 0.3, anim.dLights.toFixed(3));
  check('la textura radial desplaza sus UVs', anim.dOffset > 0.1, anim.dOffset.toFixed(3));
  check('la textura gradiente desplaza sus UVs (velocidad negativa → wrap)', anim.dOffsetGrad > 0.1, anim.dOffsetGrad.toFixed(3));

  await cdp.send('Page.captureScreenshot', { format: 'png' }).then(s =>
    writeFileSync(path.join(OUT, '3-animado.png'), Buffer.from(s.data, 'base64')));

  const failed = results.filter(r => !r.ok);
  console.log(`\n${failed.length ? 'RESULT=FAIL' : 'RESULT=PASS'}  (${results.length - failed.length}/${results.length})`);
  console.log('Capturas: ' + path.join(OUT, '1-antes.png') + ', ' + path.join(OUT, '2-despues.png') + ' y ' + path.join(OUT, '3-animado.png'));
  cleanup();
  process.exit(failed.length ? 1 : 0);
} catch (err) {
  console.error('ERROR:', err.message);
  cleanup();
  process.exit(2);
}
