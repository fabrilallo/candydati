export const REPOSITORY_URL = 'https://github.com/fabrilallo/candydati';

/** A file of the repository on GitHub, for links to documents that live next to the code. */
export const repoFile = (path: string): string => `${REPOSITORY_URL}/blob/main/${path}`;

export interface SidebarLabels {
  readonly start: string;
  readonly run: string;
  readonly integrate: string;
  readonly project: string;
}

export interface PageTitles {
  readonly introduction: string;
  readonly quickStart: string;
  readonly email: string;
  readonly ai: string;
  readonly operations: string;
  readonly configuration: string;
  readonly trackedLinks: string;
  readonly otherDeployments: string;
  readonly api: string;
  readonly security: string;
  readonly faq: string;
  readonly contributing: string;
}

/** Same structure in every language: only the prefix and the words change. */
export function sidebar(prefix: string, groups: SidebarLabels, pages: PageTitles) {
  const link = (page: string) => `${prefix}guide/${page}`;
  return [
    {
      text: groups.start,
      items: [
        { text: pages.introduction, link: link('introduction') },
        { text: pages.quickStart, link: link('quick-start') },
      ],
    },
    {
      text: groups.run,
      items: [
        { text: pages.email, link: link('email') },
        { text: pages.ai, link: link('ai') },
        { text: pages.operations, link: link('operations') },
        { text: pages.configuration, link: link('configuration') },
        { text: pages.trackedLinks, link: link('tracked-links') },
        { text: pages.otherDeployments, link: link('other-deployments') },
      ],
    },
    {
      text: groups.integrate,
      items: [{ text: pages.api, link: link('api') }],
    },
    {
      text: groups.project,
      items: [
        { text: pages.security, link: link('security') },
        { text: pages.faq, link: link('faq') },
        { text: pages.contributing, link: link('contributing') },
      ],
    },
  ];
}
