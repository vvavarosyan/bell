import { redirect } from 'next/navigation';

/**
 * The /features route has been replaced by /platform. We keep this file
 * around to issue a clean redirect for any old inbound links / search-engine
 * results, plus a config-level redirect in next.config.mjs handles it at
 * the HTTP level (301 permanent) before this component is even loaded.
 */
export default function FeaturesPage() {
  redirect('/platform');
}
