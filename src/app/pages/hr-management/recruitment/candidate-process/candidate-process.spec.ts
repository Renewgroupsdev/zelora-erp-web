import { CandidateProcess } from './candidate-process';

describe('CandidateProcess', () => {
  // Built by its opener from the candidate list held by HrService, so the dialog cannot be created without seeded data.
  it('should be defined', () => {
    expect(CandidateProcess).toBeDefined();
  });
});
