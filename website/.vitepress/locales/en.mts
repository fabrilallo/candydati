import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';
import { repoFile, sidebar } from './shared.mjs';

export const en: LocaleSpecificConfig<DefaultTheme.Config> = {
  description: "An open, self-hostable agentic ATS that answers every applicant and searches the candidates you already have.",
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/introduction', activeMatch: '^/guide/(?!quick-start)' },
      { text: 'Quick start', link: '/guide/quick-start' },
      { text: 'Changelog', link: repoFile('CHANGELOG.md') },
    ],
    sidebar: {
      '/guide/': sidebar(
        '/',
        { start: 'Getting started', run: 'Run your instance', integrate: 'Integrate', project: 'Project' },
        {
          introduction: 'Introduction',
          talentPool: 'Search your database',
          interviews: 'Interviews from your calendar',
          quickStart: 'Quick start',
          email: 'Email',
          ai: 'AI assistant (optional)',
          operations: 'Day-to-day operations',
          configuration: 'Configuration',
          trackedLinks: 'Tracked links and sources',
          agencies: 'Recruiting for clients',
          migration: 'Migrating from another ATS',
          otherDeployments: 'Other ways to deploy',
          api: 'API, webhooks and MCP',
          security: 'Security and privacy',
          faq: 'FAQ',
          contributing: 'Contributing',
        },
      ),
    },
    editLink: { pattern: repoFile('website/:path'), text: 'Edit this page on GitHub' },
    footer: {
      message: 'Source available under the Business Source License 1.1.',
      copyright: '© 2026 Fabrizio Lallo',
    },
    outline: { label: 'On this page' },
  },
};
