/**
 * PartnerResourcesView — Links to external partner resources.
 *
 * Static page with three resource cards:
 * - Marketing Resources (Google Drive folder with branding assets)
 * - YouTube Product Guides (CSA YouTube channel)
 * - Support (CSA helpdesk portal)
 *
 * Each card links to an external URL and opens in a new tab.
 * No API calls — this is a purely presentational component.
 */

'use client';

import { motion } from 'framer-motion';
import { Megaphone, Youtube, HeadphonesIcon, ExternalLink, ArrowRight } from 'lucide-react';

const resources = [
  {
    id: 'marketing',
    title: 'Marketing Resources',
    description: 'Access branding guidelines, product collateral, co-branded templates, and promotional materials to help you market Civil Survey Applications products.',
    icon: Megaphone,
    color: 'text-csa-accent',
    bgColor: 'bg-csa-accent/10',
    borderColor: 'border-csa-accent/30',
    hoverBorder: 'hover:border-csa-accent/60',
    url: 'https://drive.google.com/drive/folders/1XBqoxK5CVGAbUZBQBIXdYeqJrTFgtTzy',
    items: [
      'Product brochures and datasheets',
      'Co-branded email templates',
      'Social media assets',
      'Logo and brand guidelines',
    ],
  },
  {
    id: 'youtube',
    title: 'YouTube Product Guides',
    description: 'Video tutorials, product walkthroughs, and training content to help you and your customers get the most out of Civil Site Design, Stringer, and Corridor EZ.',
    icon: Youtube,
    color: 'text-error',
    bgColor: 'bg-error/10',
    borderColor: 'border-error/30',
    hoverBorder: 'hover:border-error/60',
    url: 'https://www.youtube.com/@CivilSurveyApplications/featured',
    items: [
      'Getting started tutorials',
      'Feature deep-dives',
      'Workflow demonstrations',
      'Webinar recordings',
    ],
  },
  {
    id: 'support',
    title: 'Support',
    description: 'Access the knowledge base, submit support tickets, and find technical documentation to resolve issues and help your customers.',
    icon: HeadphonesIcon,
    color: 'text-success',
    bgColor: 'bg-success/10',
    borderColor: 'border-success/30',
    hoverBorder: 'hover:border-success/60',
    url: 'https://helpdesk.civilsurveyapplications.com/',
    items: [
      'Knowledge base articles',
      'Submit a support ticket',
      'Technical documentation',
      'Release notes and updates',
    ],
  },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function PartnerResourcesView() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <h1 className="text-3xl font-bold text-text-primary mb-2">Partner Resources</h1>
          <p className="text-sm text-text-muted">
            Tools, guides, and support to help you succeed as a Civil Survey Applications partner
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          {resources.map((resource) => (
            <motion.a
              key={resource.id}
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              variants={item}
              className={`bg-csa-dark border-2 ${resource.borderColor} ${resource.hoverBorder} rounded-2xl overflow-hidden transition-all duration-200 group cursor-pointer block`}
              whileHover={{ y: -4 }}
            >
              {/* Accent bar */}
              <div className={`h-1 ${resource.bgColor}`} />

              <div className="p-6">
                {/* Icon */}
                <div className={`w-14 h-14 ${resource.bgColor} rounded-2xl flex items-center justify-center mb-5`}>
                  <resource.icon size={28} className={resource.color} />
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold text-text-primary mb-2 flex items-center gap-2">
                  {resource.title}
                  <ArrowRight size={16} className="text-text-muted opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </h2>

                {/* Description */}
                <p className="text-sm text-text-secondary leading-relaxed mb-5">
                  {resource.description}
                </p>

                {/* Items */}
                <ul className="space-y-2">
                  {resource.items.map((text, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-text-muted">
                      <div className={`w-1 h-1 rounded-full ${resource.color.replace('text-', 'bg-')}`} />
                      {text}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className={`mt-6 pt-4 border-t ${resource.borderColor}`}>
                  <span className={`text-xs font-semibold ${resource.color} flex items-center gap-1.5 group-hover:gap-2.5 transition-all`}>
                    Explore <ExternalLink size={12} />
                  </span>
                </div>
              </div>
            </motion.a>
          ))}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-xs text-text-muted mt-10"
        >
          Need something specific? Contact your CSA Account Manager for assistance.
        </motion.p>
      </div>
    </div>
  );
}
