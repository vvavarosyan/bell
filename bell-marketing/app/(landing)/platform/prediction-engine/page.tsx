import type { Metadata } from 'next';
import { PredictionEnginePageSections } from '@/components/prediction-engine-page-sections';

export const metadata: Metadata = {
  title: 'Prediction Engine — Bell.qa',
  description:
    'Probability-weighted forecasts across the Qatari market. Sector heat, deal close, account churn, competitive moves, demand waves — all decomposable, all cited, all time-horizoned.',
};

export default function PredictionEnginePage() {
  return <PredictionEnginePageSections />;
}
