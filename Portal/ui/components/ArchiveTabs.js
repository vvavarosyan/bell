// Small Active / Archived tab strip used at the top of CompaniesTab and
// PeopleTab. Visual styling defined in styles.css as .archive-tabs.

import { html } from '../lib/html.js';

export function ArchiveTabs({ mode, onChange, activeCount = null, archivedCount = null }) {
  return html`
    <div class="archive-tabs">
      <button
        class=${'archive-tab ' + (mode === 'active' ? 'active' : '')}
        onClick=${() => onChange('active')}
      >
        Active${activeCount != null ? html` <span class="archive-tab-count">${activeCount.toLocaleString()}</span>` : null}
      </button>
      <button
        class=${'archive-tab ' + (mode === 'archived' ? 'active' : '')}
        onClick=${() => onChange('archived')}
      >
        Archived${archivedCount != null ? html` <span class="archive-tab-count">${archivedCount.toLocaleString()}</span>` : null}
      </button>
    </div>
  `;
}
