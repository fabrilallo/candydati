import { plainProse } from './gaps.js';
import type { CorpusCv } from './types.js';

/** French CVs (France, Switzerland, Belgium): invented people, reserved domains, fictional numbers. */
export const FRENCH_CVS: readonly CorpusCv[] = [
  {
    id: 'fr-1',
    language: 'fr',
    firstName: 'Camille',
    person: { lastName: 'Lefebvre', email: 'camille.lefebvre@example.fr' },
    text: `Camille LEFEBVRE
Développeuse Full-Stack
12 rue des Lilas, 75011 Paris
06 12 34 56 78 / +33 6 98 76 54 32
camille.lefebvre@example.fr
malt.fr/profile/camillelefebvre - camillelefebvre.fr
Née le 4 avril 1992
Camille Lefebvre, sept ans de développement web.

EXPÉRIENCES PROFESSIONNELLES
Depuis 2021 - Développeuse Full-Stack, Doctolib, Paris
Développement de l'agenda en Ruby on Rails et Vue.js, sous la direction de Mme Isabelle Moreau.
Avec mon collègue Julien Petit, refonte de l'API de prise de rendez-vous.
2017 - 2021 - Développeuse Web, Capgemini, Nantes

FORMATION
Diplôme d'ingénieur, INSA Lyon, 2017

COMPÉTENCES
Ruby, Vue.js, TypeScript, PostgreSQL, Docker, anglais courant

Références
Nicolas Garnier, CTO chez Doctolib, nicolas.garnier@example.fr`,
    mustRemove: [
      'LEFEBVRE', 'Lefebvre', '12 rue des Lilas', '75011', '06 12 34 56 78', '+33 6 98 76 54 32', '98 76 54 32',
      'camille.lefebvre@example.fr', 'camillelefebvre', '4 avril 1992', 'Moreau', 'Petit', 'Garnier', 'nicolas.garnier@example.fr',
    ],
    mustKeep: [
      'Camille', 'Doctolib', 'Paris', 'Capgemini', 'Nantes', 'Ruby on Rails', 'Vue.js', 'TypeScript', 'PostgreSQL', 'Docker',
      'INSA Lyon', 'Depuis 2021', '2017 - 2021', 'Développeuse Full-Stack',
    ],
    knownGaps: [],
  },
  {
    id: 'fr-2',
    language: 'fr',
    firstName: 'Jean-Baptiste',
    person: { lastName: 'Dubois' },
    text: `Jean-Baptiste Dubois - Consultant SAP indépendant
45 bis avenue Jean Jaurès, 69007 Lyon
Tél. : 04 78 55 01 23 - Mobile : +33 (0)7 55 50 12 34
jb.dubois@example.org - fr.linkedin.com/in/jbdubois - Twitter : @jbdubois_sap
SIRET 123 456 789 00012 - N° TVA : FR12345678901
Né le 17 septembre 1984 à Grenoble

Missions
2020 - 2024 : Consultant SAP FI/CO pour Michelin et Renault, Clermont-Ferrand.
En binôme avec M. Thomas Girard, chef de projet, sur le déploiement S/4HANA.
2012 - 2020 : Consultant chez Sopra Steria, Lyon. Encadré par Marie Fournier.

Formation : Master Finance, Grenoble École de Management, 2008

Langues : anglais (C1), allemand (B1)`,
    mustRemove: [
      'Dubois', '45 bis avenue Jean Jaurès', '69007', '04 78 55 01 23', '+33 (0)7 55 50 12 34', '55 50 12 34', 'jb.dubois@example.org',
      'jbdubois', '123 456 789 00012', 'FR12345678901', '17 septembre 1984', 'Girard', 'Fournier',
    ],
    mustKeep: [
      'Jean-Baptiste', 'SAP', 'Michelin', 'Renault', 'Clermont-Ferrand', 'S/4HANA', 'Sopra Steria', 'Lyon', 'Grenoble École de Management',
      'Master Finance', '2020 - 2024', '2012 - 2020', 'chef de projet', 'anglais (C1)',
    ],
    knownGaps: [],
  },
  {
    id: 'fr-3',
    language: 'fr',
    firstName: 'Léa',
    person: { lastName: 'Rochat' },
    text: `Léa Rochat
Ingénieure Data
Chemin des Vignes 8, 1004 Lausanne
+41 79 555 01 23 · lea.rochat@example.ch · github.com/learochat
Date de naissance : 12.06.1994 · Nationalité : suisse
N° AVS : 756.1234.5678.97

Expérience
2020 - aujourd'hui : Ingénieure Data, Nestlé, Vevey
Pipelines Spark et dbt, modèles de prévision en Python. Je travaille avec Mathieu Favre et Chloé Bonvin.
2018 - 2020 : Analyste, Swisscom, Berne. Stage encadré par le Dr Pierre Muller.

Formation
Master en science des données, EPFL, 2018

Références
Sur demande.`,
    mustRemove: [
      'Rochat', 'Chemin des Vignes 8', '1004 Lausanne', '+41 79 555 01 23', 'lea.rochat@example.ch', 'learochat', '12.06.1994',
      '756.1234.5678.97', 'Muller',
    ],
    mustKeep: [
      'Léa', 'Ingénieure Data', 'Nestlé', 'Vevey', 'Spark', 'dbt', 'Python', 'Swisscom', 'Berne', 'EPFL',
      "2020 - aujourd'hui", '2018 - 2020', 'Master en science des données',
    ],
    knownGaps: [
      { text: 'Favre', reason: plainProse('Je travaille avec Mathieu Favre et Chloé Bonvin') },
      { text: 'Bonvin', reason: plainProse('Je travaille avec Mathieu Favre et Chloé Bonvin') },
    ],
  },
  {
    id: 'fr-4',
    language: 'fr',
    firstName: 'Hugo',
    person: { lastName: 'Lambert' },
    text: `HUGO LAMBERT
Chef de projet marketing
Rue de la Loi 160, 1040 Bruxelles · +32 470 55 01 23 · hugo.lambert@example.be
Site : hugolambert.be · Instagram : @hugo.lmbt · Permis B
Date de naissance : 30/01/1989
Hugo Lambert, dix ans de marketing dans les télécoms.

Parcours
Depuis 2019 : Chef de projet, Proximus, Bruxelles. Lancement de l'offre fibre avec l'agence de Sarah Peeters.
J'ai remplacé Kevin Janssens à la tête de l'équipe digitale (6 personnes).
2013 - 2019 : Chargé de communication, Delhaize, Anvers.

Formation : Master en communication, Université libre de Bruxelles (ULB), 2012

Références :
Mme Anne Dumont - anne.dumont@example.be`,
    mustRemove: [
      'LAMBERT', 'Lambert', 'Rue de la Loi 160', '1040 Bruxelles', '+32 470 55 01 23', 'hugo.lambert@example.be', 'hugolambert.be',
      '@hugo.lmbt', '30/01/1989', 'Dumont', 'anne.dumont@example.be',
    ],
    mustKeep: [
      'HUGO', 'Hugo', 'Proximus', 'Bruxelles', 'Delhaize', 'Anvers', 'Université libre de Bruxelles', 'ULB', 'Depuis 2019',
      '2013 - 2019', 'Chef de projet', '6 personnes',
    ],
    knownGaps: [
      { text: 'Peeters', reason: plainProse("l'agence de Sarah Peeters") },
      { text: 'Janssens', reason: plainProse("J'ai remplacé Kevin Janssens") },
    ],
  },
];
