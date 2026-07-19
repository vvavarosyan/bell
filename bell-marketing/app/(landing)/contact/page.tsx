import type { Metadata } from 'next';
import { ContactForm } from '@/components/contact-form';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the Bell.qa team about access, partnerships, or feedback.',
};

export default function ContactPage() {
  return (
    <div className="max-w-prose-narrow mx-auto px-6 py-24">
      <h1 className="text-display-md text-gradient mb-4 text-center">Get in touch</h1>
      <p className="text-text-muted text-lg leading-relaxed mb-10 text-center">
        Access, partnerships, data questions, feedback — we read every message and usually
        reply within a day.
      </p>
      <ContactForm />
    </div>
  );
}
