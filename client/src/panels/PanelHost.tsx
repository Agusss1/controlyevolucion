import type { PanelId } from '../store/game';
import { OverviewPanel, GovernmentPanel, SocietyPanel, ElectionsPanel, HistoryPanel, NewsPanel, WorldPanel, IntelligencePanel } from './StatePanels';
import { EconomyPanel, BudgetPanel, TaxesPanel, IndustryPanel, EnergyPanel, TradePanel, InfrastructurePanel, StatisticsPanel } from './EconomyPanels';
import { DefensePanel } from './DefensePanel';
import { DiplomacyPanel } from './DiplomacyPanel';
import { TechnologyPanel, LegislationPanel } from './PolicyPanels';
import { useGame } from '../store/game';

export function PanelHost({ panel }: { panel: PanelId }) {
  const priv = useGame((s) => s.priv);
  if (!priv && panel !== 'world' && panel !== 'news' && panel !== 'history') return <div className="text-sm text-slate-400">Elige un país para gobernar.</div>;
  switch (panel) {
    case 'overview': return <OverviewPanel />;
    case 'government': return <GovernmentPanel />;
    case 'economy': return <EconomyPanel />;
    case 'budget': return <BudgetPanel />;
    case 'taxes': return <TaxesPanel />;
    case 'society': return <SocietyPanel />;
    case 'infrastructure': return <InfrastructurePanel />;
    case 'industry': return <IndustryPanel />;
    case 'energy': return <EnergyPanel />;
    case 'trade': return <TradePanel />;
    case 'defense': return <DefensePanel />;
    case 'diplomacy': return <DiplomacyPanel />;
    case 'intelligence': return <IntelligencePanel />;
    case 'technology': return <TechnologyPanel />;
    case 'legislation': return <LegislationPanel />;
    case 'elections': return <ElectionsPanel />;
    case 'statistics': return <StatisticsPanel />;
    case 'history': return <HistoryPanel />;
    case 'news': return <NewsPanel />;
    case 'world': return <WorldPanel />;
  }
}
