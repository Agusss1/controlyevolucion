export function fmtNum(v: number, d = 1): string {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('es', { maximumFractionDigits: d, minimumFractionDigits: 0 });
}
export function fmtPct(v: number, d = 1): string { return Number.isFinite(v) ? `${(v * 100).toLocaleString('es', { maximumFractionDigits: d })} %` : '—'; }
/** miles de millones → texto */
export function fmtBn(v: number, unit = 'UMI'): string {
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toLocaleString('es', { maximumFractionDigits: 2 })} bill. ${unit}`;
  if (a >= 1) return `${v.toLocaleString('es', { maximumFractionDigits: 1 })} mil M ${unit}`;
  return `${(v * 1000).toLocaleString('es', { maximumFractionDigits: 0 })} M ${unit}`;
}
export function fmtPop(m: number): string { return m >= 1 ? `${m.toLocaleString('es', { maximumFractionDigits: 1 })} M` : `${Math.round(m * 1000).toLocaleString('es')} mil`; }

export const REGIME_NAMES: Record<string, string> = {
  parliamentary_democracy: 'Democracia parlamentaria', presidential_republic: 'República presidencial', constitutional_monarchy: 'Monarquía constitucional',
  absolute_monarchy: 'Monarquía absoluta', one_party_state: 'Estado de partido único', military_junta: 'Junta militar', theocracy: 'Teocracia'
};
export const ARCHETYPE_NAMES: Record<string, string> = {
  industrial: 'Potencia industrial', emerging_industrial: 'Industrial emergente', socialist_industrial: 'Socialista industrial', socialist_agrarian: 'Socialista agrario',
  petrostate: 'Petroestado', resource_exporter: 'Exportador de recursos', agrarian: 'Agrario', tech_trader: 'Tecnológico comercial', services_finance: 'Servicios y finanzas',
  tourism_islands: 'Turismo y servicios', mixed_developing: 'Economía mixta en desarrollo', military_industrial: 'Militar-industrial'
};
export const SECTOR_NAMES: Record<string, string> = {
  agriculture: 'Agricultura', livestock: 'Ganadería', mining: 'Minería', oil: 'Petróleo', gas: 'Gas', energy: 'Energía', industry: 'Industria', construction: 'Construcción',
  transport: 'Transporte', telecom: 'Telecomunicaciones', services: 'Servicios', finance: 'Finanzas', tech: 'Tecnología', tourism: 'Turismo', defense: 'Industria militar'
};
export const BUDGET_NAMES: Record<string, string> = {
  education: 'Educación', health: 'Salud', defense: 'Defensa', security: 'Seguridad', justice: 'Justicia', infrastructure: 'Infraestructura', administration: 'Administración',
  science: 'Ciencia', intelligence: 'Inteligencia', subsidies: 'Subsidios', transfers: 'Transferencias y pensiones'
};
export const TAX_NAMES: Record<string, string> = {
  vat: 'IVA', income: 'Ganancias (personas)', corporate: 'Sociedades', wealth: 'Patrimonio', import: 'Aranceles de importación', export: 'Derechos de exportación',
  excise: 'Impuestos específicos', payroll: 'Contribuciones laborales', provincial: 'Impuestos provinciales', rents: 'Rentas de recursos', soe: 'Empresas públicas'
};
export const GROUP_NAMES: Record<string, string> = {
  workers: 'Trabajadores', farmers: 'Campesinos', business: 'Empresarios', middle: 'Clases medias', public: 'Empleados públicos', pensioners: 'Jubilados',
  youth: 'Jóvenes', military: 'Militares', religious: 'Religiosos', minorities: 'Minorías'
};
export const TREATY_NAMES: Record<string, string> = {
  trade_agreement: 'Tratado comercial', non_aggression: 'Pacto de no agresión', defensive_alliance: 'Alianza defensiva', military_alliance: 'Alianza militar',
  energy_agreement: 'Acuerdo energético', science_cooperation: 'Cooperación científica', customs_union: 'Unión aduanera', migration_cooperation: 'Cooperación migratoria',
  economic_aid: 'Ayuda económica', loan: 'Préstamo', military_access: 'Acceso militar', peace: 'Tratado de paz', ceasefire: 'Alto el fuego', territorial_cession: 'Cesión territorial',
  unification: 'Unificación', recognition: 'Reconocimiento', debt_relief: 'Alivio de deuda', mediation: 'Mediación', join_organization: 'Adhesión a organización'
};
export const WAR_STATUS: Record<string, string> = { pending: 'Declarada (esperando)', preparing: 'Movilización', active: 'En curso', frozen: 'Congelada', ceasefire: 'Alto el fuego', ended: 'Terminada' };
export const ORDER_NAMES: Record<string, string> = {
  move: 'Mover', attack: 'Atacar', defend: 'Defender', hold: 'Mantener', retreat: 'Retirarse', blockade: 'Bloquear', patrol: 'Patrullar', embark: 'Embarcar', disembark: 'Desembarcar',
  air_superiority: 'Superioridad aérea', ground_support: 'Apoyo cercano', interdiction: 'Interdicción', bombing: 'Bombardeo estratégico', recon: 'Reconocimiento', rebase: 'Cambiar de base', sabotage: 'Sabotaje'
};
export const STATUS_NAMES: Record<string, string> = { training: 'En formación', ready: 'Lista', moving: 'En marcha', combat: 'En combate', retreating: 'En retirada', embarked: 'Embarcada', frozen: 'Detenida (guerra congelada)' };
