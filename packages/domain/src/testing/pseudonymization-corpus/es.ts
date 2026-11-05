import { SECOND_SURNAME, plainProse } from './gaps.js';
import type { CorpusCv } from './types.js';

/**
 * Spanish CVs (Spain, Mexico, Argentina): invented people, reserved domains, fictional numbers, the example IBAN and
 * the textbook DNI/NIE of the Spanish documentation (valid check letters, nobody's number).
 */
export const SPANISH_CVS: readonly CorpusCv[] = [
  {
    id: 'es-1',
    language: 'es',
    firstName: 'Lucía',
    person: { lastName: 'García López', email: 'lucia.garcia.lopez@example.es' },
    text: `LUCÍA GARCIA LOPEZ
Ingeniera de Software
Calle de Alcalá 123, 4º B, 28009 Madrid
+34 612 345 678 · lucia.garcia.lopez@example.es · DNI: 12345678Z
Fecha de nacimiento: 15 de marzo de 1992

Experiencia profesional
2020 - actualidad. Ingeniera de Software, Cabify, Madrid
Microservicios en Go y Java sobre Kubernetes, bajo la supervisión de Dña. Carmen Ruiz.
Junto a mi compañero Javier Moreno migramos la facturación a eventos con Kafka.
2016 - 2020. Desarrolladora, Indra, Alcobendas

Formación
Grado en Ingeniería Informática, Universidad Politécnica de Madrid, 2016

Referencias
Pedro Sánchez, CTO de Cabify, pedro.sanchez@example.es`,
    mustRemove: [
      'GARCIA LOPEZ', '28009', 'Calle de Alcalá 123', '+34 612 345 678', 'lucia.garcia.lopez@example.es', '12345678Z',
      '15 de marzo de 1992', 'Ruiz', 'Moreno', 'Sánchez', 'pedro.sanchez@example.es',
    ],
    mustKeep: [
      'LUCÍA', 'Cabify', 'Madrid', 'Go', 'Java', 'Kubernetes', 'Kafka', 'Indra', 'Alcobendas', 'Universidad Politécnica de Madrid',
      '2020 - actualidad', '2016 - 2020', 'Ingeniera de Software',
    ],
    knownGaps: [],
  },
  {
    id: 'es-2',
    language: 'es',
    firstName: 'Pablo',
    person: { lastName: 'Fernández' },
    text: `Pablo Fernández
Responsable de Ventas
C/ Mayor, 12, 3º 2ª, 08002 Barcelona
Tel. 93 555 01 23 / 655 501 234 · pfernandez@example.com · twitter.com/pablofdz_ventas
NIE: X1234567L · Nacido el 8/11/1985

Experiencia
2018 - hoy: Responsable de Ventas, Glovo, Barcelona. Equipo de 9 comerciales.
Reporto directamente a Marta Jiménez, directora comercial.
2010 - 2018: Comercial, Seat, Martorell. Trabajé con Jordi Puig en la red de concesionarios.

Formación: Licenciatura en ADE, ESADE, 2009
Idiomas: catalán, inglés (B2)
IBAN: ES91 2100 0418 4502 0005 1332`,
    mustRemove: [
      'Fernández', 'C/ Mayor, 12', '08002', '93 555 01 23', '655 501 234', 'pfernandez@example.com', 'pablofdz_ventas', 'X1234567L',
      '8/11/1985', 'Jiménez', 'ES91 2100 0418 4502 0005 1332',
    ],
    mustKeep: [
      'Pablo', 'Responsable de Ventas', 'Glovo', 'Barcelona', 'Seat', 'Martorell', 'ESADE', 'ADE', '2018 - hoy', '2010 - 2018',
      '9 comerciales', 'directora comercial',
    ],
    knownGaps: [
      { text: 'Puig', reason: plainProse('Trabajé con Jordi Puig') },
    ],
  },
  {
    id: 'es-3',
    language: 'es',
    firstName: 'Andrea',
    person: { lastName: 'Hernández' },
    text: `Andrea Hernández Ortega
Analista Financiera
Av. Insurgentes Sur 1602, Col. Crédito Constructor, 03940 Ciudad de México
Cel. +52 55 5555 0123 | andrea.hdz@example.mx | RFC: HEOA920315AB1
LinkedIn: in/andrea-hernandez-fin

Experiencia
2019 - presente | Analista Financiera Sr., BBVA México, CDMX
Modelos de riesgo en Python y SQL. Colaboro con el Lic. Ricardo Torres en los reportes trimestrales.
2015 - 2019 | Analista, Grupo Bimbo, CDMX. Mi jefa era Verónica Castillo.

Educación
Licenciatura en Actuaría, UNAM, 2015

Referencias
Lic. Gabriela Mendoza - gabriela.mendoza@example.mx`,
    mustRemove: [
      'Hernández', 'Insurgentes Sur 1602', '03940', '+52 55 5555 0123', 'andrea.hdz@example.mx', 'HEOA920315AB1',
      'andrea-hernandez-fin', 'Torres', 'Castillo', 'Mendoza', 'gabriela.mendoza@example.mx',
    ],
    mustKeep: [
      'Andrea', 'Analista Financiera', 'BBVA México', 'CDMX', 'Python', 'SQL', 'Grupo Bimbo', 'UNAM', 'Licenciatura en Actuaría',
      '2019 - presente', '2015 - 2019',
    ],
    knownGaps: [
      { text: 'Ortega', reason: SECOND_SURNAME },
    ],
  },
  {
    id: 'es-4',
    language: 'es',
    firstName: 'Martín',
    person: { lastName: 'Rodríguez' },
    text: `Martín Rodríguez - Desarrollador Frontend
Av. Corrientes 1234, piso 5, C1043 CABA, Buenos Aires
+54 9 11 5555-0123 · martin.rodriguez@example.com.ar · martinrodriguez.com.ar
DNI 30.123.456 · Fecha de nacimiento: 22/04/1990

Experiencia
2020 - actualidad: Frontend Developer, Mercado Libre, Buenos Aires
React, TypeScript y Next.js. Lidero el equipo de checkout con Sofía Gómez.
2016 - 2020: Desarrollador, Globant, La Plata. Mi mentor fue el Ing. Diego Fernández.

Educación: Ingeniería en Sistemas, UTN, 2016
GitHub: martinrdz · Discord: martinrdz#4821`,
    mustRemove: [
      'Rodríguez', 'Av. Corrientes 1234', 'C1043', '+54 9 11 5555-0123', '5555-0123', 'martin.rodriguez@example.com.ar',
      'martinrodriguez.com.ar', '30.123.456', '22/04/1990', 'Fernández', 'martinrdz',
    ],
    mustKeep: [
      'Martín', 'Mercado Libre', 'Buenos Aires', 'React', 'TypeScript', 'Next.js', 'Globant', 'La Plata', 'UTN',
      'Ingeniería en Sistemas', '2020 - actualidad', '2016 - 2020', 'checkout',
    ],
    knownGaps: [
      { text: 'Gómez', reason: plainProse('con Sofía Gómez') },
    ],
  },
];
