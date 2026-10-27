// Prueba de humo del modo sin servidor (alojamiento estático, p. ej. Hostinger):
//   npm run build --workspace client && (cd client/dist && python3 -m http.server 8090)
//   node tests/e2e/static-smoke.mjs http://127.0.0.1:8090/ carpeta-capturas
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://127.0.0.1:8090/';
const out = process.argv[3] ?? '.';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
const fail = async (msg) => { await page.screenshot({ path: `${out}/static-error.png` }); console.error('FALLO:', msg, errors); await browser.close(); process.exit(1); };
const dateText = async () => (await page.locator('text=/^\\d+ de [a-z]+ de \\d{4}$/').first().textContent())?.trim();

await page.goto(base);
// reloj acelerado solo para la prueba (300 ms por día)
await page.evaluate(() => localStorage.setItem('cyo.dev.msPerDay', '300'));
await page.reload();
await page.waitForSelector('text=modo un jugador en el navegador', { timeout: 15000 }).catch(() => fail('el menú no detectó el modo sin servidor'));
await page.screenshot({ path: `${out}/static-01-menu.png` });
await page.click('text=Nueva partida');
await page.waitForSelector('text=Modo un jugador.');
await page.fill('input[placeholder="Cómo te verán los demás"]', 'Ana');
await page.click('button:has-text("Crear partida (un jugador)")');
await page.waitForSelector('text=Sala de espera', { timeout: 60000 }).catch(() => fail('no se creó la partida local'));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/static-02-sala.png` });
await page.click('aside >> text=Valdoria');
await page.click('button:has-text("Gobernar Valdoria")');
await page.waitForTimeout(400);
await page.click('button:has-text("Comenzar partida")');
await page.waitForSelector('text=Diario de Vereth', { timeout: 30000 }).catch(() => fail('la partida no comenzó'));
const skip = page.locator('button:has-text("No volver a mostrar")');
if (await skip.count()) await skip.click();
const d1 = await dateText();
await page.waitForTimeout(3000);
const d2 = await dateText();
if (!d1 || d1 === d2) await fail(`el reloj no avanza (${d1} → ${d2})`);
console.log('reloj:', d1, '→', d2);
// un comando real: cambiar la doctrina militar
await page.click('nav button[title="Defensa"]');
await page.click('button:has-text("Ofensiva")');
await page.waitForTimeout(800);
const rejected = await page.locator('text=Acción rechazada').count();
if (rejected) await fail('el comando fue rechazado');
await page.screenshot({ path: `${out}/static-03-juego.png` });
// esperar al guardado periódico y recargar: la partida debe continuar donde estaba
await page.waitForTimeout(2500);
const before = await dateText();
await page.reload();
await page.click('text=Continuar partida');
await page.waitForSelector('text=Partidas de un jugador en este navegador', { timeout: 10000 }).catch(() => fail('no aparece la partida guardada'));
await page.screenshot({ path: `${out}/static-04-continuar.png` });
await page.click('button:has-text("Continuar")');
await page.waitForSelector('text=Diario de Vereth', { timeout: 30000 }).catch(() => fail('no se pudo reanudar'));
const after = await dateText();
const dayOf = (t) => { const m = /^(\d+) de ([a-z]+) de (\d{4})$/.exec(t ?? ''); const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']; return m ? (Number(m[3]) - 1990) * 360 + months.indexOf(m[2]) * 30 + Number(m[1]) : -1; };
if (dayOf(after) < dayOf(before) - 5) await fail(`la partida retrocedió al reanudar (${before} → ${after})`);
await page.click('nav button[title="Defensa"]');
await page.waitForTimeout(600);
const doctrine = await page.locator('text=Ofensiva').first().isVisible();
await page.screenshot({ path: `${out}/static-05-reanudada.png` });
console.log('reanudada:', before, '→', after, '· doctrina visible', doctrine);
console.log('errores de página:', errors.length ? errors : 'ninguno');
await browser.close();
process.exit(errors.length ? 1 : 0);
