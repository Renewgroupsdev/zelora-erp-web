/** Everything the branch QR-code landing page needs to render, embedded directly in the QR
 *  itself so scanning it never depends on the scanning device reaching our API (a phone on
 *  another network - or just plain "localhost" - can't hit the backend, but it can always
 *  read what's encoded in the code). */
export interface BranchQrPayload {
  id: number;
  type: string | null;
  name: string;
  code: string;
  address: string | null;
  pincode: string | null;
  phone_no: string | null;
  email: string | null;
  gst_number: string | null;
  description: string | null;
  status: number;
  playstore_url: string | null;
  appstore_url: string | null;
}

export function encodeBranchQrPayload(payload: BranchQrPayload): string {
  return encodeURIComponent(JSON.stringify(payload));
}

export function decodeBranchQrPayload(encoded: string): BranchQrPayload | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(encoded));
    if (!parsed || typeof parsed !== 'object' || !parsed.name) {
      return null;
    }
    return parsed as BranchQrPayload;
  } catch {
    return null;
  }
}
