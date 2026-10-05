import { Candidate, CandidateOffer, ManpowerRequest, salaryBreakup, structureFromGross } from '../../../shared/models/hr.model';
import { escapeHtml, printDocument } from '../../../shared/utils/export.util';
import { displayDate, inr } from '../../../shared/utils/format.util';

const esc = escapeHtml;

/** Prints / saves the offer letter as PDF. Design stage: built on the client - generate it on the backend once templates are managed there. */
export function downloadOfferLetter(c: Candidate, offer: CandidateOffer, vacancy?: ManpowerRequest): void {
  const pay = salaryBreakup(structureFromGross(offer.monthlyGross));
  const structure = structureFromGross(offer.monthlyGross);
  const designation = vacancy?.designation ?? 'the position';

  printDocument(`Offer Letter ${offer.offerNo}`, `
    <div class="doc-head">
      <div><h1>Renew Plus Hair and Skin Care Pvt Ltd</h1><p>Human Resources</p></div>
      <div class="doc-meta"><h2>OFFER OF EMPLOYMENT</h2><p>Ref: ${esc(offer.offerNo)}</p><p>Date: ${esc(displayDate(offer.releasedAt))}</p></div>
    </div>

    <p style="margin-top:16px">Dear <strong>${esc(c.name)}</strong>,</p>
    <p>We are pleased to offer you the position of <strong>${esc(designation)}</strong>${vacancy ? ` at our <strong>${esc(vacancy.branch)}</strong> branch (${esc(vacancy.department)})` : ''}
      on a <strong>${esc(vacancy?.employmentType ?? 'Full Time')}</strong> basis, following your interview and successful background verification.</p>

    <div class="doc-parties">
      <div><small>Date of Joining</small><strong>${esc(displayDate(offer.joiningDate))}</strong></div>
      <div><small>Monthly Gross</small><strong>${esc(inr(offer.monthlyGross))}</strong></div>
      <div><small>Annual CTC</small><strong>${esc(inr(pay.annualCtc))}</strong></div>
    </div>

    <table>
      <thead><tr><th>Salary Component (monthly)</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>
        <tr><td>Basic</td><td style="text-align:right">${esc(inr(structure.basic))}</td></tr>
        <tr><td>House Rent Allowance</td><td style="text-align:right">${esc(inr(structure.hra))}</td></tr>
        <tr><td>Conveyance</td><td style="text-align:right">${esc(inr(structure.conveyance))}</td></tr>
        <tr><td>Special Allowance</td><td style="text-align:right">${esc(inr(structure.special))}</td></tr>
        <tr><td><strong>Gross</strong></td><td style="text-align:right"><strong>${esc(inr(pay.gross))}</strong></td></tr>
      </tbody>
    </table>

    <p>This offer is valid until <strong>${esc(displayDate(offer.validUntil))}</strong>. Please sign and return a copy of this letter to confirm your acceptance.
      On joining, please carry the originals of the documents you submitted for verification.</p>

    <div class="doc-sign"><span>Authorised Signatory (HR)</span><span>Candidate Signature &amp; Date</span></div>
    <p class="doc-footer">Released by ${esc(offer.releasedBy)} · ${esc(offer.offerNo)}</p>
  `);
}
