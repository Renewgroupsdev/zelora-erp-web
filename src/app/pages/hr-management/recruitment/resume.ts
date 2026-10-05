import { Candidate, ManpowerRequest } from '../../../shared/models/hr.model';
import { downloadExcel, escapeHtml, fileStamp, printDocument } from '../../../shared/utils/export.util';
import { displayDate } from '../../../shared/utils/format.util';

const esc = escapeHtml;

/**
 * Downloads the candidate's resume as a PDF. Design stage: built from the portal profile fields -
 * once the portal APIs are connected, stream the original resume file from the backend instead.
 */
export function downloadResume(c: Candidate, vacancy?: ManpowerRequest): void {
  printDocument(c.resumeFile.replace(/\.pdf$/i, ''), `
    <div class="doc-head">
      <div><h1>${esc(c.name)}</h1><p>${esc(c.email)} · ${esc(c.phone)} · ${esc(c.location)}</p>${c.profileUrl ? `<p>${esc(c.profileUrl)}</p>` : ''}</div>
      <div class="doc-meta"><h2>RESUME</h2><p>Source: ${esc(c.source)}</p><p>Applied ${esc(displayDate(c.appliedAt))}</p></div>
    </div>
    <div class="doc-parties">
      <div><small>Applied For</small><strong>${esc(vacancy?.designation ?? '-')}</strong><br />${esc(vacancy?.branch ?? '')}</div>
      <div><small>Experience</small><strong>${c.experienceYears} years</strong><br />${esc(c.currentCompany)}</div>
      <div><small>CTC (monthly)</small>Current ₹${c.currentCtc.toLocaleString('en-IN')}<br />Expected ₹${c.expectedCtc.toLocaleString('en-IN')} · Notice ${c.noticeDays} days</div>
    </div>
    <table><tbody>
      <tr><td><small class="doc-label">Key Skills</small>${esc(c.skills || '-')}</td></tr>
      <tr><td><small class="doc-label">Education</small>${esc(c.education)}</td></tr>
      <tr><td><small class="doc-label">Recruiter Notes</small>${esc(c.notes || '-')}</td></tr>
    </tbody></table>
    <p class="doc-footer">Profile imported from ${esc(c.source)} into Renew Plus ERP · ${esc(c.resumeFile)}</p>
  `);
}

export function exportCandidates(list: Candidate[], vacancyName: (id: string) => string, name = 'candidates'): void {
  downloadExcel(`${name}-${fileStamp()}`, [{
    name: 'Candidates',
    columns: [
      { header: 'Name', key: 'name' }, { header: 'Vacancy', key: 'vacancy' }, { header: 'Source', key: 'source' }, { header: 'Profile URL', key: 'profileUrl' },
      { header: 'Email', key: 'email' }, { header: 'Mobile', key: 'phone' }, { header: 'Location', key: 'location' }, { header: 'Experience (yrs)', key: 'experienceYears' },
      { header: 'Current Company', key: 'currentCompany' }, { header: 'Current CTC', key: 'currentCtc' }, { header: 'Expected CTC', key: 'expectedCtc' },
      { header: 'Notice (days)', key: 'noticeDays' }, { header: 'Education', key: 'education' }, { header: 'Stage', key: 'stage' }, { header: 'Rating', key: 'rating' },
      { header: 'Applied On', key: 'appliedOn' }, { header: 'Resume', key: 'resumeFile' },
    ],
    rows: list.map(c => ({ ...c, vacancy: vacancyName(c.vacancyId), appliedOn: c.appliedAt.slice(0, 10) })),
  }]);
}
