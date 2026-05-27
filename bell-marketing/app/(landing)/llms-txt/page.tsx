import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'llm.txt',
  description: 'Bell.qa\'s machine-readable file for AI assistants and large language models.',
};

/**
 * NOTE: this is the HUMAN-READABLE explanation page for our llm.txt file.
 * The actual machine-readable file will live at /llms.txt (with an 's',
 * per the emerging standard at https://llmstxt.org). When the file ships
 * we'll add an `app/llms.txt/route.ts` to serve it.
 */
export default function LlmsTxtPage() {
  return (
    <ComingSoon
      title="llm.txt"
      description="A machine-readable file that tells AI assistants how to use Bell.qa data responsibly. Publishing alongside our AI information page."
    />
  );
}
