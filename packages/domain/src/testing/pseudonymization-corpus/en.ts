import { plainProse } from './gaps.js';
import type { CorpusCv } from './types.js';

/** English CVs (UK, US, Canada, Australia): invented people, reserved domains, fictional numbers, example IBAN. */
export const ENGLISH_CVS: readonly CorpusCv[] = [
  {
    id: 'en-1',
    language: 'en',
    firstName: 'Oliver',
    person: { lastName: 'Hughes', email: 'oliver.hughes@example.co.uk' },
    text: `Oliver Hughes
Senior Software Engineer
Flat 4, 27 Elm Grove, London SE15 5DE
+44 (0)20 7946 0321 | 07700 900456 | oliver.hughes@example.co.uk
uk.linkedin.com/in/oliverhughes | oliverhughes.co.uk
Date of birth: 3rd March 1990

Experience
Monzo, London - Senior Software Engineer (2020 - present)
Built the payments ledger in Go and Kotlin, reporting to Dr Sarah Collins.
Worked closely with Priya Patel on the data platform migration to Kubernetes.

Deliveroo, London - Software Engineer (2016 - 2020)
Owned the courier dispatch service (Java, Kafka). My manager, Tom Baker, nominated me for the engineering award.

Education
BSc Computer Science, University of Manchester, 2016

Referees
James Walker, Engineering Manager, Monzo, james.walker@example.co.uk
Hannah Wright, Staff Engineer, Deliveroo, 07700 900789`,
    mustRemove: [
      'Hughes', '27 Elm Grove', 'SE15 5DE', '+44 (0)20 7946 0321', '7946 0321', '07700 900456', 'oliver.hughes@example.co.uk',
      'oliverhughes', '3rd March 1990', 'Collins', 'Baker', 'Walker', 'james.walker@example.co.uk', 'Wright', '07700 900789',
    ],
    mustKeep: [
      'Oliver', 'Monzo', 'London', 'Deliveroo', 'Go', 'Kotlin', 'Kubernetes', 'Java', 'Kafka', 'University of Manchester',
      '2020 - present', '2016 - 2020', 'Senior Software Engineer',
    ],
    knownGaps: [
      { text: 'Patel', reason: plainProse('Worked closely with Priya Patel') },
    ],
  },
  {
    id: 'en-2',
    language: 'en',
    firstName: 'Emily',
    person: { lastName: 'Johnson', phone: '(512) 555-0147' },
    text: `EMILY JOHNSON
Product Designer
1450 Maple Avenue, Apt 3B, Austin, TX 78701
(512) 555-0147 · +1 512-555-0199 · emily.johnson@example.com
emilyjohnson.io · twitter.com/emjdesigns · dribbble.com/emilyj · GitHub: emjdev

SUMMARY
Emily Johnson, product designer with 7 years in B2B SaaS. Fluent in Figma, design systems and user research.

EXPERIENCE
Atlassian - Senior Product Designer, Austin, TX (Jan 2021 - Present)
Led the redesign of Jira onboarding with PM Michael Chen; usability study ran with Rachel Kim from research.
Dell Technologies - Product Designer, Round Rock, TX (2017 - 2020)
Mentored by Jessica Brown, Design Director (jessica.brown@example.com).

EDUCATION
BFA Graphic Design, The University of Texas at Austin, May 2017

References available on request.`,
    mustRemove: [
      'JOHNSON', 'Johnson', '1450 Maple Avenue', '78701', '(512) 555-0147', '+1 512-555-0199', 'emily.johnson@example.com',
      'emilyjohnson.io', 'emjdesigns', 'emilyj', 'emjdev', 'Brown', 'jessica.brown@example.com',
    ],
    mustKeep: [
      'EMILY', 'Emily', 'Atlassian', 'Austin', 'Jira', 'Dell Technologies', 'Round Rock', 'Figma', 'B2B SaaS',
      'The University of Texas at Austin', 'Jan 2021 - Present', '2017 - 2020', 'May 2017', '7 years',
    ],
    knownGaps: [
      { text: 'Chen', reason: plainProse('with PM Michael Chen') },
      { text: 'Kim', reason: plainProse('ran with Rachel Kim from research') },
    ],
  },
  {
    id: 'en-3',
    language: 'en',
    firstName: 'Daniel',
    person: { lastName: 'Tremblay' },
    text: `Daniel Tremblay - DevOps Engineer
88 Queen Street West, Toronto, ON M5H 2M9 | +1 (416) 555-0123 | dan.tremblay@example.ca
github.com/dtremblay | linkedin.com/in/daniel-tremblay-ops | Born 1992-07-14

Shopify, Toronto (2019 - present)
Platform team: Terraform, AWS, GitHub Actions, Go. Paired with Aisha Rahman on the incident tooling.
On-call rotation lead; escalations went to Mr. Kevin O'Brien, VP Infrastructure.

RBC, Toronto (2015 - 2019)
Linux administration and Ansible automation. Worked under Sophie Gagnon.

Certifications: AWS Solutions Architect (2021), CKA (2020)
SIN available on request.`,
    mustRemove: [
      'Tremblay', '88 Queen Street West', 'M5H 2M9', '+1 (416) 555-0123', 'dan.tremblay@example.ca', 'dtremblay',
      'daniel-tremblay-ops', '1992-07-14', "O'Brien", 'Gagnon',
    ],
    mustKeep: [
      'Daniel', 'Shopify', 'Toronto', 'Terraform', 'AWS', 'GitHub Actions', 'Go', 'RBC', 'Linux', 'Ansible',
      'AWS Solutions Architect', 'CKA', '2019 - present', '2015 - 2019', 'VP Infrastructure',
    ],
    knownGaps: [
      { text: 'Rahman', reason: plainProse('Paired with Aisha Rahman') },
    ],
  },
  {
    id: 'en-4',
    language: 'en',
    firstName: 'Chloe',
    person: { lastName: 'Nguyen' },
    text: `Chloe Nguyen
Registered Nurse (AHPRA registered)
12 Smith Street, Fitzroy VIC 3065 · 0412 555 019 · chloe.nguyen@example.com.au · DOB: 9 Nov 1995

Clinical experience
St Vincent's Hospital Melbourne - Registered Nurse, Emergency (2019 - present)
Triage, trauma care and graduate nurse education. Charge nurse: Grace Thompson.
Alfred Health, Melbourne - Graduate Nurse (2018 - 2019)
Rotations in ICU and cardiology; preceptor was Ms Olivia Harris.

Education
Bachelor of Nursing, Monash University, 2017

Referees
Grace Thompson, Nurse Unit Manager, St Vincent's - 0412 555 777
Dr. Liam Murphy, Emergency Physician - liam.murphy@example.com.au`,
    mustRemove: [
      'Nguyen', '12 Smith Street', '3065', '0412 555 019', 'chloe.nguyen@example.com.au', '9 Nov 1995', 'Thompson', 'Harris',
      '0412 555 777', 'Murphy', 'liam.murphy@example.com.au',
    ],
    mustKeep: [
      'Chloe', "St Vincent's Hospital Melbourne", 'Alfred Health', 'Melbourne', 'ICU', 'Monash University',
      'Bachelor of Nursing', 'Registered Nurse', '2019 - present',
    ],
    knownGaps: [],
  },
];
