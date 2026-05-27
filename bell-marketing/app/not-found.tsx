import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-prose-narrow mx-auto px-6 py-32 text-center">
      <div className="text-display-md text-gradient mb-4">404</div>
      <p className="text-text-muted text-lg mb-10">
        This page doesn't exist (yet). Try the home page or get in touch.
      </p>
      <div className="flex gap-3 justify-center">
        <Link
          href="/"
          className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-md bg-accent text-white hover:brightness-110 transition"
        >
          Go home
        </Link>
        <Link
          href="/contact"
          className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-md text-text-muted hover:text-text border border-border hover:border-accent transition"
        >
          Contact us
        </Link>
      </div>
    </div>
  );
}
