import { POSTAL_WITHOUT_STREET, STREET_WITHOUT_TYPE, plainProse } from './gaps.js';
import type { CorpusCv } from './types.js';

/** German CVs (Germany, Austria, Switzerland): invented people, reserved domains, fictional numbers, example IBAN. */
export const GERMAN_CVS: readonly CorpusCv[] = [
  {
    id: 'de-1',
    language: 'de',
    firstName: 'Lukas',
    person: { lastName: 'Müller', email: 'lukas.mueller@example.de' },
    text: `LEBENSLAUF
Lukas MÜLLER
Hauptstraße 12, 10115 Berlin
Telefon: +49 30 5550 1234 · Mobil: 0151 5550 1234
E-Mail: lukas.mueller@example.de · xing.com/profile/Lukas_Mueller · github.com/lmueller
Geburtsdatum: 12.03.1990 · Geburtsort: Hamburg
Lukas Müller, Backend-Entwickler mit zehn Jahren Erfahrung.

Berufserfahrung
04/2019 - heute  Senior Backend-Entwickler, Zalando SE, Berlin
Microservices in Java und Go, Betrieb auf Kubernetes. Unter der Leitung von Frau Dr. Anna Schmidt.
Zusammen mit Jonas Weber Einführung von Event-Sourcing mit Kafka.
2014 - 2019  Softwareentwickler, SAP SE, Walldorf

Ausbildung
2008 - 2014  M.Sc. Informatik, Technische Universität München

Kenntnisse
Java, Go, Kotlin, PostgreSQL, Englisch (verhandlungssicher)

Referenzen
Stefan Wagner, Teamleiter, Zalando SE, Tel. 030 5550 9876`,
    mustRemove: [
      'MÜLLER', 'Müller', 'Mueller', 'Hauptstraße 12', '10115', '+49 30 5550 1234', '0151 5550 1234', 'lukas.mueller@example.de',
      'Lukas_Mueller', 'lmueller', '12.03.1990', 'Schmidt', 'Wagner', '030 5550 9876',
    ],
    mustKeep: [
      'Lukas', 'Zalando SE', 'Berlin', 'Java', 'Go', 'Kubernetes', 'Kafka', 'SAP SE', 'Walldorf', 'Technische Universität München',
      'M.Sc. Informatik', '04/2019 - heute', '2014 - 2019', 'Kotlin', 'PostgreSQL', 'Senior Backend-Entwickler',
    ],
    knownGaps: [
      { text: 'Weber', reason: plainProse('Zusammen mit Jonas Weber') },
    ],
  },
  {
    id: 'de-2',
    language: 'de',
    firstName: 'Anna',
    person: { lastName: 'Schneider' },
    text: `Anna Schneider
Projektmanagerin Logistik
Leopoldstr. 45a, 80802 München
Tel.: +49 (0)89 5550 4321 | anna.schneider@example.de
geb. am 7. Juli 1988 in Augsburg, Familienstand: ledig

Beruflicher Werdegang
seit 2018: Projektmanagerin, DHL Supply Chain, München
Einführung eines Lagerverwaltungssystems (SAP EWM) an 4 Standorten. Betreut von Herrn Markus Hoffmann.
Mit meiner Kollegin Laura Becker habe ich die Schulungen für 200 Mitarbeitende organisiert.
2012 - 2018: Disponentin, Dachser, Kempten

Ausbildung
Bachelor Logistikmanagement, Hochschule Kempten, 2012

Bankverbindung: DE89 3704 0044 0532 0130 00`,
    mustRemove: [
      'Schneider', 'Leopoldstr. 45a', '80802', '+49 (0)89 5550 4321', '5550 4321', 'anna.schneider@example.de', '7. Juli 1988',
      'Hoffmann', 'Becker', 'DE89 3704 0044 0532 0130 00',
    ],
    mustKeep: [
      'Anna', 'Projektmanagerin', 'DHL Supply Chain', 'München', 'SAP EWM', 'Dachser', 'Kempten', 'Hochschule Kempten', 'Augsburg',
      'seit 2018', '2012 - 2018', '4 Standorten', '200 Mitarbeitende', 'Familienstand',
    ],
    knownGaps: [],
  },
  {
    id: 'de-3',
    language: 'de',
    firstName: 'Felix',
    person: { lastName: 'Gruber' },
    text: `Felix Gruber - UX Designer
Mariahilfer Straße 88/5, 1060 Wien
+43 664 5550123 · felix.gruber@example.at · felixgruber.at · Behance: behance.net/fgruber
Geboren am 1990-11-23

Erfahrung
2021 - heute: Lead UX Designer, Bitpanda, Wien. Zusammenarbeit mit Katharina Huber (Produkt) und Mag. Thomas Bauer.
2016 - 2021: UX Designer, Raiffeisen Bank International, Wien.

Ausbildung: BA Informationsdesign, FH JOANNEUM Graz, 2016
Tools: Figma, Sketch, Adobe XD, HTML/CSS`,
    mustRemove: [
      'Gruber', 'Mariahilfer Straße 88/5', '1060 Wien', '+43 664 5550123', 'felix.gruber@example.at', 'felixgruber.at', 'fgruber',
      '1990-11-23', 'Bauer',
    ],
    mustKeep: [
      'Felix', 'Bitpanda', 'Wien', 'Raiffeisen Bank International', 'FH JOANNEUM Graz', 'Figma', 'Sketch', 'Adobe XD', 'HTML/CSS',
      '2021 - heute', '2016 - 2021', 'Lead UX Designer',
    ],
    knownGaps: [
      { text: 'Huber', reason: plainProse('Zusammenarbeit mit Katharina Huber') },
    ],
  },
  {
    id: 'de-4',
    language: 'de',
    firstName: 'Jan',
    person: { lastName: 'Schäfer' },
    text: `Jan Schäfer
Elektroniker für Betriebstechnik
Am Sandtorkai 5, 20457 Hamburg
Handy: 0170 5550 7788 · E-Mail: jan.schaefer@example.de
Geburtsdatum: 05.08.1996

Berufserfahrung
seit 2020  Elektroniker, Airbus, Hamburg-Finkenwerder
Wartung von Fertigungsanlagen, SPS-Programmierung (Siemens S7). Mein Meister Klaus Richter hat mich zum Vorarbeiter vorgeschlagen.
2016 - 2020  Ausbildung, Hamburger Hochbahn AG

Weiterbildung: Techniker Elektrotechnik (berufsbegleitend, seit 2023)
Führerschein Klasse B, Staplerschein
Zeugnisse ausgestellt auf Jan Schaefer (ohne Umlaut).`,
    mustRemove: [
      'Schäfer', 'Schaefer', '0170 5550 7788', 'jan.schaefer@example.de', '05.08.1996',
    ],
    mustKeep: [
      'Jan', 'Airbus', 'Hamburg-Finkenwerder', 'Siemens S7', 'Hamburger Hochbahn AG', 'Elektroniker', 'seit 2020', '2016 - 2020',
      'Techniker Elektrotechnik', 'Klasse B',
    ],
    knownGaps: [
      { text: 'Am Sandtorkai 5', reason: STREET_WITHOUT_TYPE },
      { text: '20457', reason: POSTAL_WITHOUT_STREET },
      { text: 'Richter', reason: plainProse('Mein Meister Klaus Richter') },
    ],
  },
];
