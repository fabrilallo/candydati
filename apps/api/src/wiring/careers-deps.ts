import { createHash, randomUUID } from 'node:crypto';
import type { CareersDeps, DrizzleUnitOfWork, FileStorage, ImageTranscoder, PublicCareersDeps, TaskQueue } from '@candydati/core';
import { createSharpImageTranscoder } from '@candydati/providers';
import type { Locale } from '@candydati/domain';

export interface CareersWiring {
  /** The page builder and its media library (owners and admins, session only). */
  readonly careersDeps: CareersDeps;
  /** The visitors' reads: the published page and its media files. */
  readonly publicCareersDeps: PublicCareersDeps;
}

export interface CareersInputs {
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
  readonly defaultLocale: Locale;
  /** Test seam: sharp by default. */
  readonly images?: ImageTranscoder | undefined;
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Page and media rows on Postgres, files in the object storage, images re-encoded by sharp. */
export function createCareersDeps({ uow, files, queue, defaultLocale, images }: CareersInputs): CareersWiring {
  const r = uow.repositories;
  const careersDeps: CareersDeps = {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    jobTeams: r.jobTeams,
    careersPages: r.careersPages,
    careersMedia: r.careersMedia,
    organizationLogos: r.organizationLogos,
    organizations: r.organizations,
    files,
    queue,
    images: images ?? createSharpImageTranscoder(),
    sha256,
    defaultLocale,
    newId: randomUUID,
    now: () => new Date(),
  };
  const { careersPages, careersMedia, organizationLogos, organizations } = careersDeps;
  return { careersDeps, publicCareersDeps: { careersPages, careersMedia, organizationLogos, organizations, files, defaultLocale } };
}
