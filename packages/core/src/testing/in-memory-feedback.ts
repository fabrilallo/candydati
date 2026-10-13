import type { FeedbackRequest, InterviewFeedback, StageInterviewer } from '@tt/domain';
import { ConflictError } from '../errors.js';
import type { FeedbackRequestRepository, InterviewFeedbackRepository, StageInterviewerRepository } from '../feedback-ports.js';

export interface FeedbackStoreState {
  readonly interviewers: readonly StageInterviewer[];
  readonly requests: readonly FeedbackRequest[];
  readonly feedback: readonly InterviewFeedback[];
}

/** The three feedback tables, replaced wholesale so a snapshot is just a reference. */
export interface FeedbackStore {
  read(): FeedbackStoreState;
  write(next: Partial<FeedbackStoreState>): void;
}

export const createFeedbackStore = (initial: Partial<FeedbackStoreState> = {}): FeedbackStore => {
  let state: FeedbackStoreState = { interviewers: [], requests: [], feedback: [], ...initial };
  return {
    read: () => state,
    write: (next) => {
      state = { ...state, ...next };
    },
  };
};

const oldestFirst = <T extends { createdAt: Date }>(items: readonly T[]): readonly T[] =>
  items.toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

export function createInMemoryStageInterviewers(store: FeedbackStore): StageInterviewerRepository {
  const ofJob = (organizationId: string, jobId: string) =>
    store.read().interviewers.filter((i) => i.organizationId === organizationId && i.jobId === jobId);
  return {
    async listByJob(organizationId, jobId) {
      return oldestFirst(ofJob(organizationId, jobId));
    },
    async listByStage(organizationId, jobId, stageId) {
      return oldestFirst(ofJob(organizationId, jobId).filter((i) => i.stageId === stageId));
    },
    async replaceForJob(organizationId, jobId, interviewers) {
      store.write({
        interviewers: [...store.read().interviewers.filter((i) => !(i.organizationId === organizationId && i.jobId === jobId)), ...interviewers],
      });
    },
  };
}

export function createInMemoryFeedbackRequests(store: FeedbackStore): FeedbackRequestRepository {
  const inOrg = (organizationId: string) => store.read().requests.filter((r) => r.organizationId === organizationId);
  return {
    async create(request) {
      if (store.read().requests.some((r) => r.tokenHash === request.tokenHash)) throw new ConflictError('Token already used.');
      store.write({ requests: [...store.read().requests, request] });
      return request;
    },
    async save(request) {
      store.write({ requests: store.read().requests.map((r) => (r.organizationId === request.organizationId && r.id === request.id ? request : r)) });
      return request;
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((r) => r.id === id) ?? null;
    },
    async findByTokenHash(tokenHash) {
      return store.read().requests.find((r) => r.tokenHash === tokenHash) ?? null;
    },
    async listByApplication(organizationId, applicationId) {
      return oldestFirst(inOrg(organizationId).filter((r) => r.applicationId === applicationId));
    },
    async listOpenAcrossOrganizations(now) {
      return store.read().requests.filter((r) => r.submittedAt === null && r.expiresAt > now);
    },
  };
}

export function createInMemoryInterviewFeedback(store: FeedbackStore): InterviewFeedbackRepository {
  const inOrg = (organizationId: string) => store.read().feedback.filter((f) => f.organizationId === organizationId);
  return {
    async create(feedback) {
      if (store.read().feedback.some((f) => f.requestId === feedback.requestId)) throw new ConflictError('Feedback already submitted.');
      store.write({ feedback: [...store.read().feedback, feedback] });
      return feedback;
    },
    async findByRequest(organizationId, requestId) {
      return inOrg(organizationId).find((f) => f.requestId === requestId) ?? null;
    },
    async listByApplication(organizationId, applicationId) {
      return inOrg(organizationId)
        .filter((f) => f.applicationId === applicationId)
        .toSorted((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
    },
  };
}
