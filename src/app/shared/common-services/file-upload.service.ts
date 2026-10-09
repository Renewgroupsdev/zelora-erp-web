import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from './api-route-constants';

/**
 * Module folders the backend accepts on POST /uploads/{folder} (config/uploads.php `direct_folders`) - for
 * screens whose records are not on the API yet. The file is stored on the server and the screen keeps its URL.
 */
export type UploadFolder = 'branch_photo' | 'franchise_photo' | 'appointment_clinical' | 'candidate_document';

export interface UploadedFile {
  url: string;
  fileName: string;
  mime: string;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class FileUploadService {
  private readonly api = inject(ApiDataService);

  upload(folder: UploadFolder, file: Blob, fileName = (file as File).name || 'upload'): Observable<UploadedFile> {
    const form = new FormData();
    form.append('file', file, fileName);
    return (this.api.POST(`${ApiRoutesConstants.UPLOADS}/${folder}`, form) as Observable<any>).pipe(
      map(res => ({ url: res.data.url, fileName: res.data.file_name, mime: res.data.mime, size: res.data.size })),
    );
  }

  /** Best-effort delete of a server file; data URLs from before uploads went to the server are ignored. */
  remove(folder: UploadFolder, url: string | null | undefined): void {
    if (!url || !isServerUrl(url)) return;
    (this.api.Delete(`${ApiRoutesConstants.UPLOADS}/${folder}`, { url }) as Observable<unknown>).pipe(catchError(() => of(null))).subscribe();
  }

  /** Tracks the files uploaded while a form is open so replaced / unused ones are deleted on save or cancel. */
  draft(folder: UploadFolder, original: (string | null | undefined)[] = []): UploadDraft {
    return new UploadDraft(this, folder, original);
  }
}

export class UploadDraft {
  private readonly added = new Set<string>();

  constructor(private readonly uploads: FileUploadService, private readonly folder: UploadFolder, private readonly original: (string | null | undefined)[]) {}

  track(url: string): void {
    this.added.add(url);
  }

  /** After a successful save: delete originals that were replaced / removed and uploads that were not kept. */
  commit(kept: (string | null | undefined)[]): void {
    const keep = new Set(kept.filter(Boolean));
    for (const url of new Set([...this.original, ...this.added])) {
      if (url && !keep.has(url)) this.uploads.remove(this.folder, url);
    }
    this.added.clear();
  }

  /** Form cancelled: delete everything uploaded during this edit (the saved record still points at the originals). */
  discard(): void {
    this.added.forEach(url => this.uploads.remove(this.folder, url));
    this.added.clear();
  }
}

export function isServerUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** First validation message from a failed upload, else the API message. */
export function uploadError(err: any, fallback = 'Upload failed. Please try again.'): string {
  const errors = err?.error?.errors;
  const first = errors ? (Object.values(errors)[0] as string[] | undefined)?.[0] : null;
  return first || err?.error?.message || fallback;
}
