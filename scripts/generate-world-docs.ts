// Genera docs/MUNDO_OFICIAL.md a partir del diseño y del estado inicial del mundo oficial.
import { writeFileSync } from 'node:fs';
import { createWorld, OFFICIAL_DESIGN, REGIME_INFO } from '../simulation/src/index.js';

const { map, state } = createWorld({ mode: 'official' });
const pop = (id: string) => { const c = state.countries[id]; return c.demography.young + c.demography.adult + c.demography.old; };
const L: string[] = [];
L.push('# Mundo oficial de CYO: Vereth (1 de enero de 1990)', '');
L.push('> Documento generado automáticamente con `npm run docs:world` a partir de `simulation/src/scenario/official.ts`.', '');
L.push('## Historia general', '');
for (const h of OFFICIAL_DESIGN.worldHistory) L.push(`- ${h}`);
L.push('', '## Geografía', '');
L.push(`- Malla de ${map.width}×${map.height} hexágonos, ${map.provinces.length} provincias, ${map.seaZones.length} zonas marítimas.`);
L.push(`- Masas de tierra: ${map.landmasses.map((l) => `${l.name} (${l.kind === 'continent' ? 'continente' : l.kind === 'island' ? 'isla' : 'archipiélago'}, ${l.provinces.length} prov.)`).join('; ')}.`);
L.push(`- Ríos con nombre: ${map.rivers.filter((r) => r.name).length} (${map.rivers.filter((r) => r.navigable).length} tramos navegables).`);
L.push(`- Rasgos: ${map.features.filter((f) => f.kind !== 'river').map((f) => f.name).join(', ')}.`);
L.push('', '## Organizaciones internacionales', '');
for (const o of Object.values(state.organizations)) L.push(`- **${o.name}** (${o.kind}${o.mutualDefense ? ', defensa mutua' : ''}${o.tariffCut ? `, reducción arancelaria ${Math.round(o.tariffCut * 100)} %` : ''}): ${o.members.map((m) => state.countries[m].name).join(', ')}.`);
L.push('', '## Países', '');
L.push('| País | Régimen | Población (M) | PIB (mil M UMI) | PIB pc | Provincias | Arquetipo |', '|---|---|---:|---:|---:|---:|---|');
const list = Object.values(state.countries).sort((a, b) => b.econ.realGDP - a.econ.realGDP);
for (const c of list) {
  const provs = Object.values(state.provinces).filter((p) => p.owner === c.id).length;
  L.push(`| ${c.name} | ${REGIME_INFO[c.regime].name} | ${pop(c.id).toFixed(1)} | ${c.econ.realGDP.toFixed(0)} | ${Math.round(c.econ.realGDP / pop(c.id) * 1000)} | ${provs} | ${c.archetype} |`);
}
L.push('');
for (const c of list) {
  const d = OFFICIAL_DESIGN.countries.find((x) => x.key === c.id)!;
  L.push(`### ${c.longName} (${c.id})`, '');
  L.push(`- Capital: ${map.provinces.find((p) => p.id === c.capital)?.cityName} · moneda: ${c.currency.name} (${c.currency.code}) · cultura ${map.cultures.find((x) => x.id === c.culture)?.name} · religión ${map.religions.find((x) => x.id === c.religion)?.name}.`);
  L.push(`- Gobierno: ${REGIME_INFO[c.regime].name}; partido de gobierno: ${c.parties.find((p) => p.id === c.politics.governmentParties[0])?.name}. Perfil de IA: ${d.aiProfile}.`);
  for (const h of c.history) L.push(`- ${h}`);
  L.push(`- Fortalezas: ${c.strengths.join('; ')}.`);
  L.push(`- Debilidades: ${c.weaknesses.join('; ')}.`);
  const claims = OFFICIAL_DESIGN.claims.filter((x) => x.claimant === c.id).map((x) => x.reason);
  if (claims.length) L.push(`- Reivindicaciones: ${claims.join('; ')}.`);
  const rivals = OFFICIAL_DESIGN.relations.filter((r) => (r.a === c.id || r.b === c.id) && (r.rivalry ?? 0) > 0).map((r) => state.countries[r.a === c.id ? r.b : r.a].name);
  if (rivals.length) L.push(`- Rivalidades históricas: ${rivals.join(', ')}.`);
  L.push('');
}
writeFileSync('docs/MUNDO_OFICIAL.md', L.join('\n'));
console.log('docs/MUNDO_OFICIAL.md generado');
