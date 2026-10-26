// Prueba de humo de la interfaz con un navegador real: node tests/e2e/ui-smoke.mjs http://127.0.0.1:3100 carpeta-capturas
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const out = process.argv[3] ?? '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base);
await page.waitForSelector('text=Nueva partida');
await page.screenshot({ path: `${out}/01-menu.png` });
await page.click('text=Nueva partida');
await page.fill('input[placeholder="Cómo te verán los demás"]', 'Ana');
await page.screenshot({ path: `${out}/02-crear.png` });
await page.click('button:has-text("Crear partida")');
await page.waitForSelector('text=Sala de espera', { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/03-sala.png` });
// elegir país desde la lista
await page.click('aside >> text=Valdoria');
await page.waitForTimeout(500);
await page.click('button:has-text("Gobernar Valdoria")');
await page.waitForTimeout(800);
await page.click('button:has-text("Comenzar partida")');
await page.waitForSelector('text=Diario de Vereth', { timeout: 30000 });
await page.waitForTimeout(2500);
// cerrar tutorial
const skip = page.locator('button:has-text("No volver a mostrar")');
if (await skip.count()) await skip.click();
await page.screenshot({ path: `${out}/04-juego.png` });
for (const [title, file] of [['Presupuesto', '05-presupuesto'], ['Legislación', '06-leyes'], ['Defensa', '07-defensa'], ['Diplomacia', '08-diplomacia'], ['Tecnología', '09-tecnologia'], ['Industria', '10-industria'], ['Economía', '11-economia']]) {
  await page.click(`nav button[title="${title}"]`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${file}.png` });
}
await page.click('nav button[title="Economía"]');
// capas del mapa
for (const [layer, file] of [['Económico', '12-capa-economica'], ['Alianzas', '13-capa-alianzas'], ['Comercio', '14-capa-comercio'], ['Geográfico', '15-capa-geografica']]) {
  await page.click(`button:has-text("${layer}")`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${file}.png` });
}
// acción real: cambiar el presupuesto y comprobar que el servidor lo aplica
await page.click('button:has-text("Político")');
await page.click('nav button[title="Presupuesto"]');
await page.waitForTimeout(500);
const day0 = await page.locator('header .font-mono').first().innerText();
await page.waitForTimeout(4000);
const day1 = await page.locator('header .font-mono').first().innerText();
console.log('fecha', day0, '→', day1);
console.log('errores de página:', errors.length ? errors : 'ninguno');
await browser.close();
