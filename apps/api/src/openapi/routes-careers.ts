import { careersDraftSaveSchema, careersPublishSchema, MEDIA_LIMITS } from '@tt/domain';
import { z } from 'zod';
import { idResult, type RouteSpec } from './spec.js';

const PERMISSION = 'careers_page:manage';
const TAG = 'Careers page';

const uploadBody = z.object({
  file: z.string().meta({ format: 'binary' }).describe('The image (JPEG, PNG, WebP, AVIF) or video (MP4, WebM).'),
  'alt.it': z.string().max(MEDIA_LIMITS.altMax).optional().describe('Description in Italian. Required (in at least one language) for an image.'),
  'alt.en': z.string().max(MEDIA_LIMITS.altMax).optional().describe('Description in English.'),
});

export const careersRoutes: readonly RouteSpec[] = [
  {
    method: 'get', path: '/api/v1/careers-page', tag: TAG, summary: 'The careers page being edited', scope: PERMISSION, sessionOnly: true,
    description: 'The draft, and whether it differs from what visitors see. An organization that never saved gets the default page (`isDefault`).',
    response: { schema: 'CareersPageEditor' },
  },
  {
    method: 'put', path: '/api/v1/careers-page/draft', tag: TAG, summary: 'Save the draft', scope: PERMISSION, sessionOnly: true,
    description: 'Replaces the draft with `document`. `revision` is the one the editor loaded: when someone saved meanwhile the answer is 409 `stale_revision` and nothing is written. Visitors do not see the draft until it is published. Media are referenced by id, never by URL.',
    body: careersDraftSaveSchema, response: { schema: 'CareersPageEditor' },
  },
  {
    method: 'post', path: '/api/v1/careers-page/publish', tag: TAG, summary: 'Publish the draft', scope: PERMISSION, sessionOnly: true,
    description: '`revision` must be the current one (409 `stale_revision` otherwise), so nobody publishes a draft they have not seen.',
    body: careersPublishSchema, response: { schema: 'CareersPageEditor' },
  },
  { method: 'get', path: '/api/v1/careers-page/media', tag: TAG, summary: 'The media library', scope: PERMISSION, sessionOnly: true, response: { schema: 'CareersMediaAsset', list: true } },
  {
    method: 'post', path: '/api/v1/careers-page/media', tag: TAG, summary: 'Upload an image or a video', scope: PERMISSION, sessionOnly: true, status: 201, multipart: true,
    description: 'One `file` (images up to 8 MB, videos up to 60 MB) and the optional fields `alt.it` / `alt.en`. The type is decided from the content, never the name. Images are re-encoded as WebP in several widths and lose every metadata block (EXIF, GPS, XMP); videos are stored as uploaded. Refusals are 422 with an issue on `file`: `unsupported_type`, `too_large`, `empty`, `alt_required`, `image_unreadable`, `image_too_big`, `library_full`.',
    body: uploadBody, response: { schema: 'CareersMediaAsset' },
  },
  {
    method: 'get', path: '/api/v1/careers-page/media/:id/files/:fileName', tag: TAG, summary: 'A file of the media library', scope: PERMISSION, sessionOnly: true, fileMediaType: 'application/octet-stream',
    description: 'For the editor (thumbnails, draft preview): any file of the library, `Cache-Control: private`. Byte ranges for videos (206, 416). Visitors read only the files of the published page, through the public route.',
    response: { schema: z.string() },
  },
  {
    method: 'delete', path: '/api/v1/careers-page/media/:id', tag: TAG, summary: 'Delete a media file', scope: PERMISSION, sessionOnly: true,
    description: 'Refused with 422 (`in_published_page`, `in_draft`) while the published page or the draft uses it.',
    response: { schema: idResult },
  },
];
