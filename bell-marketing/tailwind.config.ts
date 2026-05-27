import type { Config } from 'tailwindcss';

/**
 * Brand design tokens, lifted from the BDI Portal so admin + marketing
 * share one visual language ("Intelligence Command" aesthetic extended
 * to public web). Reference: Linear.app, Vercel.com, Cursor.com.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './content/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Background tiers
        bg:          'rgb(var(--bg) / <alpha-value>)',
        'bg-elev':   'rgb(var(--bg-elev) / <alpha-value>)',
        'bg-elev-2': 'rgb(var(--bg-elev-2) / <alpha-value>)',
        // Border / rules
        border:      'rgb(var(--border) / <alpha-value>)',
        // Text tiers
        text:        'rgb(var(--text) / <alpha-value>)',
        'text-muted':'rgb(var(--text-muted) / <alpha-value>)',
        'text-dim':  'rgb(var(--text-dim) / <alpha-value>)',
        // Accent (Bell blue)
        accent:      'rgb(var(--accent) / <alpha-value>)',
        'accent-bright':'rgb(var(--accent-bright) / <alpha-value>)',
        // Status colors
        success:     'rgb(111 207 151 / <alpha-value>)',
        warn:        'rgb(251 191 36 / <alpha-value>)',
        danger:      'rgb(255 107 107 / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Display sizes for hero typography
        'display-xl': ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.04em', fontWeight: '700' }],
        'display-lg': ['3.5rem', { lineHeight: '1.08', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-md': ['2.5rem', { lineHeight: '1.12', letterSpacing: '-0.02em', fontWeight: '700' }],
      },
      maxWidth: {
        'screen-xl': '1280px',
        'content':   '1080px',
        'prose-narrow': '720px',
      },
      backgroundImage: {
        'accent-glow': 'radial-gradient(circle at center, rgb(var(--accent) / 0.25), transparent 70%)',
        'subtle-grid': 'linear-gradient(rgb(var(--border) / 0.4) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--border) / 0.4) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};

export default config;
